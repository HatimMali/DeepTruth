"""
utils/tampering_features.py
---------------------------
Builds the spectrogram tensor for inference — must be byte-for-byte
identical to dataset_cnn.py so training and inference distributions match.

All helper functions (_norm, _pad_or_crop, _fix_shape, _zcr_map,
audio_to_4channel, etc.) are copied verbatim from dataset_cnn.py.
"""

import os
import tempfile

import librosa
import numpy as np
from fastapi import HTTPException

# ── Must match dataset_cnn.py exactly ─────────────────────────────────────
SR          = 22050
N_MELS      = 128
N_FRAMES    = 128
HOP         = 512
N_FFT       = 2048
SEG_SAMPLES = N_FRAMES * HOP   # samples per spectrogram tile


# ── Copied verbatim from dataset_cnn.py ───────────────────────────────────

def _norm(x: np.ndarray) -> np.ndarray:
    """Zero-mean unit-variance normalisation."""
    return ((x - x.mean()) / (x.std() + 1e-6)).astype(np.float32)


def _pad_or_crop(y: np.ndarray, length: int) -> np.ndarray:
    if len(y) < length:
        return np.pad(y, (0, length - len(y)))
    return y[:length]


def _fix_shape(arr: np.ndarray) -> np.ndarray:
    """Enforce exactly (N_MELS, N_FRAMES) on a 2-D spectrogram array."""
    if arr.shape[0] > N_MELS:
        arr = arr[:N_MELS, :]
    elif arr.shape[0] < N_MELS:
        arr = np.pad(arr, ((0, N_MELS - arr.shape[0]), (0, 0)))
    if arr.shape[1] > N_FRAMES:
        arr = arr[:, :N_FRAMES]
    elif arr.shape[1] < N_FRAMES:
        arr = np.pad(arr, ((0, 0), (0, N_FRAMES - arr.shape[1])))
    return arr.astype(np.float32)


def _zcr_map(y: np.ndarray) -> np.ndarray:
    """Zero-crossing rate map tiled to (N_MELS, N_FRAMES). center=False matches training."""
    zcr = librosa.feature.zero_crossing_rate(
        y, frame_length=N_FFT, hop_length=HOP, center=False
    )[0]
    if len(zcr) > N_FRAMES:
        zcr = zcr[:N_FRAMES]
    elif len(zcr) < N_FRAMES:
        zcr = np.pad(zcr, (0, N_FRAMES - len(zcr)))
    zcr_2d = np.tile(zcr, (N_MELS, 1))
    return _norm(zcr_2d)


def audio_to_4channel(y: np.ndarray, sr: int) -> np.ndarray:
    y       = _pad_or_crop(y, SEG_SAMPLES)
    mel     = librosa.feature.melspectrogram(
        y=y, sr=sr, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    d1      = librosa.feature.delta(log_mel)
    d2      = librosa.feature.delta(log_mel, order=2)
    zcr     = _zcr_map(y)
    return np.stack([
        _norm(_fix_shape(log_mel)),
        _norm(_fix_shape(d1)),
        _norm(_fix_shape(d2)),
        _fix_shape(zcr),
    ], axis=0)   # (4, 128, 128)


def audio_to_3channel(y: np.ndarray, sr: int) -> np.ndarray:
    y       = _pad_or_crop(y, SEG_SAMPLES)
    mel     = librosa.feature.melspectrogram(
        y=y, sr=sr, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    d1      = librosa.feature.delta(log_mel)
    d2      = librosa.feature.delta(log_mel, order=2)
    return np.stack([
        _norm(_fix_shape(log_mel)),
        _norm(_fix_shape(d1)),
        _norm(_fix_shape(d2)),
    ], axis=0)   # (3, 128, 128)


def audio_to_1channel(y: np.ndarray, sr: int) -> np.ndarray:
    y       = _pad_or_crop(y, SEG_SAMPLES)
    mel     = librosa.feature.melspectrogram(
        y=y, sr=sr, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    ch      = _norm(_fix_shape(log_mel))
    return ch[np.newaxis, ...]   # (1, 128, 128)


# ── Public API ─────────────────────────────────────────────────────────────

def build_spectrogram_tensor(
    audio_bytes: bytes,
    filename: str,
    n_channels: int = 4,
) -> np.ndarray:
    """
    Returns float32 numpy array (n_channels, N_MELS, N_FRAMES).
    Identical preprocessing to TamperDataset.__getitem__.
    """
    suffix = os.path.splitext(filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        y, _ = librosa.load(tmp_path, sr=SR, mono=True)
    finally:
        os.remove(tmp_path)

    if len(y) < N_FFT:
        raise HTTPException(status_code=400, detail="Audio clip is too short.")

    if n_channels == 4:
        return audio_to_4channel(y, SR)
    elif n_channels == 3:
        return audio_to_3channel(y, SR)
    else:
        return audio_to_1channel(y, SR)


def get_audio_duration(audio_bytes: bytes, filename: str) -> float | None:
    """Return duration in seconds, or None on failure."""
    suffix = os.path.splitext(filename)[1] or ".wav"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        y, _ = librosa.load(tmp_path, sr=SR, mono=True)
        os.remove(tmp_path)
        return round(len(y) / SR, 2)
    except Exception:
        return None