import torch
import tempfile
import numpy as np
import librosa
import soundfile as sf
import time  # 🔥 NEW

from utils.model import load_model
from utils.deepfake_preprocess import extract_features


class DeepfakeService:
    def __init__(self, model_path):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = load_model(model_path, self.device)
        self.model.eval()

        # Each chunk ≈ 4 seconds (matches training input: 20x400 LFCC)
        self.chunk_duration = 4  # seconds

    def predict(self, audio_bytes, filename=None):
        start_time = time.time()  # 🔥 START TIMER

        # Save uploaded audio to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            temp_path = tmp.name

        # Load full audio
        y, sr = librosa.load(temp_path, sr=None)

        chunk_size = int(self.chunk_duration * sr)

        segments = []
        probs = []

        # --- Sliding Window Inference ---
        for start in range(0, len(y), chunk_size):
            end = start + chunk_size
            chunk = y[start:end]

            # Skip very short chunks (<1 sec)
            if len(chunk) < sr:
                continue

            # Save chunk to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_chunk:
                sf.write(tmp_chunk.name, chunk, sr)
                chunk_path = tmp_chunk.name

            # Extract LFCC features
            features = extract_features(chunk_path)

            features = torch.tensor(features, dtype=torch.float32) \
                .unsqueeze(0).unsqueeze(0).to(self.device)

            # Model inference
            with torch.no_grad():
                logits = self.model(features)
                prob = torch.sigmoid(logits).item()

            probs.append(prob)

            segments.append({
                "start": round(start / sr, 2),
                "end": round(min(end / sr, len(y) / sr), 2),
                "prob": float(prob)
            })

        # Handle edge case
        if len(probs) == 0:
            raise ValueError("Audio too short for analysis")

        # Aggregate predictions
        # Aggregate predictions
        avg_prob = float(np.mean(probs))
        label = "Spoof" if avg_prob > 0.5 else "Bonafide"

        # Probability of the predicted class
        confidence = avg_prob if label == "Spoof" else 1 - avg_prob

        # 🔥 END TIMER
        processing_time = round((time.time() - start_time) * 1000, 2)

        return {
            "prediction": label,
            "confidence": confidence,
            "segments": segments,
            "processing_time": f"{processing_time} ms"  # 🔥 NEW
        }