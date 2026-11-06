import os
import sys
from pathlib import Path
import logging
import asyncio
from contextlib import asynccontextmanager

# Ensure backend directory is in sys.path
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.init_db import init_db
from app.services.camera.manager import camera_manager
from app.services.pose.factory import PoseEstimatorFactory
from app.services.assessment.session_manager import session_manager
from app.services.assessment.wave_run_manager import wave_run_manager

# Routers
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.participants import router as participants_router
from app.api.routes.cameras import router as cameras_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.rule_profiles import router as rule_profiles_router
from app.api.routes.benchmark import router as benchmark_router
from app.api.routes.reports import router as reports_router
from app.api.routes.settings import router as settings_router
from app.api.routes.health import router as health_router
from app.api.routes.samapta_events import router as events_router
from app.api.websocket.live_ws import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sikapta.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database & Models & Register Running Event Loop
    logger.info("Memulai SIKAPTA AI Core Service...")
    loop = asyncio.get_running_loop()
    session_manager.set_event_loop(loop)
    wave_run_manager.set_event_loop(loop)
    init_db()
    logger.info("Database SIKAPTA AI siap.")
    yield
    # Shutdown: Clean up assessment sessions, camera streams, and models
    logger.info("Menghentikan SIKAPTA AI Core Service...")
    session_manager.stop_all()
    wave_run_manager.stop_all()
    camera_manager.stop_all()
    PoseEstimatorFactory.close_all()
    logger.info("Sumber daya berhasil dibebaskan.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API untuk Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif (SIKAPTA AI)",
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes with prefix /api
api_prefix = settings.API_V1_STR
app.include_router(health_router, prefix=api_prefix)
app.include_router(auth_router, prefix=api_prefix)
app.include_router(dashboard_router, prefix=api_prefix)
app.include_router(participants_router, prefix=api_prefix)
app.include_router(cameras_router, prefix=api_prefix)
app.include_router(assessments_router, prefix=api_prefix)
app.include_router(rule_profiles_router, prefix=api_prefix)
app.include_router(benchmark_router, prefix=api_prefix)
app.include_router(reports_router, prefix=api_prefix)
app.include_router(settings_router, prefix=api_prefix)
app.include_router(events_router, prefix=api_prefix)

# Register WebSocket router
app.include_router(ws_router)

@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "tagline": "Presisi Gerak, Akurasi Penilaian.",
        "version": settings.VERSION,
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True, app_dir=str(_backend_dir))

