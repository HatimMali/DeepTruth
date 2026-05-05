import os
import time
import numpy as np

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from services.deepfake_service import DeepfakeService
from services.tampering_service import TamperingService
from utils.audio_converter import convert_to_wav, ALREADY_SUPPORTED, SUPPORTED_CONVERSIONS

# ---------------------------------------------------------------------------
# App Init
# ---------------------------------------------------------------------------
app = FastAPI(title="Audio Analysis API")

# Enable CORS (for React frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
deepfake_service = None
tampering_service = None

SUPPORTED_EXT = ALREADY_SUPPORTED | SUPPORTED_CONVERSIONS

# ---- Monitoring ----
START_TIME = time.time()
REQUEST_TIMES = []

# ---------------------------------------------------------------------------
# Startup Event
# ---------------------------------------------------------------------------
@app.on_event("startup")
def load_models():
    global deepfake_service, tampering_service

    try:
        deepfake_service = DeepfakeService("models/best_cnn_model.pth")
        tampering_service = TamperingService("models/cnn_tamper2.pt")

        print("✅ Models loaded successfully")
    except Exception as e:
        print("❌ Model loading failed:", e)
        raise e

# ---------------------------------------------------------------------------
# Middleware (Latency Tracking)
# ---------------------------------------------------------------------------
@app.middleware("http")
async def track_latency(request: Request, call_next):
    start = time.time()

    response = await call_next(request)

    duration = (time.time() - start) * 1000  # ms
    REQUEST_TIMES.append(duration)

    # keep last 100 requests
    if len(REQUEST_TIMES) > 100:
        REQUEST_TIMES.pop(0)

    return response

# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------
def validate_file(file: UploadFile):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported formats: {', '.join(sorted(SUPPORTED_EXT))}"
        )

def get_uptime():
    seconds = int(time.time() - START_TIME)

    hrs = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60

    return f"{hrs}h {mins}m {secs}s"

def get_latency_stats():
    if not REQUEST_TIMES:
        return {"p50": 0, "p99": 0}

    arr = np.array(REQUEST_TIMES)

    return {
        "p50": round(float(np.percentile(arr, 50)), 2),
        "p99": round(float(np.percentile(arr, 99)), 2),
    }

# ---------------------------------------------------------------------------
# Health Endpoint
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "healthy",
        "gpu": False,
        "models": {
            "deepfake":  "loaded" if deepfake_service  else "not loaded",
            "tampering": "loaded" if tampering_service else "not loaded",
        }
    }

# ---------------------------------------------------------------------------
# Info Endpoint (Dashboard)
# ---------------------------------------------------------------------------
@app.get("/info")
def info():
    return {
        "project": "Audio Analysis System",
        "version": "1.0.0",

        "uptime":  get_uptime(),
        "latency": get_latency_stats(),

        "supported_formats": {
            "native":     sorted(ALREADY_SUPPORTED),
            "converted":  sorted(SUPPORTED_CONVERSIONS),
        },

        "models": {
            "tampering": {
                "type":    "CNN (Mel-spectrogram, 4-channel)",
                "version": "v3",
                "xai":     "Grad-CAM",
                "metrics": {
                    "note": "See best_auc in checkpoint",
                    "accuracy": "92%"
                }
            },
            "deepfake": {
                "type":    "CNN (LFCC)",
                "version": "v1",
                "metrics": {
                    "accuracy": "89%",
                    "f1":       "0.89"
                }
            }
        }
    }

# ---------------------------------------------------------------------------
# Deepfake Prediction
# ---------------------------------------------------------------------------
@app.post("/predict/deepfake")
async def predict_deepfake(file: UploadFile = File(...)):
    validate_file(file)

    try:
        audio_bytes = await file.read()
        audio_bytes, converted_filename = convert_to_wav(audio_bytes, file.filename)
        return deepfake_service.predict(audio_bytes, converted_filename)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deepfake error: {str(e)}")

# ---------------------------------------------------------------------------
# Tampering Prediction
# ---------------------------------------------------------------------------
@app.post("/predict/tampering")
async def predict_tampering(file: UploadFile = File(...)):
    validate_file(file)

    try:
        audio_bytes = await file.read()
        audio_bytes, converted_filename = convert_to_wav(audio_bytes, file.filename)
        return tampering_service.predict(audio_bytes, converted_filename)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tampering error: {str(e)}")