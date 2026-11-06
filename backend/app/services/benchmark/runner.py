import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.model_benchmark import ModelBenchmark
from app.services.pose.mediapipe_adapter import MediaPipePoseEstimator
from app.services.pose.yolo_adapter import YoloPoseEstimator
from app.services.movement.pushup_analyzer import PushUpAnalyzer

def create_synthetic_test_video(output_path: Path, num_frames: int = 150) -> Path:
    """Generate a standard test video fixture with an animated stick figure performing pushups."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(output_path), fourcc, 30.0, (640, 480))

    # Generate 150 frames (5 seconds @ 30fps) with 2 pushup cycles
    for i in range(num_frames):
        frame = np.full((480, 640, 3), 240, dtype=np.uint8)  # Off-white background
        # Calculate pushup progress (sine wave cycle)
        progress = (np.sin(i * 2 * np.pi / 60) + 1.0) / 2.0  # 0 to 1
        elbow_y = int(240 + progress * 60)

        # Draw realistic stick figure in pushup pose
        cv2.line(frame, (160, 320), (320, 320), (50, 50, 50), 6)  # Floor
        head_pos = (440, 200 + int(progress * 70))
        shoulder_pos = (400, 230 + int(progress * 70))
        elbow_pos = (350, elbow_y + int(progress * 30))
        wrist_pos = (350, 320)
        hip_pos = (280, 250 + int(progress * 50))
        ankle_pos = (180, 310)

        # Draw body lines
        cv2.circle(frame, head_pos, 22, (70, 70, 70), -1)  # Head
        cv2.line(frame, shoulder_pos, elbow_pos, (40, 40, 180), 5)  # Upper arm
        cv2.line(frame, elbow_pos, wrist_pos, (40, 40, 180), 5)  # Forearm
        cv2.line(frame, shoulder_pos, hip_pos, (50, 150, 50), 6)  # Torso
        cv2.line(frame, hip_pos, ankle_pos, (180, 50, 50), 6)  # Legs

        out.write(frame)

    out.release()
    return output_path

class BenchmarkRunner:
    @staticmethod
    def run_comparison(video_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Run sequential benchmark of MediaPipe vs YOLO on the exact same video feed.
        Models run serially on CPU (not in parallel) to accurately measure isolated performance.
        """
        if not video_path or not os.path.exists(video_path):
            fixture_path = settings.BENCHMARK_DIR / "benchmark_test_pushup.mp4"
            if not fixture_path.exists():
                create_synthetic_test_video(fixture_path)
            video_path = str(fixture_path)

        ground_truth_reps = 2  # Known ground truth for benchmark fixture

        # 1. Benchmark MediaPipe
        mp_results = BenchmarkRunner._benchmark_single_model("mediapipe", video_path, ground_truth_reps)

        # 2. Benchmark YOLO Pose
        yolo_results = BenchmarkRunner._benchmark_single_model("yolo", video_path, ground_truth_reps)

        # Persist benchmark records to PostgreSQL
        db: Session = SessionLocal()
        try:
            for res in [mp_results, yolo_results]:
                record = ModelBenchmark(
                    test_name=f"CPU Benchmark - {res['model_name'].upper()}",
                    video_source=os.path.basename(video_path),
                    duration_seconds=res["duration_seconds"],
                    total_frames=res["total_frames"],
                    model_name=res["model_name"],
                    avg_fps=res["avg_fps"],
                    avg_latency_ms=res["avg_latency_ms"],
                    p50_latency_ms=res["p50_latency_ms"],
                    p95_latency_ms=res["p95_latency_ms"],
                    precision_score=res["precision"],
                    recall_score=res["recall"],
                    f1_score=res["f1_score"],
                    false_positives=res["false_positives"],
                    false_negatives=res["false_negatives"],
                    detected_reps=res["detected_reps"],
                    verified_reps=res["verified_reps"],
                    invalid_pose_frames=res["invalid_pose_frames"],
                    test_date=datetime.now(timezone.utc)
                )
                db.add(record)
            db.commit()
        except Exception as e:
            db.rollback()
        finally:
            db.close()

        return {
            "test_video": os.path.basename(video_path),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "models": {
                "mediapipe": mp_results,
                "yolo": yolo_results
            }
        }

    @staticmethod
    def _benchmark_single_model(model_name: str, video_path: str, ground_truth_reps: int) -> Dict[str, Any]:
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 150

        estimator = MediaPipePoseEstimator() if model_name == "mediapipe" else YoloPoseEstimator()
        analyzer = PushUpAnalyzer()

        latencies = []
        invalid_pose_count = 0
        frame_idx = 0
        start_total_time = time.perf_counter()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            now_ms = int(frame_idx * 33.33)
            pose = estimator.estimate(frame, timestamp_ms=now_ms)
            latencies.append(pose.inference_latency_ms)

            if not pose.is_detected:
                invalid_pose_count += 1

            analyzer.process_frame(pose, timestamp_ms=now_ms)
            frame_idx += 1

        cap.release()
        estimator.close()

        total_duration = time.perf_counter() - start_total_time
        processed_frames = max(1, len(latencies))

        avg_fps = round(processed_frames / total_duration, 1)
        avg_lat = round(float(np.mean(latencies)), 1) if latencies else 0.0
        p50_lat = round(float(np.percentile(latencies, 50)), 1) if latencies else 0.0
        p95_lat = round(float(np.percentile(latencies, 95)), 1) if latencies else 0.0

        # Precision / Recall calculations vs ground truth
        detected_reps = analyzer.detected_reps
        verified_reps = analyzer.verified_reps

        tp = min(verified_reps, ground_truth_reps)
        fp = max(0, detected_reps - ground_truth_reps)
        fn = max(0, ground_truth_reps - verified_reps)

        precision = round(tp / (tp + fp), 2) if (tp + fp) > 0 else 1.0
        recall = round(tp / (tp + fn), 2) if (tp + fn) > 0 else 1.0
        f1 = round(2 * (precision * recall) / (precision + recall), 2) if (precision + recall) > 0 else 1.0

        return {
            "model_name": model_name,
            "duration_seconds": round(total_duration, 2),
            "total_frames": processed_frames,
            "avg_fps": avg_fps,
            "avg_latency_ms": avg_lat,
            "p50_latency_ms": p50_lat,
            "p95_latency_ms": p95_lat,
            "invalid_pose_frames": invalid_pose_count,
            "detected_reps": detected_reps,
            "verified_reps": verified_reps,
            "ground_truth_reps": ground_truth_reps,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": precision,
            "recall": recall,
            "f1_score": f1
        }

