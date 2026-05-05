"""
utils/audio_converter.py
-------------------------
Converts any audio format (mp3, ogg, m4a, aac, etc.) to WAV bytes.
Uses pydub + ffmpeg under the hood.
"""

import io
import os
from pydub import AudioSegment


SUPPORTED_CONVERSIONS = {
    ".mp3", ".ogg", ".m4a", ".aac",
    ".mp4", ".wma", ".opus", ".webm"
}

ALREADY_SUPPORTED = {".wav", ".flac"}


def convert_to_wav(audio_bytes: bytes, filename: str) -> tuple[bytes, str]:
    """
    Converts audio_bytes to WAV format if needed.
    Returns (wav_bytes, new_filename).
    If already .wav or .flac, returns as-is.
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext in ALREADY_SUPPORTED:
        return audio_bytes, filename

    if ext not in SUPPORTED_CONVERSIONS:
        raise ValueError(f"Unsupported format: {ext}")

    # Load with pydub
    audio = AudioSegment.from_file(
        io.BytesIO(audio_bytes),
        format=ext.lstrip(".")
    )

    # Export as WAV
    wav_buffer = io.BytesIO()
    audio.export(wav_buffer, format="wav")
    wav_bytes = wav_buffer.getvalue()

    new_filename = os.path.splitext(filename)[0] + ".wav"
    return wav_bytes, new_filename