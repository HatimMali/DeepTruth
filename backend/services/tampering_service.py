"""
services/tampering_service.py
------------------------------
Inference service for TamperCNN / TamperCNNResidual (train_cnn.py v3).

Sliding window inference: splits full audio into ~3s chunks and runs
the model on each. Tampering is flagged if ANY chunk exceeds threshold.
Reports which time segment was tampered.

XAI: Input gradient saliency on the most suspicious chunk.
Technique: top-2 techniques with softmax confidence scores.
"""

import os
import tempfile
import time

import librosa
import numpy as np
import torch
import torch.nn.functional as F

from utils.model_cnn import TamperCNN, TamperCNNResidual, TECHNIQUE_CLASSES
from utils.tampering_features import (
    SR, N_FFT, SEG_SAMPLES,
    audio_to_4channel, audio_to_3channel, audio_to_1channel,
    get_audio_duration,
)


# ──────────────────────────────────────────────────────────────────────────
# XAI: Input Gradient Saliency
# ──────────────────────────────────────────────────────────────────────────

def _get_saliency(model, x: torch.Tensor, use_aux: bool) -> np.ndarray:
    x_in = x.clone().detach().requires_grad_(True)
    with torch.enable_grad():
        out    = model(x_in)
        logits = out[0] if use_aux else out
        score  = logits.squeeze()
        model.zero_grad()
        score.backward()
    saliency = x_in.grad.abs().squeeze(0).mean(dim=0)
    s  = saliency.cpu().numpy()
    lo, hi = s.min(), s.max()
    return (s - lo) / (hi - lo + 1e-8)


def _heatmap_to_regions(heatmap: np.ndarray) -> list:
    H, W       = heatmap.shape
    freq_bands = ["low-frequency", "mid-frequency", "high-frequency"]
    time_segs  = ["early segment", "middle segment", "late segment"]
    fh, fw     = H // 3, W // 3
    regions = []
    for fi in range(3):
        for ti in range(3):
            patch = heatmap[fi * fh:(fi + 1) * fh, ti * fw:(ti + 1) * fw]
            regions.append({
                "region":     f"{freq_bands[fi]} / {time_segs[ti]}",
                "importance": round(float(patch.mean()), 4),
            })
    regions.sort(key=lambda r: r["importance"], reverse=True)
    return regions[:3]


# ──────────────────────────────────────────────────────────────────────────
# Service
# ──────────────────────────────────────────────────────────────────────────

