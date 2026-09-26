import rasterio
from rasterio.transform import Affine
import numpy as np

def get_metadata(file_path: str):
    """Extracts CRS, transform, bounds, and profile from a GeoTIFF."""
    with rasterio.open(file_path) as src:
        return {
            "crs": src.crs,
            "transform": src.transform,
            "bounds": src.bounds,
            "profile": src.profile,
            "width": src.width,
            "height": src.height,
            "count": src.count
        }

def read_geotiff(file_path: str) -> np.ndarray:
    """Reads a GeoTIFF file and returns its data as a numpy array."""
    with rasterio.open(file_path) as src:
        data = src.read()
    return data

def slice_into_patches(image: np.ndarray, patch_size: int = 256, overlap: int = 32):
    """Slices the raster into overlapping patches."""
    C, H, W = image.shape
    stride = patch_size - overlap
    
    patches = []
    positions = []
    
    for y in range(0, max(H - patch_size + stride, 1), stride):
        for x in range(0, max(W - patch_size + stride, 1), stride):
            y_start = min(y, max(H - patch_size, 0))
            x_start = min(x, max(W - patch_size, 0))
            
            y_end = min(y_start + patch_size, H)
            x_end = min(x_start + patch_size, W)
            
            patch = np.zeros((C, patch_size, patch_size), dtype=image.dtype)
            patch[:, :y_end-y_start, :x_end-x_start] = image[:, y_start:y_end, x_start:x_end]
            
            patches.append(patch)
            positions.append((y_start, x_start))
            
    return patches, positions

def get_blending_window(patch_size: int, overlap: int):
    """Creates a 2D Bartlett (triangular) window to blend overlapping regions."""
    window_1d = np.ones(patch_size)
    if overlap > 0:
        window_1d[:overlap] = np.linspace(0, 1, overlap)
        window_1d[-overlap:] = np.linspace(1, 0, overlap)
    window_2d = np.outer(window_1d, window_1d)
    return window_2d

def stitch_patches(patches, positions, original_shape, patch_size: int, overlap: int, scale_factor: int = 4):
    """Stitches patches back together using a linear blending window to eliminate seams."""
    C, H, W = original_shape
    out_H, out_W = H * scale_factor, W * scale_factor
    out_patch_size = patch_size * scale_factor
    out_overlap = overlap * scale_factor
    
    stitched = np.zeros((C, out_H, out_W), dtype=np.float32)
    weights = np.zeros((1, out_H, out_W), dtype=np.float32)
    
    window = get_blending_window(out_patch_size, out_overlap)
    window = np.expand_dims(window, axis=0) # (1, H, W)
    
    for patch, (y, x) in zip(patches, positions):
        y_out = y * scale_factor
        x_out = x * scale_factor
        
        stitched[:, y_out:y_out+out_patch_size, x_out:x_out+out_patch_size] += patch * window
        weights[:, y_out:y_out+out_patch_size, x_out:x_out+out_patch_size] += window
        
    weights[weights == 0] = 1.0 # avoid division by zero
    stitched = stitched / weights
    return np.clip(stitched, 0, 255).astype(np.uint8)

def save_geotiff(output_path: str, data: np.ndarray, profile: dict, scale_factor: int = 4):
    """Saves the stitched output as a valid GeoTIFF with updated high-res dimensions and transform."""
    C, H, W = data.shape
    
    new_profile = profile.copy()
    transform = profile["transform"]
    new_transform = transform * Affine.scale(1/scale_factor, 1/scale_factor)
    
    new_profile.update({
        "width": W,
        "height": H,
        "transform": new_transform,
        "count": C,
        "dtype": data.dtype
    })
    
    with rasterio.open(output_path, "w", **new_profile) as dst:
        dst.write(data)
