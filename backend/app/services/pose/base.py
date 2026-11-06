from abc import ABC, abstractmethod
import numpy as np
import cv2
from typing import Dict, List, Tuple
from app.schemas.pose import PoseResult, LandmarkPoint

# Standard Landmark Names
STANDARD_LANDMARKS = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
]

# Standard Skeleton Connections for Visualization
SKELETON_CONNECTIONS = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle")
]

class BasePoseEstimator(ABC):
    @abstractmethod
    def estimate(self, frame: np.ndarray, timestamp_ms: int) -> PoseResult:
        """Run pose estimation on frame (BGR) and return standardized PoseResult."""
        pass

    @abstractmethod
    def close(self):
        """Release any hardware/model resources."""
        pass

    def draw_skeleton(
        self,
        frame: np.ndarray,
        pose_result: PoseResult,
        status_color: Tuple[int, int, int] = (0, 255, 0)
    ) -> np.ndarray:
        """
        Render skeleton and landmarks on the frame.
        status_color: BGR tuple (default green: (0, 255, 0))
        """
        if not pose_result.is_detected or not pose_result.landmarks:
            return frame

        annotated = frame.copy()
        h, w, _ = annotated.shape
        landmarks = pose_result.landmarks

        # 1. Draw Skeleton Lines
        for pt1_name, pt2_name in SKELETON_CONNECTIONS:
            p1 = landmarks.get(pt1_name)
            p2 = landmarks.get(pt2_name)
            if p1 and p2 and p1.is_valid and p2.is_valid:
                c1 = (int(p1.x * w), int(p1.y * h))
                c2 = (int(p2.x * w), int(p2.y * h))
                # Antialiased line
                cv2.line(annotated, c1, c2, (220, 220, 220), 2, cv2.LINE_AA)
                cv2.line(annotated, c1, c2, status_color, 1, cv2.LINE_AA)

        # 2. Draw Landmark Points
        for name, pt in landmarks.items():
            if pt.is_valid:
                cx, cy = int(pt.x * w), int(pt.y * h)
                # Outer circle
                cv2.circle(annotated, (cx, cy), 5, (255, 255, 255), -1, cv2.LINE_AA)
                # Inner circle with status color
                cv2.circle(annotated, (cx, cy), 3, status_color, -1, cv2.LINE_AA)

        return annotated

