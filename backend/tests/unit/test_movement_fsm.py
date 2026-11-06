import pytest
from app.schemas.pose import PoseResult, LandmarkPoint
from app.services.movement.pushup_analyzer import PushUpAnalyzer
from app.services.movement.pullup_analyzer import PullUpAnalyzer
from app.services.movement.situp_analyzer import SitUpAnalyzer

def create_pose_landmarks(landmarks_dict: dict) -> PoseResult:
    pts = {}
    for name, (x, y) in landmarks_dict.items():
        pts[name] = LandmarkPoint(
            name=name,
            x=x,
            y=y,
            z=0.0,
            confidence=0.9,
            is_valid=True
        )
    return PoseResult(
        is_detected=True,
        model_name="test",
        landmarks=pts,
        timestamp_ms=0,
        confidence_score=0.9
    )

def test_pushup_valid_cycle():
    analyzer = PushUpAnalyzer(config={
        "down_elbow_angle_threshold": 90.0,
        "up_elbow_angle_threshold": 160.0,
        "body_alignment_angle_threshold": 150.0,
        "smoothing_window": 1,
        "cooldown_frames": 0
    })

    # 1. UP position: straight arm (elbow angle ~180), straight body
    up_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.3),
        "left_elbow": (0.6, 0.5),
        "left_wrist": (0.6, 0.7),
        "left_hip": (0.4, 0.3),
        "left_ankle": (0.2, 0.3)
    })

    # 2. BOTTOM position: 90 deg bent elbow
    bottom_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.5),
        "left_elbow": (0.4, 0.5),
        "left_wrist": (0.4, 0.7),
        "left_hip": (0.4, 0.5),
        "left_ankle": (0.2, 0.5)
    })

    # Start at UP
    res1 = analyzer.process_frame(up_pose, timestamp_ms=0)
    assert res1.phase in ["INIT", "UP"]

    # Descend to BOTTOM
    res2 = analyzer.process_frame(bottom_pose, timestamp_ms=500)
    assert res2.phase == "BOTTOM"

    # Ascend back to UP -> rep completed!
    res3 = analyzer.process_frame(up_pose, timestamp_ms=1000)
    assert res3.verified_reps == 1
    assert res3.detected_reps == 1
    assert res3.rejected_reps == 0
    assert res3.last_rep.is_valid is True

def test_pushup_partial_rep_rejected():
    analyzer = PushUpAnalyzer(config={
        "down_elbow_angle_threshold": 90.0,
        "up_elbow_angle_threshold": 160.0,
        "smoothing_window": 1,
        "cooldown_frames": 0
    })

    up_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.3),
        "left_elbow": (0.6, 0.5),
        "left_wrist": (0.6, 0.7),
        "left_hip": (0.4, 0.3),
        "left_ankle": (0.2, 0.3)
    })

    # Shallow descent (only ~120 degrees, not reaching 90)
    shallow_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.4),
        "left_elbow": (0.55, 0.55),
        "left_wrist": (0.6, 0.7),
        "left_hip": (0.4, 0.4),
        "left_ankle": (0.2, 0.4)
    })

    analyzer.process_frame(up_pose, timestamp_ms=0)
    analyzer.process_frame(shallow_pose, timestamp_ms=300)
    # Ascends prematurely
    res = analyzer.process_frame(up_pose, timestamp_ms=700)

    assert res.detected_reps == 1
    assert res.verified_reps == 0
    assert res.rejected_reps == 1
    assert res.last_rep.is_valid is False
    assert "Kedalaman belum terpenuhi" in res.last_rep.rejection_reason

def test_situp_valid_cycle():
    analyzer = SitUpAnalyzer(config={
        "down_torso_angle_threshold": 140.0,
        "up_torso_angle_threshold": 60.0,
        "smoothing_window": 1,
        "cooldown_frames": 0
    })

    # 1. Rebah (lying down) -> angle shoulder-hip-knee ~180 deg
    down_pose = create_pose_landmarks({
        "left_shoulder": (0.2, 0.8),
        "left_hip": (0.5, 0.8),
        "left_knee": (0.7, 0.8)
    })

    # 2. Up (sitting up) -> angle shoulder-hip-knee <= 60 deg (45 deg)
    up_pose = create_pose_landmarks({
        "left_shoulder": (0.65, 0.65),
        "left_hip": (0.5, 0.8),
        "left_knee": (0.7, 0.8)
    })

    analyzer.process_frame(down_pose, timestamp_ms=0)
    res_up = analyzer.process_frame(up_pose, timestamp_ms=500)
    assert res_up.phase == "UP"

    res_completed = analyzer.process_frame(down_pose, timestamp_ms=1000)
    assert res_completed.verified_reps == 1
    assert res_completed.last_rep.is_valid is True

