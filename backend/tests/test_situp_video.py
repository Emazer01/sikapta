import os
from pathlib import Path
import pytest
import cv2
from app.services.pose.mediapipe_adapter import MediaPipePoseEstimator
from app.services.movement.situp_analyzer import SitUpAnalyzer

VIDEO_PATH = Path(r"C:\Users\Advan\.gemini\antigravity\brain\3afe4011-f47b-4675-bfa4-a406fd5d3374\.user_uploaded\media_1793864402262_a5491575.mp4")

@pytest.mark.skipif(not VIDEO_PATH.exists(), reason="Video file not found")
def test_situp_video_detects_10_repetitions():
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    assert cap.isOpened(), "Could not open sit-up test video"
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    estimator = MediaPipePoseEstimator(min_confidence=0.5)
    analyzer = SitUpAnalyzer(config={
        "gender": "L",
        "tolerance_deg": 5.0,
        "down_torso_angle_threshold": 125.0,
        "up_torso_angle_threshold": 70.0,
        "hysteresis_deg": 5.0,
        "cooldown_frames": 10
    })
    
    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        ts_ms = int((frame_idx / fps) * 1000)
        pose_res = estimator.estimate(frame, timestamp_ms=ts_ms)
        analyzer.process_frame(pose_res, timestamp_ms=ts_ms)
        frame_idx += 1
    
    cap.release()
    
    assert analyzer.detected_reps == 10, f"Expected 10 detected reps, got {analyzer.detected_reps}"
    assert analyzer.verified_reps == 10, f"Expected 10 verified reps, got {analyzer.verified_reps}"
    assert analyzer.rejected_reps == 0, f"Expected 0 rejected reps, got {analyzer.rejected_reps}"

