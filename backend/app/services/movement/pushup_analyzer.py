from typing import Dict, Any, Optional, Tuple
from app.schemas.pose import PoseResult, MovementAnalysisResult, RepetitionResult
from app.services.movement.base import BaseMovementAnalyzer
from app.services.movement.geometry import calculate_angle

class PushUpAnalyzer(BaseMovementAnalyzer):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        # Adapt baseline thresholds based on Gender (Pria vs Wanita)
        if self.is_female:
            self.base_down_threshold = float(self.config.get("down_elbow_angle_threshold", 95.0))
            self.base_up_threshold = float(self.config.get("up_elbow_angle_threshold", 155.0))
            self.base_alignment_threshold = float(self.config.get("body_alignment_angle_threshold", 140.0))
        else:
            self.base_down_threshold = float(self.config.get("down_elbow_angle_threshold", 90.0))
            self.base_up_threshold = float(self.config.get("up_elbow_angle_threshold", 160.0))
            self.base_alignment_threshold = float(self.config.get("body_alignment_angle_threshold", 155.0))

        # Effective thresholds incorporate the examiner-configured tolerance
        self.down_threshold = self.base_down_threshold + self.tolerance_deg
        self.up_threshold = self.base_up_threshold - self.tolerance_deg
        self.alignment_threshold = max(115.0, self.base_alignment_threshold - self.tolerance_deg)

        # Flags for current rep
        self.reached_bottom = False
        self.min_elbow_angle_in_rep = 180.0
        self.max_elbow_angle_in_rep = 0.0
        self.alignment_maintained = True
        self.lowest_alignment_in_rep = 180.0

    def _select_side(self, landmarks: dict) -> str:
        left_pts = ["left_shoulder", "left_elbow", "left_wrist", "left_hip", "left_ankle"]
        right_pts = ["right_shoulder", "right_elbow", "right_wrist", "right_hip", "right_ankle"]

        left_conf = sum(landmarks[p].confidence for p in left_pts if p in landmarks and landmarks[p].is_valid)
        right_conf = sum(landmarks[p].confidence for p in right_pts if p in landmarks and landmarks[p].is_valid)

        return "left" if left_conf >= right_conf else "right"

    def process_frame(self, pose_result: PoseResult, timestamp_ms: int = 0) -> MovementAnalysisResult:
        if self.cooldown_counter > 0:
            self.cooldown_counter -= 1

        if not pose_result.is_detected or not pose_result.landmarks:
            self.consecutive_lost_frames += 1
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="pushup",
                phase=self.state,
                current_angle=last_angle,
                detected_reps=self.detected_reps,
                verified_reps=self.verified_reps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Pose tubuh tidak terdeteksi kamera",
                is_in_good_form=False,
                landmark_confidence_avg=0.0
            )

        self.consecutive_lost_frames = 0
        landmarks = pose_result.landmarks
        side = self._select_side(landmarks)

        sh_name, el_name, wr_name = f"{side}_shoulder", f"{side}_elbow", f"{side}_wrist"
        hip_name, ank_name = f"{side}_hip", f"{side}_ankle"

        # Check required landmarks for push-up
        required = [sh_name, el_name, wr_name, hip_name]
        missing = [p for p in required if p not in landmarks or not landmarks[p].is_valid]
        if missing:
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="pushup",
                phase=self.state,
                current_angle=last_angle,
                detected_reps=self.detected_reps,
                verified_reps=self.verified_reps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Landmark lengan/tubuh tertutup atau tidak jelas",
                is_in_good_form=False,
                landmark_confidence_avg=pose_result.confidence_score
            )

        # 1. Calculate Elbow Angle
        p_sh = (landmarks[sh_name].x, landmarks[sh_name].y)
        p_el = (landmarks[el_name].x, landmarks[el_name].y)
        p_wr = (landmarks[wr_name].x, landmarks[wr_name].y)
        raw_elbow_angle = calculate_angle(p_sh, p_el, p_wr)
        elbow_angle = self.angle_filter.filter(raw_elbow_angle)

        # 2. Calculate Body Alignment (Wanita: Knee/Ankle support, Pria: Ankle standard)
        p_hip = (landmarks[hip_name].x, landmarks[hip_name].y)
        knee_name = f"{side}_knee"
        if self.is_female:
            lower_pt = (landmarks[knee_name].x, landmarks[knee_name].y) if (knee_name in landmarks and landmarks[knee_name].is_valid) else \
                       (landmarks[ank_name].x, landmarks[ank_name].y) if (ank_name in landmarks and landmarks[ank_name].is_valid) else p_hip
        else:
            lower_pt = (landmarks[ank_name].x, landmarks[ank_name].y) if (ank_name in landmarks and landmarks[ank_name].is_valid) else \
                       (landmarks[knee_name].x, landmarks[knee_name].y) if (knee_name in landmarks and landmarks[knee_name].is_valid) else p_hip

        alignment_angle = calculate_angle(p_sh, p_hip, lower_pt) if lower_pt != p_hip else 180.0

        feedback = f"Posisi siap ({'Wanita' if self.is_female else 'Pria'} | Tol \u00b1{int(self.tolerance_deg)}\u00b0)"
        is_good_form = True

        if alignment_angle < self.alignment_threshold:
            feedback = "Pinggul melorot atau terlalu naik! Luruskan badan."
            is_good_form = False
            if self.state in ["DESCENDING", "BOTTOM", "ASCENDING"]:
                self.alignment_maintained = False
                self.lowest_alignment_in_rep = min(self.lowest_alignment_in_rep, alignment_angle)

        # Finite State Machine for Push-up
        if self.state in ["INIT", "UP"]:
            # Must achieve valid plank posture before starting
            if elbow_angle >= (self.up_threshold - self.hysteresis_deg):
                if alignment_angle >= (self.alignment_threshold - 25.0):
                    self.state = "UP"
                    feedback = "Posisi siap. Mulai turunkan badan."
                else:
                    if self.state == "INIT":
                        feedback = "Luruskan badan (posisi plank) untuk bersiap"
                        is_good_form = False
            elif self.state == "INIT":
                feedback = "Ambil posisi plank lurus dan rentangkan tangan untuk bersiap"
                is_good_form = False

            if self.state == "UP" and elbow_angle < (self.up_threshold - 10.0):
                self.rep_start_timestamp_ms = timestamp_ms
                self.min_elbow_angle_in_rep = elbow_angle
                self.max_elbow_angle_in_rep = elbow_angle
                self.alignment_maintained = is_good_form
                self.reached_bottom = False
                if elbow_angle <= (self.down_threshold + self.hysteresis_deg):
                    self.state = "BOTTOM"
                    self.reached_bottom = True
                    feedback = "Kedalaman tercapai! Dorong badan ke atas."
                else:
                    self.state = "DESCENDING"
                    feedback = "Turunkan badan hingga siku 90 derajat"

        elif self.state == "DESCENDING":
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)
            if elbow_angle <= (self.down_threshold + self.hysteresis_deg):
                self.state = "BOTTOM"
                self.reached_bottom = True
                feedback = "Kedalaman tercapai! Dorong badan ke atas."
            elif elbow_angle > (self.min_elbow_angle_in_rep + 18.0):
                self.state = "ASCENDING"
                feedback = "Mendorong sebelum kedalaman penuh!"

        elif self.state == "BOTTOM":
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)
            if elbow_angle > (self.down_threshold + self.hysteresis_deg):
                self.state = "ASCENDING"
                feedback = "Dorong terus hingga siku lurus sempurna."

        if self.state == "ASCENDING":
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)
            if elbow_angle >= (self.up_threshold - self.hysteresis_deg):
                rom = self.max_elbow_angle_in_rep - self.min_elbow_angle_in_rep
                duration_ms = max(10, timestamp_ms - self.rep_start_timestamp_ms)

                # Real movement attempt validation (reject idle jitter / micro-movements)
                # Genuine pushup attempt requires minimum 25 deg ROM and bending below 145 deg
                if rom < 25.0 or self.min_elbow_angle_in_rep > 145.0 or (self.rep_start_timestamp_ms > 0 and duration_ms < 300):
                    # Discard as stationary fidgeting / noise
                    self.state = "UP"
                    feedback = "Gerakan minimal / belum penuh. Tetap di posisi siap."
                elif self.cooldown_counter == 0:
                    # Cycle complete!
                    self.detected_reps += 1

                    if self.reached_bottom and self.alignment_maintained:
                        self.verified_reps += 1
                        rep_valid = True
                        rep_reason = None
                        rep_feedback = "Repetisi Sempurna!"
                    elif not self.reached_bottom:
                        self.rejected_reps += 1
                        rep_valid = False
                        rep_reason = "Kedalaman belum terpenuhi"
                        rep_feedback = f"Siku hanya mencapai {self.min_elbow_angle_in_rep:.1f}° (harus <= {self.down_threshold}°)"
                    else:
                        self.rejected_reps += 1
                        rep_valid = False
                        rep_reason = "Posisi tubuh perlu diperbaiki"
                        rep_feedback = f"Kelurusan badan {self.lowest_alignment_in_rep:.1f}° (harus >= {self.alignment_threshold}°)"

                    self.last_rep_result = RepetitionResult(
                        rep_number=self.detected_reps,
                        is_valid=rep_valid,
                        rejection_reason=rep_reason,
                        peak_angle=self.max_elbow_angle_in_rep,
                        min_angle=self.min_elbow_angle_in_rep,
                        start_time_ms=self.rep_start_timestamp_ms,
                        end_time_ms=timestamp_ms,
                        duration_ms=duration_ms,
                        feedback=rep_feedback
                    )

                    self.state = "UP"
                    self.cooldown_counter = self.cooldown_frames
                    feedback = rep_feedback

        return MovementAnalysisResult(
            exercise_type="pushup",
            phase=self.state,
            current_angle=elbow_angle,
            body_alignment_angle=alignment_angle,
            detected_reps=self.detected_reps,
            verified_reps=self.verified_reps,
            rejected_reps=self.rejected_reps,
            last_rep=self.last_rep_result,
            feedback_message=feedback,
            is_in_good_form=is_good_form,
            landmark_confidence_avg=pose_result.confidence_score
        )