def test_situp_stationary_no_false_reps():
    """Verify that when a person is stationary or sitting (e.g. angle ~106 deg), 0 reps are counted."""
    analyzer = SitUpAnalyzer(config={
        "down_torso_angle_threshold": 140.0,
        "up_torso_angle_threshold": 60.0,
        "smoothing_window": 3,
        "cooldown_frames": 5
    })

    # Sitting pose (angle ~106.5 deg, like in user screenshot)
    # Vertex at hip (0.5, 0.7)
    # Shoulder: (0.4, 0.4)
    # Knee: (0.7, 0.7)
    sitting_pose = create_pose_landmarks({
        "left_shoulder": (0.4, 0.4),
        "left_hip": (0.5, 0.7),
        "left_knee": (0.7, 0.7)
    })

    # Send 50 frames with slight sensor jitter in stationary state
    for i in range(50):
        res = analyzer.process_frame(sitting_pose, timestamp_ms=i * 33)
        assert res.phase == "INIT"
        assert res.detected_reps == 0
        assert res.verified_reps == 0
        assert res.rejected_reps == 0

def test_situp_knees_occluded_fallback():
    """Verify that when knees are out of frame (webcam framing), torso elevation fallback counts reps accurately."""
    analyzer = SitUpAnalyzer(config={
        "smoothing_window": 1,
        "cooldown_frames": 0
    })

    # 1. Rebah (lying down) - shoulders and hips only, horizontal
    # y=0.8 for both shoulder and hip
    down_pose = create_pose_landmarks({
        "left_shoulder": (0.3, 0.8),
        "left_hip": (0.6, 0.8)
    })

    # 2. Up (sitting erect) - shoulder rises to y=0.35, hip at y=0.8
    up_pose = create_pose_landmarks({
        "left_shoulder": (0.45, 0.35),
        "left_hip": (0.5, 0.8)
    })

    res_down = analyzer.process_frame(down_pose, timestamp_ms=0)
    assert res_down.phase == "DOWN_START"
    assert res_down.current_angle >= 120.0

    res_up = analyzer.process_frame(up_pose, timestamp_ms=500)
    assert res_up.phase == "UP"
    assert res_up.current_angle <= 75.0

    res_completed = analyzer.process_frame(down_pose, timestamp_ms=1000)
    assert res_completed.verified_reps == 1
    assert res_completed.last_rep.is_valid is True

def test_pushup_stationary_plank_no_false_reps():
    """Verify that when holding plank with slight jitter, 0 reps are counted."""
    analyzer = PushUpAnalyzer(config={
        "down_elbow_angle_threshold": 90.0,
        "up_elbow_angle_threshold": 160.0,
        "smoothing_window": 3,
        "cooldown_frames": 5
    })

    plank_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.3),
        "left_elbow": (0.6, 0.5),
        "left_wrist": (0.6, 0.7),
        "left_hip": (0.4, 0.3),
        "left_ankle": (0.2, 0.3)
    })

    # Send 50 frames stationary
    for i in range(50):
        res = analyzer.process_frame(plank_pose, timestamp_ms=i * 33)
        assert res.detected_reps == 0
        assert res.verified_reps == 0
        assert res.rejected_reps == 0

