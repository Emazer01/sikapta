"""
Targeted unit tests for Shuttle Run counting and scoring.
Tests the analyzer logic, state transitions, figure-8 tracking, and official scoring tables.
"""
import pytest
from app.services.movement.shuttlerun_analyzer import ShuttleRunAnalyzer
from app.services.movement.factory import MovementAnalyzerFactory
from app.services.assessment.running_score import calculate_shuttlerun_score, calculate_calisthenics_score, evaluate_total_samapta
from app.schemas.pose import PoseResult, LandmarkPoint


def _make_dummy_pose(x: float = 0.5, y: float = 0.5, confidence: float = 0.9) -> PoseResult:
    landmarks = {
        "left_hip": LandmarkPoint(name="left_hip", x=x - 0.05, y=y, confidence=confidence, is_valid=True),
        "right_hip": LandmarkPoint(name="right_hip", x=x + 0.05, y=y, confidence=confidence, is_valid=True),
    }
    return PoseResult(
        model_name="test",
        is_detected=True,
        confidence_score=confidence,
        inference_latency_ms=10.0,
        landmarks=landmarks
    )


def test_shuttle_run_scoring():
    # Male scoring
    assert calculate_shuttlerun_score(15.5, "L") == 100.0  # <= 16.2 is 100
    assert calculate_shuttlerun_score(16.2, "L") == 100.0
    assert calculate_shuttlerun_score(26.5, "L") == 0.0    # >= 26.0 is 0
    # Interpolated score between 16.2 (100) and 17.0 (90)
    score_male = calculate_shuttlerun_score(16.6, "L")
    assert 90.0 <= score_male <= 100.0

    # Female scoring
    assert calculate_shuttlerun_score(17.0, "P") == 100.0  # <= 17.6 is 100
    assert calculate_shuttlerun_score(17.6, "P") == 100.0
    assert calculate_shuttlerun_score(28.0, "P") == 0.0    # >= 27.5 is 0
    # Interpolated score between 17.6 (100) and 18.5 (90)
    score_fem = calculate_shuttlerun_score(18.0, "P")
    assert 90.0 <= score_fem <= 100.0

    # Calisthenics wrapper integration
    assert calculate_calisthenics_score("shuttlerun", 16.0, "L") == 100.0
    assert calculate_calisthenics_score("shuttle", 17.5, "P") == 100.0


def test_movement_analyzer_factory():
    analyzer = MovementAnalyzerFactory.create_analyzer("shuttlerun", {"gender": "L"})
    assert isinstance(analyzer, ShuttleRunAnalyzer)
    assert analyzer.exercise_type == "shuttlerun"


def test_shuttle_run_analyzer_simulation():
    analyzer = ShuttleRunAnalyzer({
        "gender": "L",
        "left_threshold": 0.30,
        "right_threshold": 0.70,
        "min_crossing_ms": 400
    })

    t = 0
    # 1. Runner appears at start pole (left pole: x=0.15)
    for _ in range(5):
        t += 100
        res = analyzer.process_frame(_make_dummy_pose(x=0.15), timestamp_ms=t)
    assert res.phase == "READY"

    # 2. Complete 6 crossings (3 full laps)
    # Positions alternating: Right (0.85) -> Left (0.15) -> Right (0.85) -> ...
    for crossing_idx in range(6):
        target_x = 0.85 if crossing_idx % 2 == 0 else 0.15

        # Move towards middle
        for step in range(5):
            t += 150
            analyzer.process_frame(_make_dummy_pose(x=0.50), timestamp_ms=t)

        # Reach pole zone
        for step in range(5):
            t += 150
            res = analyzer.process_frame(_make_dummy_pose(x=target_x), timestamp_ms=t)

        assert analyzer.completed_crossings == crossing_idx + 1

    # Verify completion
    assert res.phase == "SELESAI"
    assert analyzer.shuttle_state == "COMPLETED"
    assert analyzer.completed_laps == 3
    assert analyzer.completed_crossings == 6
    assert analyzer.elapsed_time_seconds > 0
    assert analyzer.final_shuttle_score > 0
    assert res.last_rep is not None
    assert res.last_rep.is_valid is True


def test_samapta_b_with_shuttle_run():
    # Evaluate total samapta with A (Run) and B (Pullup, Pushup, Situp, Shuttle Run)
    score_a = 80.0
    scores_b = [85.0, 90.0, 75.0, 95.0]
    final_score, pred = evaluate_total_samapta(score_a, scores_b)
    # Avg B = (85 + 90 + 75 + 95) / 4 = 86.25 -> Total = (80 + 86.25) / 2 = 83.1
    assert final_score == 83.1
    assert "BAIK" in pred


def test_shuttle_run_auto_stop_payload():
    from app.services.assessment.session_manager import ActiveAssessmentSession
    session = ActiveAssessmentSession(
        session_id=9999,
        session_code="TEST-SHUTTLE-AUTOSTOP",
        participant_id=1,
        camera_id=None,
        exercise_type="shuttlerun",
        model_name="mediapipe",
        rule_config={"gender": "L"}
    )
    payload = session.get_current_state_payload(fps=30.0, latency_ms=15.0)
    assert payload["exercise"] == "shuttlerun"
    assert "is_completed" in payload
    assert "final_time_seconds" in payload
    assert "final_score" in payload
    assert payload["is_completed"] is False

    # Simulate completed shuttle analyzer
    session.analyzer.shuttle_state = "COMPLETED"
    session.analyzer.completed_laps = 3
    session.analyzer.completed_crossings = 6
    session.analyzer.elapsed_time_seconds = 16.2
    session.analyzer.final_shuttle_score = 100.0
    session.status = "completed"

    payload_done = session.get_current_state_payload(fps=30.0, latency_ms=15.0)
    assert payload_done["is_completed"] is True
    assert payload_done["final_time_seconds"] == 16.2
    assert payload_done["final_score"] == 100.0

