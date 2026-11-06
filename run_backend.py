"""
Runner script for SIKAPTA AI Core Service.
Allows running the backend directly from the project root directory:
    python run_backend.py
"""
import os
import sys
from pathlib import Path
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    print(f"[*] Starting SIKAPTA AI Core Service on http://127.0.0.1:{port}...")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        reload=True,
        app_dir=str(BACKEND_DIR)
    )

