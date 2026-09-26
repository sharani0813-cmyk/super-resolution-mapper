import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import os
import urllib.request

MODEL_WEIGHTS_PATH = os.getenv('MODEL_WEIGHTS_PATH', None)
DEFAULT_WEIGHTS_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"

class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super(ResidualDenseBlock, self).__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x

class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super(RRDB, self).__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x

class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32):
        super(RRDBNet, self).__init__()
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat=num_feat, num_grow_ch=num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)

        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out

class SatelliteSuperRes:
    """Inference class for Super Resolution mapping using RRDBNet."""
    def __init__(self, device=None, scale_factor=4):
        self.device = device if device else ("cuda" if torch.cuda.is_available() else "cpu")
        self.scale_factor = scale_factor
        
        # Instantiate RRDBNet architecture
        self.model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32)
        
        weights_path = MODEL_WEIGHTS_PATH
        if not weights_path or not os.path.exists(weights_path):
            weights_path = 'weights.pth'
            if not os.path.exists(weights_path):
                print(f"Downloading pre-trained weights to {weights_path}...")
                urllib.request.urlretrieve(DEFAULT_WEIGHTS_URL, weights_path)
        
        print(f"Loading weights from {weights_path} onto {self.device}...")
        state_dict = torch.load(weights_path, map_location=self.device)
        
        if 'params_ema' in state_dict:
            state_dict = state_dict['params_ema']
        elif 'params' in state_dict:
            state_dict = state_dict['params']
            
        self.model.load_state_dict(state_dict, strict=True)
        self.model.to(self.device)
        self.model.eval()

    def upscale_patch(self, patch: np.ndarray) -> np.ndarray:
        """Upscales a single patch using the SR model."""
        with torch.no_grad():
            x = torch.from_numpy(patch).float() / 255.0
            x = x.unsqueeze(0).to(self.device)
            out = self.model(x)
            out = torch.clamp(out, 0.0, 1.0)
            out = out.squeeze(0).cpu().numpy()
            out = (out * 255.0).astype(np.uint8)
        return out

    def get_baseline_bicubic(self, image: np.ndarray) -> np.ndarray:
        """Gets bicubic baseline for comparison."""
        with torch.no_grad():
            x = torch.from_numpy(image).float().unsqueeze(0)
            out = F.interpolate(x, scale_factor=self.scale_factor, mode='bicubic', align_corners=False)
            return out.squeeze(0).numpy()

def compute_psnr(img1: np.ndarray, img2: np.ndarray) -> float:
    mse = np.mean((img1.astype(np.float32) - img2.astype(np.float32)) ** 2)
    if mse == 0:
        return 100.0
    return float(20 * np.log10(255.0 / np.sqrt(mse)))

def compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
    C1 = (0.01 * 255)**2
    C2 = (0.03 * 255)**2
    
    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)
    
    mu1 = np.mean(img1)
    mu2 = np.mean(img2)
    
    sigma1_sq = np.var(img1)
    sigma2_sq = np.var(img2)
    sigma12 = np.cov(img1.flatten(), img2.flatten())[0,1]
    
    ssim = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) / \
           ((mu1**2 + mu2**2 + C1) * (sigma1_sq + sigma2_sq + C2))
    return float(ssim)

def compute_metrics(lr_patch: np.ndarray, hr_patch: np.ndarray, scale_factor: int = 4):
    """Calculates PSNR and SSIM between the bicubic upscaled baseline and the super-resolved output."""
    x = torch.from_numpy(lr_patch).float().unsqueeze(0)
    baseline = F.interpolate(x, scale_factor=scale_factor, mode='bicubic', align_corners=False)
    baseline = baseline.squeeze(0).numpy()
    
    psnr = compute_psnr(baseline, hr_patch)
    ssim = compute_ssim(baseline, hr_patch)
    return psnr, ssim

if __name__ == '__main__':
    print("Testing model execution...")
    # Test with dummy patch
    dummy_patch = np.random.randint(0, 256, (3, 256, 256), dtype=np.uint8)
    sr = SatelliteSuperRes()
    out = sr.upscale_patch(dummy_patch)
    print(f"Output shape: {out.shape}, Output dtype: {out.dtype}")
    
    psnr, ssim = compute_metrics(dummy_patch, out, scale_factor=4)
    print(f"Metrics - PSNR: {psnr:.2f}, SSIM: {ssim:.4f}")
    print("Test completed successfully.")
