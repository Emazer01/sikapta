from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
from app.schemas.pose import PoseResult, MovementAnalysisResult, RepetitionResult
from app.services.movement.geometry import MovingAverageFilter

class BaseMovementAnalyzer(ABC):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.min_confidence = self.config.get("min_confidence", 0.5)
        self.smoothing_window = self.config.get("smoothing_window", 5)

        # Gender & Tolerance configurations
        self.gender = str(self.config.get("gender", "L")).upper()
        self.is_female = self.gender in ["P", "FEMALE", "WANITA", "PEREMPUAN"]
        self.tolerance_deg = float(self.config.get("tolerance_deg", self.config.get("hysteresis_deg", 5.0)))
        self.hysteresis_deg = max(3.0, self.tolerance_deg)

        self.cooldown_frames = self.config.get("cooldown_frames", 10)
        self.min_phase_duration_ms = self.config.get("min_phase_duration_ms", 300)
        self.min_rep_duration_ms = self.config.get("min_rep_duration_ms", 450)
        self.max_pose_loss_frames = self.config.get("max_pose_loss_frames", 5)

        self.angle_filter = MovingAverageFilter(window_size=self.smoothing_window)
        self.reset()

    def reset(self):
        self.state = "INIT"
        self.prep_frames_count = 0
        self.detected_reps = 0
        self.verified_reps = 0
        self.rejected_reps = 0
        self.last_rep_result: Optional[RepetitionResult] = None
        self.cooldown_counter = 0
        self.consecutive_lost_frames = 0
        self.state_enter_timestamp_ms = 0
        self.rep_start_timestamp_ms = 0
        self.rep_peak_angle = 0.0
        self.rep_min_angle = 360.0
        self.angle_filter.reset()

    @abstractmethod
    def process_frame(self, pose_result: PoseResult, timestamp_ms: int) -> MovementAnalysisResult:
        """Process incoming pose landmarks and update movement state machine."""
        pass

