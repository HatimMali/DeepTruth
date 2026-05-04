"""
model_cnn.py
------------
CNN architectures for audio tampering detection.

Models:
  TamperCNN         — lightweight baseline (fast to train)
  TamperCNNResidual — deeper residual model (recommended)

Both support:
  - in_channels = 1, 3, or 4
      4 = mel + delta + delta2 + ZCR  (recommended, catches splice boundaries)
  - aux_classes > 0 adds a second head that predicts which tampering technique
    was applied (multi-task learning — improves subtle-technique detection)

Input:  (B, C, 128, 128)
Output (aux_classes == 0): raw logit  (B,)
Output (aux_classes  > 0): tuple (logit (B,), aux_logits (B, aux_classes))

FIX from v2: TamperCNN.forward had a double-head computation path.
  The first `logit` was computed correctly, then immediately overwritten by a
  second call that reconstructed the Sequential from its children — which broke
  routing when aux_classes > 0 because the second call received `flat` outside
  the expected input chain. Removed the second call entirely.
"""

import torch
import torch.nn as nn


# ──────────────────────────────────────────
# Shared building blocks
# ──────────────────────────────────────────

class ConvBlock(nn.Module):
    """Conv → BN → ReLU → Conv → BN → ReLU → (optional MaxPool)."""

    def __init__(self, in_ch: int, out_ch: int, pool: bool = True):
        super().__init__()
        layers = [
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        ]
        if pool:
            layers.append(nn.MaxPool2d(2))
        self.block = nn.Sequential(*layers)

    def forward(self, x):
        return self.block(x)


class AuxHead(nn.Module):
    """
    Small auxiliary head for technique-type prediction (multi-task).
    Attached to shared encoder features after GlobalAvgPool.
    """
    def __init__(self, in_features: int, n_classes: int, dropout: float = 0.3):
        super().__init__()
        self.head = nn.Sequential(
            nn.Linear(in_features, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, n_classes),
        )

    def forward(self, x):
        return self.head(x)


# ──────────────────────────────────────────
# Model 1: TamperCNN  (baseline)
# ──────────────────────────────────────────

class TamperCNN(nn.Module):
    """
    Lightweight CNN baseline.

    Architecture:
        ConvBlock(C → 32)    + pool  →  (32, 64, 64)
        ConvBlock(32 → 64)   + pool  →  (64, 32, 32)
        ConvBlock(64 → 128)  + pool  →  (128, 16, 16)
        ConvBlock(128 → 256) no pool →  (256, 16, 16)
        GlobalAvgPool               →  (256,)
        Linear(256 → 128) → ReLU → Dropout → Linear(128 → 1)

    Args:
        in_channels : 1, 3, or 4
        dropout     : dropout probability in the FC head
        aux_classes : if > 0, an auxiliary technique-type head is added
    """

    def __init__(self, in_channels: int = 4, dropout: float = 0.4,
                 aux_classes: int = 0):
        super().__init__()
        self.aux_classes = aux_classes

        self.encoder = nn.Sequential(
            ConvBlock(in_channels, 32,  pool=True),
            ConvBlock(32,          64,  pool=True),
            ConvBlock(64,          128, pool=True),
            ConvBlock(128,         256, pool=False),
        )

        self.gap = nn.AdaptiveAvgPool2d(1)

        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(128, 1),
        )

        if aux_classes > 0:
            self.aux_head = AuxHead(256, aux_classes, dropout=dropout * 0.75)

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor):
        """
        FIX: single clean forward path — no double-head computation.

        Returns:
            aux_classes == 0 : logit  (B,)
            aux_classes  > 0 : (logit (B,), aux_logits (B, aux_classes))
        """
        # Shared encoder
        features = self.gap(self.encoder(x))          # (B, 256, 1, 1)
        flat     = features.view(features.size(0), -1) # (B, 256)

        # Primary binary head
        logit = self.head(flat).squeeze(1)             # (B,)

        if self.aux_classes > 0:
            return logit, self.aux_head(flat)
        return logit


# ──────────────────────────────────────────
# Model 2: TamperCNNResidual  (recommended)
# ──────────────────────────────────────────

class ResBlock(nn.Module):
    """
    Residual block with projection shortcut when channels change.
    MaxPool2d applied after the residual addition.
    """

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
        )
        self.pool     = nn.MaxPool2d(2)
        self.shortcut = (
            nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 1, bias=False),
                nn.BatchNorm2d(out_ch),
            )
            if in_ch != out_ch
            else nn.Identity()
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        out = self.relu(self.conv(x) + self.shortcut(x))
        return self.pool(out)


class TamperCNNResidual(nn.Module):
    """
    Deeper residual CNN — recommended for datasets with 3 000+ samples per
    class or after expanding tampering variety with the new generator.

    Architecture:
        Stem: Conv(C → 32) + BN + ReLU
        ResBlock(32  → 64)   + pool  →  (64,  64, 64)
        ResBlock(64  → 128)  + pool  →  (128, 32, 32)
        ResBlock(128 → 256)  + pool  →  (256, 16, 16)
        ResBlock(256 → 256)  + pool  →  (256,  8,  8)
        GlobalAvgPool               →  (256,)
        Linear(256 → 128) → ReLU → Dropout → Linear(128 → 1)

    Args:
        in_channels : 1, 3, or 4
        dropout     : dropout probability in the FC head
        aux_classes : if > 0, auxiliary technique-type head is added
    """

    def __init__(self, in_channels: int = 4, dropout: float = 0.4,
                 aux_classes: int = 0):
        super().__init__()
        self.aux_classes = aux_classes

        self.stem = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
        )

        self.blocks = nn.Sequential(
            ResBlock(32,  64),
            ResBlock(64,  128),
            ResBlock(128, 256),
            ResBlock(256, 256),
        )

        self.gap = nn.AdaptiveAvgPool2d(1)

        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(128, 1),
        )

        if aux_classes > 0:
            self.aux_head = AuxHead(256, aux_classes, dropout=dropout * 0.75)

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor):
        features = self.gap(self.blocks(self.stem(x)))  # (B, 256, 1, 1)
        flat     = features.view(features.size(0), -1)  # (B, 256)
        logit    = self.head(flat).squeeze(1)            # (B,)

        if self.aux_classes > 0:
            return logit, self.aux_head(flat)
        return logit


# ──────────────────────────────────────────
# Technique label mapping (for aux head)
# ──────────────────────────────────────────

TECHNIQUE_CLASSES = [
    "speed", "pitch", "noise", "compress", "splice",
    "eq", "clip", "resample", "reverb",
]
N_TECHNIQUES = len(TECHNIQUE_CLASSES)   # 9


# ──────────────────────────────────────────
# Quick sanity check
# ──────────────────────────────────────────

if __name__ == "__main__":
    print("Sanity check — forward pass shapes:\n")
    for ModelCls in [TamperCNN, TamperCNNResidual]:
        for ch in [3, 4]:
            for aux in [0, 9]:
                m     = ModelCls(in_channels=ch, aux_classes=aux)
                n     = sum(p.numel() for p in m.parameters() if p.requires_grad)
                dummy = torch.zeros(2, ch, 128, 128)
                out   = m(dummy)

                if aux > 0:
                    logit, aux_out = out
                    print(
                        f"{ModelCls.__name__:25s}  ch={ch}  aux={aux}  "
                        f"params={n:,}  logit={tuple(logit.shape)}  "
                        f"aux={tuple(aux_out.shape)}"
                    )
                else:
                    print(
                        f"{ModelCls.__name__:25s}  ch={ch}  aux={aux}  "
                        f"params={n:,}  logit={tuple(out.shape)}"
                    )