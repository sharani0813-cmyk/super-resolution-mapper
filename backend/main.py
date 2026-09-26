import modal
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import uuid
import base64
from io import BytesIO
from PIL import Image
import numpy as np

import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from pystac_client import Client

from utils.geo_helpers import get_metadata, read_geotiff, slice_into_patches, stitch_patches, save_geotiff
from core.model import SatelliteSuperRes, compute_psnr, compute_ssim

modal_app = modal.App("srm-backend")

# Shared Volume to pass files between the GPU inference container and the web container
vol = modal.Volume.from_name("srm-outputs", create_if_missing=True)

# Image definition with baked-in PyTorch dependencies and pre-downloaded weights
image = (
    modal.Image.debian_slim()
    .pip_install(
        "fastapi[standard]", 
        "rasterio", 
        "numpy", 
        "torch", 
        "torchvision", 
        "python-multipart",
        "pillow",
        "pystac-client"
    )
    .run_commands([
        "apt-get update && apt-get install -y wget",
        "wget -O /RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
    ])
)

app = FastAPI(title="SRM Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

# Ensure the mount point exists in the web container
os.makedirs("/outputs", exist_ok=True)
app.mount("/api/outputs", StaticFiles(directory="/outputs"), name="outputs")

class BboxPayload(BaseModel):
    bbox: list[float]

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Server is running"}

@app.get("/api/download/{filename}")
def download_file(filename: str):
    file_path = os.path.join("/outputs", filename)
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=f"enhanced_{filename}")
    return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)

# Dedicated GPU Inference Class
@modal_app.cls(image=image, gpu="T4", volumes={"/outputs": vol})
class ModelInference:
    @modal.enter()
    def load_model(self):
        print("Initializing RRDBNet on T4 GPU...")
        os.environ["MODEL_WEIGHTS_PATH"] = "/RealESRGAN_x4plus.pth"
        self.model = SatelliteSuperRes(device="cuda")

    @modal.method()
    def process_image_pipeline(self, image_data: np.ndarray, file_id: str, profile: dict = None, is_geotiff: bool = True, output_ext: str = '.tif'):
        output_path = f"/outputs/{file_id}_hr{output_ext}"
        
        if image_data.shape[0] > 3:
            image_data = image_data[:3]
        elif image_data.shape[0] == 1:
            image_data = np.repeat(image_data, 3, axis=0)

        original_shape = image_data.shape
        patch_size = 256
        overlap = 32
        
        patches, positions = slice_into_patches(image_data, patch_size=patch_size, overlap=overlap)
        
        hr_patches = []
        for p in patches:
            hr_p = self.model.upscale_patch(p)
            hr_patches.append(hr_p)
            
        stitched = stitch_patches(hr_patches, positions, original_shape, patch_size, overlap, scale_factor=4)
        
        if is_geotiff and profile is not None:
            save_geotiff(output_path, stitched, profile, scale_factor=4)
        else:
            out_img = Image.fromarray(stitched.transpose(1, 2, 0))
            out_img.save(output_path)
            
        # Commit the file to the Modal Volume so the ASGI app can serve it
        vol.commit()
            
        baseline = self.model.get_baseline_bicubic(image_data)
        psnr = compute_psnr(baseline, stitched)
        ssim = compute_ssim(baseline, stitched)
        
        preview_img = Image.fromarray(stitched.transpose(1, 2, 0))
        preview_img.thumbnail((512, 512))
        buffered = BytesIO()
        preview_img.save(buffered, format="JPEG")
        preview_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return {
            "status": "success",
            "psnr": float(psnr),
            "ssim": float(ssim),
            "download_url": f"/api/download/{os.path.basename(output_path)}",
            "preview_base64": f"data:image/jpeg;base64,{preview_b64}"
        }

@app.post("/api/extract-live-tile")
async def extract_live_tile(payload: BboxPayload):
    try:
        catalog = Client.open("https://earth-search.aws.element84.com/v1")
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=payload.bbox,
            query={"eo:cloud_cover": {"lt": 10}},
            sortby=[{"field": "properties.datetime", "direction": "desc"}],
            max_items=1
        )
        
        items = list(search.items())
        if not items:
            return JSONResponse({"status": "error", "message": "No suitable STAC items found for this bounding box."}, status_code=404)
            
        item = items[0]
        
        if 'visual' in item.assets:
            href = item.assets['visual'].href
        else:
            return JSONResponse({"status": "error", "message": "Visual asset not found in the STAC item."}, status_code=404)
            
        with rasterio.open(href) as src:
            min_lon, min_lat, max_lon, max_lat = payload.bbox
            native_bounds = transform_bounds("EPSG:4326", src.crs, min_lon, min_lat, max_lon, max_lat)
            
            window = from_bounds(*native_bounds, transform=src.transform)
            image_data = src.read(window=window, boundless=True, fill_value=0)
            
            if image_data.size == 0 or image_data.shape[1] == 0 or image_data.shape[2] == 0:
                return JSONResponse({"status": "error", "message": "Selected bounding box is invalid or outside image bounds."}, status_code=400)
            
            profile = src.profile.copy()
            profile.update({
                "height": image_data.shape[1],
                "width": image_data.shape[2],
                "transform": src.window_transform(window)
            })

        file_id = str(uuid.uuid4())
        
        # Spin up or route to the GPU Modal Class via remote()
        inference_job = ModelInference()
        result = inference_job.process_image_pipeline.remote(image_data, file_id, profile, is_geotiff=True, output_ext='.tif')
        
        # Ensure the web container fetches the latest volume state
        vol.reload()
        return JSONResponse(result)
        
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@app.post("/api/upscale")
async def upscale(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    
    # We temporarily store the upload in memory or /outputs volume
    input_path = f"/outputs/{file_id}{ext}"
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    vol.commit()
        
    try:
        is_geotiff = ext.lower() in ['.tif', '.tiff']
        if is_geotiff:
            image_data = read_geotiff(input_path)
            meta = get_metadata(input_path)
            profile = meta["profile"]
        else:
            pil_img = Image.open(input_path).convert('RGB')
            image_data = np.array(pil_img).transpose(2, 0, 1) # C, H, W
            profile = None
            
        inference_job = ModelInference()
        result = inference_job.process_image_pipeline.remote(image_data, file_id, profile, is_geotiff=is_geotiff, output_ext=ext)
        
        vol.reload()
        return JSONResponse(result)
        
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@modal_app.function(image=image, volumes={"/outputs": vol})
@modal.asgi_app()
def fastapi_app():
    return app