class TamperingService:

    def __init__(self, model_path: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._load_model(model_path)

    def _load_model(self, path: str):
        ckpt = torch.load(path, map_location=self.device, weights_only=False)

        self.in_channels = ckpt.get("in_channels", 4)
        self.threshold   = ckpt.get("threshold",   0.5)
        self.aux_classes = ckpt.get("aux_classes",  0)
        model_class_name = ckpt.get("model_class",  "TamperCNN")

        ModelClass = (
            TamperCNNResidual if model_class_name == "TamperCNNResidual"
            else TamperCNN
        )

        self.model = ModelClass(
            in_channels=self.in_channels,
            dropout=ckpt.get("dropout", 0.4),
            aux_classes=self.aux_classes,
        ).to(self.device)

        self.model.load_state_dict(ckpt["model_state"])
        self.model.eval()

        print(
            f"[TamperingService] Loaded {ModelClass.__name__} "
            f"| channels={self.in_channels} "
            f"| threshold={self.threshold} "
            f"| aux={'yes' if self.aux_classes > 0 else 'no'}"
        )

    def _chunk_to_tensor(self, chunk: np.ndarray) -> torch.Tensor:
        if self.in_channels == 4:
            spec = audio_to_4channel(chunk, SR)
        elif self.in_channels == 3:
            spec = audio_to_3channel(chunk, SR)
        else:
            spec = audio_to_1channel(chunk, SR)
        return torch.tensor(spec, dtype=torch.float32).unsqueeze(0).to(self.device)

    def _predict_tensor(self, x: torch.Tensor):
        with torch.no_grad():
            out    = self.model(x)
            logits = out[0] if self.aux_classes > 0 else out
            prob   = torch.sigmoid(logits).squeeze().item()
        return prob, out

    def _get_techniques(self, x: torch.Tensor) -> tuple[str | None, list]:
        """
        Returns (top_technique, techniques_list) where techniques_list has
        top-2 techniques with softmax confidence scores.
        """
        if self.aux_classes == 0:
            return None, []

        with torch.no_grad():
            out = self.model(x)

        aux_probs = F.softmax(out[1], dim=1).squeeze()  # (N_TECHNIQUES,)
        top2      = torch.topk(aux_probs, k=min(2, self.aux_classes))

        techniques = [
            {
                "name":       TECHNIQUE_CLASSES[idx.item()],
                "confidence": round(score.item(), 4),
            }
            for idx, score in zip(top2.indices, top2.values)
        ]

        top_technique = techniques[0]["name"] if techniques else None
        return top_technique, techniques

    def predict(self, audio_bytes: bytes, filename: str) -> dict:
        start    = time.time()
        use_aux  = self.aux_classes > 0
        duration = get_audio_duration(audio_bytes, filename)

        # ── Load full audio ────────────────────────────────────────────────
        suffix = os.path.splitext(filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            y, _ = librosa.load(tmp_path, sr=SR, mono=True)
        finally:
            os.remove(tmp_path)

        # ── Sliding window ─────────────────────────────────────────────────
        chunks = []
        for start_sample in range(0, len(y), SEG_SAMPLES):
            chunk = y[start_sample: start_sample + SEG_SAMPLES]
            if len(chunk) >= N_FFT:
                chunks.append((start_sample, chunk))

        if not chunks:
            raise ValueError("Audio too short to process.")

        # ── Inference on every chunk ───────────────────────────────────────
        chunk_results = []
        for start_sample, chunk in chunks:
            x         = self._chunk_to_tensor(chunk)
            prob, out = self._predict_tensor(x)
            t_start   = round(start_sample / SR, 2)
            t_end     = round(min((start_sample + SEG_SAMPLES) / SR, len(y) / SR), 2)
            chunk_results.append({
                "chunk_index": len(chunk_results),
                "time_start":  t_start,
                "time_end":    t_end,
                "probability": round(prob, 4),
                "flagged":     prob >= self.threshold,
                "_tensor":     x,
                "_out":        out,
            })

        # ── Overall decision ───────────────────────────────────────────────
        flagged_chunks     = [c for c in chunk_results if c["flagged"]]
        predicted_tampered = len(flagged_chunks) > 0
        most_suspicious    = max(chunk_results, key=lambda c: c["probability"])
        max_prob           = most_suspicious["probability"]

        if predicted_tampered:
            confidence = max_prob
        else:
            avg_prob   = sum(c["probability"] for c in chunk_results) / len(chunk_results)
            confidence = round(1.0 - avg_prob, 4)

        # ── XAI ───────────────────────────────────────────────────────────
        heatmap     = _get_saliency(self.model, most_suspicious["_tensor"], use_aux)
        top_regions = _heatmap_to_regions(heatmap)

        # ── Technique — top-2 with softmax scores ─────────────────────────
        technique, techniques = (
            self._get_techniques(most_suspicious["_tensor"])
            if predicted_tampered
            else (None, [])
        )

        # ── Tampered segments ──────────────────────────────────────────────
        tampered_segments = [
            f"{c['time_start']}s – {c['time_end']}s"
            for c in flagged_chunks
        ]

        chunks_summary = [
            {
                "chunk_index": c["chunk_index"],
                "time_start":  c["time_start"],
                "time_end":    c["time_end"],
                "probability": c["probability"],
                "flagged":     c["flagged"],
            }
            for c in chunk_results
        ]

        prediction      = "Tampered" if predicted_tampered else "Authentic"
        processing_time = round((time.time() - start) * 1000, 2)

        return {
            "prediction":        prediction,
            "confidence":        round(confidence, 4),
            "flagged":           1 if predicted_tampered else 0,

            "total_chunks":      len(chunk_results),
            "flagged_chunks":    len(flagged_chunks),
            "tampered_segments": tampered_segments,
            "chunks":            chunks_summary,

            **(
                {
                    "xai_method":       "Input Gradient Saliency",
                    "top_regions":      top_regions,
                    "technique":        technique,
                    "techniques":       techniques,   # top-2 with confidence
                    "anomaly_location": (
                        f"{most_suspicious['time_start']}s – {most_suspicious['time_end']}s"
                        f" | {top_regions[0]['region']}"
                        if top_regions else "N/A"
                    ),
                }
                if predicted_tampered else {
                    "xai_method":       None,
                    "top_regions":      [],
                    "technique":        None,
                    "techniques":       [],
                    "anomaly_location": "N/A",
                }
            ),

            "processing_time":   f"{processing_time} ms",
            "duration":          f"{duration} sec" if duration else None,
        }