import time
import os
from typing import Dict, Optional
import numpy as np
import cv2
from ultralytics import YOLO

from app.core.config import settings
from app.schemas.pose import PoseResult, LandmarkPoint
from app.services.pose.base import BasePoseEstimator

# Mapping from COCO 17 Keypoints to standard landmark names
COCO_INDEX_TO_NAME = {
    0: "nose",
    1: "left_eye",
    2: "right_eye",
    3: "left_ear",
    4: "right_ear",
    5: "left_shoulder",
    6: "right_shoulder",
    7: "left_elbow",
    8: "right_elbow",
    9: "left_wrist",
    10: "right_wrist",
    11: "left_hip",
    12: "right_hip",
    13: "left_knee",
    14: "right_knee",
    15: "left_ankle",
    16: "right_ankle"
}

class YoloPoseEstimator(BasePoseEstimator):
    def __init__(self, model_path: Optional[str] = None, min_confidence: float = 0.4, imgsz: int = 480):
        if model_path is None:
            model_path = str(settings.MODELS_DIR / "yolov8n-pose.pt")

        self.model_path = model_path
        self.min_confidence = min_confidence
        self.imgsz = imgsz
        self.model = YOLO(self.model_path)

    def estimate(self, frame: np.ndarray, timestamp_ms: int = 0) -> PoseResult:
        start_time = time.perf_counter()
        h, w, _ = frame.shape

        # Run inference on CPU
        results = self.model.predict(
            source=frame,
            device="cpu",
            imgsz=self.imgsz,
            verbose=False,
            conf=self.min_confidence
        )

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if not results or len(results) == 0 or results[0].keypoints is None or len(results[0].keypoints) == 0:
            return PoseResult(
                is_detected=False,
                model_name="yolo",
                landmarks={},
                timestamp_ms=timestamp_ms,
                inference_latency_ms=round(latency_ms, 2),
                confidence_score=0.0
            )

        # Get keypoints for the most prominent person (person 0)
        # keypoints.xyn has normalized [0, 1] coordinates
        keypoints_obj = results[0].keypoints
        xyn = keypoints_obj.xyn[0].cpu().numpy()  # shape (17, 2)
        conf = keypoints_obj.conf[0].cpu().numpy() if keypoints_obj.conf is not None else np.ones(17) * 0.8

        standard_landmarks: Dict[str, LandmarkPoint] = {}
        confidences = []

        for idx in range(min(len(xyn), len(COCO_INDEX_TO_NAME))):
            name = COCO_INDEX_TO_NAME[idx]
            pt_x = float(xyn[idx][0])
            pt_y = float(xyn[idx][1])
            pt_conf = float(conf[idx])
            is_valid = pt_conf >= self.min_confidence and (pt_x > 0.0 or pt_y > 0.0)

            confidences.append(pt_conf)
            standard_landmarks[name] = LandmarkPoint(
                name=name,
                x=round(pt_x, 4),
                y=round(pt_y, 4),
                z=0.0,
                confidence=round(pt_conf, 3),
                is_valid=is_valid
            )

        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        return PoseResult(
            is_detected=True,
            model_name="yolo",
            landmarks=standard_landmarks,
            timestamp_ms=timestamp_ms,
            inference_latency_ms=round(latency_ms, 2),
            confidence_score=round(avg_conf, 3)
        )

    def close(self):
        # Ultralytics model in-memory cleanup
        self.model = None

