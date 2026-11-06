import math
from typing import Dict, Any, Optional
from app.schemas.pose import PoseResult, MovementAnalysisResult, RepetitionResult
from app.services.movement.base import BaseMovementAnalyzer
from app.services.movement.geometry import calculate_angle

class SitUpAnalyzer(BaseMovementAnalyzer):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        # Adapt baseline thresholds based on Gender (Pria vs Wanita)
        # Standar Kesamaptaan TNI/Polri:
        # Rebah (down): punggung/bahu menyentuh matras (sudut >= 125°, toleransi -> 120°)
        # Duduk (up): siku menyentuh/mendekati lutut (sudut <= 70° pria, <= 75° wanita, toleransi -> 75°/80°)
        if self.is_female:
            self.base_down_torso_threshold = float(self.config.get("down_torso_angle_threshold", 120.0))
            self.base_up_torso_threshold = float(self.config.get("up_torso_angle_threshold", 75.0))
        else:
            self.base_down_torso_threshold = float(self.config.get("down_torso_angle_threshold", 125.0))
            self.base_up_torso_threshold = float(self.config.get("up_torso_angle_threshold", 70.0))

        # Clamp down_torso_threshold to realistic bio-mechanical limit (max 125.0 for male, 120.0 for female)
        # In bent-knee sit-ups, torso-hip-knee angle when back touches mat is realistically 110°-125°.
        # Any configured threshold higher than 125° would unfairly fail genuine fast-cadence reps.
        if self.is_female and self.base_down_torso_threshold > 120.0:
            self.base_down_torso_threshold = 120.0
        elif not self.is_female and self.base_down_torso_threshold > 125.0:
            self.base_down_torso_threshold = 125.0

        # Effective thresholds incorporate the examiner-configured tolerance
        self.down_torso_threshold = self.base_down_torso_threshold - self.tolerance_deg
        self.up_torso_threshold = self.base_up_torso_threshold + self.tolerance_deg

        self.reached_up = False
        self.min_torso_angle_in_rep = 180.0
        self.max_torso_angle_in_rep = 0.0

    def _calculate_torso_elevation_angle(self, p_sh: tuple, p_hip: tuple) -> float:
        """
        Fallback angle estimator when knees are cut off or occluded:
        Calculates torso elevation angle from horizontal mat plane, then maps to equivalent
        torso-to-thigh sit-up angle scale (145° down flat -> 55° up erect).
        """
        dx = abs(p_sh[0] - p_hip[0])
        # In image coordinates, y=0 is top, y=1 is bottom
        # Upward rise means y_shoulder < y_hip -> -(y_sh - y_hip) > 0
        dy = -(p_sh[1] - p_hip[1])
        elevation_deg = math.degrees(math.atan2(dy, max(dx, 0.001)))
        elevation_deg = max(0.0, min(90.0, elevation_deg))
        # Map 0° (flat rebah) to ~145°, and 75° (erect sitting) to ~60°
        equivalent_angle = 145.0 - (elevation_deg * 1.15)
        return max(35.0, min(180.0, equivalent_angle))

    def process_frame(self, pose_result: PoseResult, timestamp_ms: int = 0) -> MovementAnalysisResult:
        if self.cooldown_counter > 0:
            self.cooldown_counter -= 1

        if not pose_result.is_detected or not pose_result.landmarks:
            self.consecutive_lost_frames += 1
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="situp",
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

        # Check full body triplet (shoulder - hip - knee) on left & right
        has_left_full = all(p in landmarks and landmarks[p].is_valid for p in ["left_shoulder", "left_hip", "left_knee"])
        has_right_full = all(p in landmarks and landmarks[p].is_valid for p in ["right_shoulder", "right_hip", "right_knee"])

        # Check torso pair (shoulder - hip) for robust fallback when knees are out of frame
        has_left_torso = all(p in landmarks and landmarks[p].is_valid for p in ["left_shoulder", "left_hip"])
        has_right_torso = all(p in landmarks and landmarks[p].is_valid for p in ["right_shoulder", "right_hip"])

        raw_torso_angle: float
        if has_left_full or has_right_full:
            angles = []
            if has_left_full:
                a_l = calculate_angle(
                    (landmarks["left_shoulder"].x, landmarks["left_shoulder"].y),
                    (landmarks["left_hip"].x, landmarks["left_hip"].y),
                    (landmarks["left_knee"].x, landmarks["left_knee"].y)
                )
                angles.append(a_l)
            if has_right_full:
                a_r = calculate_angle(
                    (landmarks["right_shoulder"].x, landmarks["right_shoulder"].y),
                    (landmarks["right_hip"].x, landmarks["right_hip"].y),
                    (landmarks["right_knee"].x, landmarks["right_knee"].y)
                )
                angles.append(a_r)
            raw_torso_angle = sum(angles) / len(angles)
        elif has_left_torso or has_right_torso:
            # Fallback using torso elevation relative to mat/floor plane
            angles = []
            if has_left_torso:
                a_l = self._calculate_torso_elevation_angle(
                    (landmarks["left_shoulder"].x, landmarks["left_shoulder"].y),
                    (landmarks["left_hip"].x, landmarks["left_hip"].y)
                )
                angles.append(a_l)
            if has_right_torso:
                a_r = self._calculate_torso_elevation_angle(
                    (landmarks["right_shoulder"].x, landmarks["right_shoulder"].y),
                    (landmarks["right_hip"].x, landmarks["right_hip"].y)
                )
                angles.append(a_r)
            raw_torso_angle = sum(angles) / len(angles)
        else:
            last_angle = self.angle_filter.value or 0.0
            return MovementAnalysisResult(
                exercise_type="situp",
                phase=self.state,
                current_angle=last_angle,
                detected_reps=self.detected_reps,
                verified_reps=self.verified_reps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Posisikan tubuh & pinggul terlihat di kamera",
                is_in_good_form=False,
                landmark_confidence_avg=pose_result.confidence_score
            )

        torso_angle = self.angle_filter.filter(raw_torso_angle)

        feedback = "Posisi rebah siap di matras"
        is_good_form = True

        # State Machine for Sit-up
        if self.state in ["INIT", "DOWN_START"]:
            # Achieve valid lying down posture on the mat before starting
            if torso_angle >= (self.down_torso_threshold - self.hysteresis_deg):
                self.state = "DOWN_START"
                feedback = "Posisi awal rebah siap. Mulai angkat badan ke atas!"
            elif self.state == "INIT":
                feedback = "Rebahkan badan sepenuhnya di matras untuk posisi awal"
                is_good_form = False

            if self.state == "DOWN_START" and torso_angle < (self.down_torso_threshold - 8.0):
                self.rep_start_timestamp_ms = timestamp_ms
                self.min_torso_angle_in_rep = torso_angle
                self.max_torso_angle_in_rep = torso_angle
                self.reached_up = False
                if torso_angle <= (self.up_torso_threshold + self.hysteresis_deg):
                    self.reached_up = True
                    self.state = "UP"
                    feedback = "Posisi puncak tercapai! Turunkan badan perlahan."
                else:
                    self.state = "RISING"
                    feedback = "Angkat torso mendekati lutut"

        elif self.state == "RISING":
            self.min_torso_angle_in_rep = min(self.min_torso_angle_in_rep, torso_angle)
            self.max_torso_angle_in_rep = max(self.max_torso_angle_in_rep, torso_angle)
            if torso_angle <= (self.up_torso_threshold + self.hysteresis_deg):
                self.reached_up = True
                self.state = "UP"
                feedback = "Posisi puncak tercapai! Turunkan badan perlahan."
            elif torso_angle > (self.min_torso_angle_in_rep + 15.0):
                self.state = "LOWERING"
                feedback = "Kembali turun sebelum angkat penuh!"

        elif self.state == "UP":
            self.min_torso_angle_in_rep = min(self.min_torso_angle_in_rep, torso_angle)
            self.max_torso_angle_in_rep = max(self.max_torso_angle_in_rep, torso_angle)
            if torso_angle > (self.up_torso_threshold + self.hysteresis_deg):
                self.state = "LOWERING"
                feedback = "Rebahkan badan kembali ke matras."

        if self.state == "LOWERING":
            self.max_torso_angle_in_rep = max(self.max_torso_angle_in_rep, torso_angle)
            self.min_torso_angle_in_rep = min(self.min_torso_angle_in_rep, torso_angle)
            if torso_angle >= (self.down_torso_threshold - self.hysteresis_deg):
                rom = self.max_torso_angle_in_rep - self.min_torso_angle_in_rep
                duration_ms = max(10, timestamp_ms - self.rep_start_timestamp_ms)

                # Real movement attempt validation (reject idle jitter / micro-movements)
                # Genuine sit-up attempt requires minimum 25 deg ROM and reaching below 105 deg
                if rom < 25.0 or self.min_torso_angle_in_rep > 105.0 or (self.rep_start_timestamp_ms > 0 and duration_ms < 250):
                    # Discard as stationary fidgeting / noise
                    self.state = "DOWN_START"
                    feedback = "Gerakan minimal / belum penuh. Tetap di posisi siap."
                elif self.cooldown_counter == 0:
                    # Rep cycle complete!
                    self.detected_reps += 1

                    if self.reached_up or self.min_torso_angle_in_rep <= (self.up_torso_threshold + 5.0):
                        self.verified_reps += 1
                        rep_valid = True
                        rep_reason = None
                        rep_feedback = "Sit-up Sempurna!"
                    else:
                        self.rejected_reps += 1
                        rep_valid = False
                        rep_reason = "Kedalaman belum terpenuhi"
                        rep_feedback = f"Sudut torso hanya mencapai {self.min_torso_angle_in_rep:.1f}° (harus <= {self.up_torso_threshold}°)"

                    self.last_rep_result = RepetitionResult(
                        rep_number=self.detected_reps,
                        is_valid=rep_valid,
                        rejection_reason=rep_reason,
                        peak_angle=self.max_torso_angle_in_rep,
                        min_angle=self.min_torso_angle_in_rep,
                        start_time_ms=self.rep_start_timestamp_ms,
                        end_time_ms=timestamp_ms,
                        duration_ms=duration_ms,
                        feedback=rep_feedback
                    )

                    self.state = "DOWN_START"
                    self.cooldown_counter = self.cooldown_frames
                    feedback = rep_feedback

        return MovementAnalysisResult(
            exercise_type="situp",
            phase=self.state,
            current_angle=torso_angle,
            body_alignment_angle=None,
            detected_reps=self.detected_reps,
            verified_reps=self.verified_reps,
            rejected_reps=self.rejected_reps,
            last_rep=self.last_rep_result,
            feedback_message=feedback,
            is_in_good_form=is_good_form,
            landmark_confidence_avg=pose_result.confidence_score
        )
