import time
import os
from pathlib import Path
from typing import Dict, Optional
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from app.core.config import settings
from app.schemas.pose import PoseResult, LandmarkPoint
from app.services.pose.base import BasePoseEstimator

# Mapping from MediaPipe 33 Landmark indices to our standard landmark names
MEDIAPIPE_INDEX_TO_NAME = {
    0: "nose",
    2: "left_eye",
    5: "right_eye",
    7: "left_ear",
    8: "right_ear",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
}

class MediaPipePoseEstimator(BasePoseEstimator):
    def __init__(self, model_asset_path: Optional[str] = None, min_confidence: float = 0.5):
        if model_asset_path is None:
            # Default to lite model for best CPU speed
            model_asset_path = str(settings.MODELS_DIR / "pose_landmarker_lite.task")
            if not os.path.exists(model_asset_path):
                # Fallback to full model if lite is missing
                model_asset_path = str(settings.MODELS_DIR / "pose_landmarker_full.task")

        self.model_path = model_asset_path
        self.min_confidence = min_confidence
        self._init_detector()

    def _init_detector(self):
        base_options = mp_python.BaseOptions(model_asset_path=self.model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            output_segmentation_masks=False,
            min_pose_detection_confidence=self.min_confidence,
            min_pose_presence_confidence=self.min_confidence,
            min_tracking_confidence=self.min_confidence,
            running_mode=vision.RunningMode.IMAGE
        )
        self.detector = vision.PoseLandmarker.create_from_options(options)

    def estimate(self, frame: np.ndarray, timestamp_ms: int = 0) -> PoseResult:
        start_time = time.perf_counter()

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        detection_result = self.detector.detect(mp_image)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if not detection_result.pose_landmarks or len(detection_result.pose_landmarks) == 0:
            return PoseResult(
                is_detected=False,
                model_name="mediapipe",
                landmarks={},
                timestamp_ms=timestamp_ms,
                inference_latency_ms=round(latency_ms, 2),
                confidence_score=0.0
            )

        raw_landmarks = detection_result.pose_landmarks[0]
        standard_landmarks: Dict[str, LandmarkPoint] = {}
        confidences = []

        for idx, pt in enumerate(raw_landmarks):
            if idx in MEDIAPIPE_INDEX_TO_NAME:
                name = MEDIAPIPE_INDEX_TO_NAME[idx]
                conf = getattr(pt, 'visibility', 0.8) or 0.8
                is_valid = conf >= self.min_confidence
                confidences.append(conf)

                standard_landmarks[name] = LandmarkPoint(
                    name=name,
                    x=round(float(pt.x), 4),
                    y=round(float(pt.y), 4),
                    z=round(float(pt.z), 4) if hasattr(pt, 'z') else 0.0,
                    confidence=round(float(conf), 3),
                    is_valid=is_valid
                )

        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        return PoseResult(
            is_detected=True,
            model_name="mediapipe",
            landmarks=standard_landmarks,
            timestamp_ms=timestamp_ms,
            inference_latency_ms=round(latency_ms, 2),
            confidence_score=round(avg_conf, 3)
        )

    def close(self):
        if hasattr(self, 'detector') and self.detector:
            self.detector.close()

