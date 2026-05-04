import torch
import torch.nn.functional as F
import numpy as np


class GradCAM:
    def __init__(self, model, target_shape=(20, 400)):
        """
        Args:
            model: CNN model
            target_shape: Output heatmap size (LFCC shape)
        """
        self.model = model
        self.target_shape = target_shape

    def generate(self, input_tensor):
        """
        Args:
            input_tensor: (1, 1, 20, 400)

        Returns:
            heatmap: (20, 400) in [0,1]
        """

        self.model.eval()
        self.model.zero_grad()

        # Ensure gradients
        input_tensor = input_tensor.requires_grad_(True)

        # Forward
        output = self.model(input_tensor)

        # 🎯 Target logit (VERY IMPORTANT FIX)
        score = output[0, 0]

        # Backward
        score.backward()

        gradients = self.model.gradients      # (1, C, H, W)
        activations = self.model.activations  # (1, C, H, W)

        if gradients is None or activations is None:
            raise RuntimeError("Grad-CAM hooks not working")

        # --- Compute weights ---
        weights = torch.mean(gradients, dim=(2, 3))  # (1, C)

        # --- Weighted sum (vectorized) ---
        weights = weights.view(-1, 1, 1)             # (C,1,1)
        cam = torch.sum(weights * activations[0], dim=0)

        # --- ReLU ---
        cam = F.relu(cam)

        # --- Normalize ---
        cam = cam.detach()
        cam_min = cam.min()
        cam_max = cam.max()

        if (cam_max - cam_min) > 1e-8:
            cam = (cam - cam_min) / (cam_max - cam_min)
        else:
            cam = torch.zeros_like(cam)

        # --- Resize (PyTorch way - FIXED) ---
        cam = F.interpolate(
            cam.unsqueeze(0).unsqueeze(0),
            size=self.target_shape,
            mode="bilinear",
            align_corners=False
        )

        cam = cam.squeeze().cpu().numpy()

        return cam

    def generate_batch(self, input_tensor):
        heatmaps = []
        for i in range(input_tensor.size(0)):
            hm = self.generate(input_tensor[i:i+1])
            heatmaps.append(hm)
        return heatmaps