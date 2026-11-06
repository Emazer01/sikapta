from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model_benchmark import ModelBenchmark
from app.schemas.benchmark import BenchmarkRunRequest, ModelBenchmarkResponse
from app.services.benchmark.runner import BenchmarkRunner
from app.api.deps import get_current_user

router = APIRouter(prefix="/benchmark", tags=["Model Benchmark"])

@router.post("/run")
def run_model_benchmark(req: BenchmarkRunRequest = BenchmarkRunRequest(), current_user = Depends(get_current_user)):
    """Run sequential benchmark comparing MediaPipe vs YOLO on the same test sequence."""
    try:
        results = BenchmarkRunner.run_comparison(video_path=req.video_path)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menjalankan benchmark: {str(e)}")

@router.get("/history", response_model=List[ModelBenchmarkResponse])
def get_benchmark_history(db: Session = Depends(get_db)):
    return db.query(ModelBenchmark).order_by(ModelBenchmark.id.desc()).limit(20).all()

