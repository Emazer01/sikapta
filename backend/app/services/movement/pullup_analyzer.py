from typing import Dict, Any, Optional
from app.schemas.pose import PoseResult, MovementAnalysisResult, RepetitionResult
from app.services.movement.base import BaseMovementAnalyzer
from app.services.movement.geometry import calculate_angle

class PullUpAnalyzer(BaseMovementAnalyzer):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        # Adapt baseline thresholds based on Gender (Pria vs Wanita)
        if self.is_female:
            # Chinning / Modified pull-up wanita
            self.base_bottom_elbow_threshold = float(self.config.get("bottom_elbow_angle_threshold", 145.0))
            self.base_top_elbow_threshold = float(self.config.get("top_elbow_angle_threshold", 85.0))
        else:
            # Pull-up gantung standar pria
            self.base_bottom_elbow_threshold = float(self.config.get("bottom_elbow_angle_threshold", 155.0))
            self.base_top_elbow_threshold = float(self.config.get("top_elbow_angle_threshold", 70.0))

        # Effective thresholds incorporate the examiner-configured tolerance
        self.bottom_elbow_threshold = self.base_bottom_elbow_threshold - self.tolerance_deg
        self.top_elbow_threshold = self.base_top_elbow_threshold + self.tolerance_deg

        self.reached_top = False
        self.min_elbow_angle_in_rep = 180.0
        self.max_elbow_angle_in_rep = 0.0

    def process_frame(self, pose_result: PoseResult, timestamp_ms: int = 0) -> MovementAnalysisResult:
        if self.cooldown_counter > 0:
            self.cooldown_counter -= 1

        if not pose_result.is_detected or not pose_result.landmarks:
            self.consecutive_lost_frames += 1
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="pullup",
                phase=self.state,
                current_angle=last_angle,
                detected_reps=self.detected_reps,
                verified_reps=self.verified_reps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Pose tubuh tidak terdeteksi",
                is_in_good_form=False,
                landmark_confidence_avg=0.0
            )

        self.consecutive_lost_frames = 0
        landmarks = pose_result.landmarks

        # We evaluate both arms or whichever arm is clearly visible
        has_left = all(p in landmarks and landmarks[p].is_valid for p in ["left_shoulder", "left_elbow", "left_wrist"])
        has_right = all(p in landmarks and landmarks[p].is_valid for p in ["right_shoulder", "right_elbow", "right_wrist"])

        if not has_left and not has_right:
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="pullup",
                phase=self.state,
                current_angle=last_angle,
                detected_reps=self.detected_reps,
                verified_reps=self.verified_reps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Lengan tidak terdeteksi jelas",
                is_in_good_form=False,
                landmark_confidence_avg=pose_result.confidence_score
            )

        # Calculate elbow angles
        angles = []
        if has_left:
            a_l = calculate_angle(
                (landmarks["left_shoulder"].x, landmarks["left_shoulder"].y),
                (landmarks["left_elbow"].x, landmarks["left_elbow"].y),
                (landmarks["left_wrist"].x, landmarks["left_wrist"].y)
            )
            angles.append(a_l)

        if has_right:
            a_r = calculate_angle(
                (landmarks["right_shoulder"].x, landmarks["right_shoulder"].y),
                (landmarks["right_elbow"].x, landmarks["right_elbow"].y),
                (landmarks["right_wrist"].x, landmarks["right_wrist"].y)
            )
            angles.append(a_r)

        raw_elbow_angle = sum(angles) / len(angles)
        elbow_angle = self.angle_filter.filter(raw_elbow_angle)

        feedback = "Gantung dengan lengan lurus"
        is_good_form = True

        # State Machine for Pull-up (berbasis sudut sendi siku murni tanpa palang)
        if self.state in ["INIT", "HANG_BOTTOM"]:
            # Validasi posisi awal gantung (dead hang)
            if elbow_angle >= (self.bottom_elbow_threshold - self.hysteresis_deg):
                self.state = "HANG_BOTTOM"
                feedback = "Posisi gantung siap. Tarik badan ke atas!"
            elif self.state == "INIT":
                feedback = "Gantung lurus untuk posisi awal"
                is_good_form = False

            if self.state == "HANG_BOTTOM" and elbow_angle < (self.bottom_elbow_threshold - 15.0):
                self.state = "PULLING_UP"
                self.rep_start_timestamp_ms = timestamp_ms
                self.reached_top = False
                self.min_elbow_angle_in_rep = elbow_angle
                self.max_elbow_angle_in_rep = elbow_angle
                feedback = "Tarik badan ke atas!"

                # Jika frame langsung mencapai sudut puncak
                if elbow_angle <= (self.top_elbow_threshold + self.hysteresis_deg):
                    self.reached_top = True
                    self.state = "TOP"
                    feedback = "Puncak tarikan tercapai! Turunkan badan perlahan."

        elif self.state == "PULLING_UP":
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)

            if elbow_angle <= (self.top_elbow_threshold + self.hysteresis_deg):
                self.reached_top = True
                self.state = "TOP"
                feedback = "Puncak tarikan tercapai! Turunkan badan perlahan."
            elif elbow_angle > (self.min_elbow_angle_in_rep + 20.0):
                # Mulai turun sebelum mencapai puncak tarikan
                self.state = "DESCENDING"
                feedback = "Turun sebelum mencapai puncak tarikan!"

        elif self.state == "TOP":
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)

            if elbow_angle > (self.top_elbow_threshold + self.hysteresis_deg):
                self.state = "DESCENDING"
                feedback = "Turunkan badan sampai lengan lurus sempurna."

        if self.state == "DESCENDING":
            self.max_elbow_angle_in_rep = max(self.max_elbow_angle_in_rep, elbow_angle)
            self.min_elbow_angle_in_rep = min(self.min_elbow_angle_in_rep, elbow_angle)

            if elbow_angle >= (self.bottom_elbow_threshold - self.hysteresis_deg):
                rom = self.max_elbow_angle_in_rep - self.min_elbow_angle_in_rep
                duration_ms = max(10, timestamp_ms - self.rep_start_timestamp_ms)

                # Filter pergerakan mikro / jitter diam
                if rom < 25.0 or self.min_elbow_angle_in_rep > 135.0 or (self.rep_start_timestamp_ms > 0 and duration_ms < 300):
                    self.state = "HANG_BOTTOM"
                    feedback = "Gerakan minimal / belum penuh. Tetap di posisi siap."
                elif self.cooldown_counter == 0:
                    # Siklus repetisi selesai
                    self.detected_reps += 1

                    if self.reached_top:
                        self.verified_reps += 1
                        rep_valid = True
                        rep_reason = None
                        rep_feedback = "Tarik Pull-up Sempurna!"
                    else:
                        self.rejected_reps += 1
                        rep_valid = False
                        rep_reason = "Kedalaman belum terpenuhi"
                        rep_feedback = f"Siku hanya mencapai {self.min_elbow_angle_in_rep:.1f}° (harus <= {self.top_elbow_threshold}°)"

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

                    self.state = "HANG_BOTTOM"
                    self.cooldown_counter = self.cooldown_frames
                    self.reached_top = False
                    feedback = rep_feedback

        return MovementAnalysisResult(
            exercise_type="pullup",
            phase=self.state,
            current_angle=elbow_angle,
            body_alignment_angle=None,
            detected_reps=self.detected_reps,
            verified_reps=self.verified_reps,
            rejected_reps=self.rejected_reps,
            last_rep=self.last_rep_result,
            feedback_message=feedback,
            is_in_good_form=is_good_form,
            landmark_confidence_avg=pose_result.confidence_score,
            bar_y=None,
            chin_y=None,
            chin_passed_bar=None
        )
