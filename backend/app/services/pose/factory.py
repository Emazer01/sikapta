from typing import Dict, Optional
from app.services.pose.base import BasePoseEstimator
from app.services.pose.mediapipe_adapter import MediaPipePoseEstimator
from app.services.pose.yolo_adapter import YoloPoseEstimator

class PoseEstimatorFactory:
    _instances: Dict[str, BasePoseEstimator] = {}

    @classmethod
    def get_estimator(cls, model_name: str = "mediapipe", min_confidence: float = 0.5) -> BasePoseEstimator:
        model_name = model_name.lower().strip()
        if model_name not in cls._instances or cls._instances[model_name] is None:
            if model_name == "yolo":
                cls._instances[model_name] = YoloPoseEstimator(min_confidence=min_confidence)
            else:  # default mediapipe
                cls._instances[model_name] = MediaPipePoseEstimator(min_confidence=min_confidence)

        return cls._instances[model_name]

    @classmethod
    def close_all(cls):
        for name, inst in cls._instances.items():
            if inst:
                inst.close()
        cls._instances.clear()