def test_female_pushup_with_tolerance():
    """Verify female push-up with knee support and tolerance works properly."""
    analyzer = PushUpAnalyzer(config={
        "gender": "P",
        "tolerance_deg": 10.0,
        "smoothing_window": 1,
        "cooldown_frames": 0
    })

    # Wanita Knee Push-up: Up position with knee support
    up_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.3),
        "left_elbow": (0.6, 0.5),
        "left_wrist": (0.6, 0.7),
        "left_hip": (0.4, 0.3),
        "left_knee": (0.2, 0.3)
    })

    # Bottom position: 100 deg bent elbow (within 95 + 10 = 105 deg tolerance)
    # Cosine ~ -0.17 -> ~100 deg
    bottom_pose = create_pose_landmarks({
        "left_shoulder": (0.6, 0.5),
        "left_elbow": (0.42, 0.5),
        "left_wrist": (0.45, 0.7),
        "left_hip": (0.4, 0.5),
        "left_knee": (0.2, 0.5)
    })

    analyzer.process_frame(up_pose, timestamp_ms=0)
    res_bottom = analyzer.process_frame(bottom_pose, timestamp_ms=500)
    assert res_bottom.phase in ["BOTTOM", "DESCENDING"]

    res_up = analyzer.process_frame(up_pose, timestamp_ms=1000)
    assert res_up.detected_reps == 1
    assert res_up.verified_reps == 1
    assert res_up.last_rep.is_valid is True

def test_pullup_valid_cycle():
    """Verify standard pull-up cycle based on elbow joint angle (without bar requirement)."""
    analyzer = PullUpAnalyzer(config={
        "smoothing_window": 1,
        "cooldown_frames": 0,
        "top_elbow_angle_threshold": 70.0,
        "bottom_elbow_angle_threshold": 155.0
    })

    # 1. Dead Hang Pose (elbow straight ~180 deg)
    hang_pose = create_pose_landmarks({
        "left_wrist": (0.5, 0.15),
        "left_elbow": (0.5, 0.30),
        "left_shoulder": (0.5, 0.45)
    })

    # 2. Top Pulling Pose (elbow sharply bent ~45 deg <= 70 deg)
    top_pose = create_pose_landmarks({
        "left_wrist": (0.5, 0.15),
        "left_elbow": (0.5, 0.25),
        "left_shoulder": (0.55, 0.20)
    })

    # Frame 1: Dead hang
    res1 = analyzer.process_frame(hang_pose, timestamp_ms=0)
    assert res1.phase in ["INIT", "HANG_BOTTOM"]

    # Frame 2: Top
    res2 = analyzer.process_frame(top_pose, timestamp_ms=600)
    assert res2.phase == "TOP"

    # Frame 3: Descend back to Dead Hang
    res3 = analyzer.process_frame(hang_pose, timestamp_ms=1200)
    assert res3.detected_reps == 1
    assert res3.verified_reps == 1
    assert res3.rejected_reps == 0
    assert res3.last_rep.is_valid is True

def test_pullup_shallow_rep_rejected():
    """Verify pull-up with incomplete elbow flexion (< 70 deg threshold not met) is rejected."""
    analyzer = PullUpAnalyzer(config={
        "smoothing_window": 1,
        "cooldown_frames": 0,
        "top_elbow_angle_threshold": 70.0,
        "bottom_elbow_angle_threshold": 155.0
    })

    # 1. Dead Hang Pose
    hang_pose = create_pose_landmarks({
        "left_wrist": (0.5, 0.15),
        "left_elbow": (0.5, 0.30),
        "left_shoulder": (0.5, 0.45)
    })

    # 2. Shallow Pulling Pose (elbow bent only to ~110 deg, not reaching 70 deg)
    # Vector elbow->wrist: (0, -0.15), Vector elbow->shoulder: (0.1, 0.05) -> angle ~116 deg
    shallow_pose = create_pose_landmarks({
        "left_wrist": (0.5, 0.15),
        "left_elbow": (0.5, 0.30),
        "left_shoulder": (0.6, 0.35)
    })

    analyzer.process_frame(hang_pose, timestamp_ms=0)
    analyzer.process_frame(shallow_pose, timestamp_ms=400)
    res_end = analyzer.process_frame(hang_pose, timestamp_ms=1000)

    assert res_end.detected_reps == 1
    assert res_end.verified_reps == 0
    assert res_end.rejected_reps == 1
    assert res_end.last_rep.is_valid is False
    assert "Kedalaman belum terpenuhi" in res_end.last_rep.rejection_reason


