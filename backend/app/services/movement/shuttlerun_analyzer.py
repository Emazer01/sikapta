import time
from typing import Dict, Any, Optional, Tuple
from app.schemas.pose import PoseResult, MovementAnalysisResult, RepetitionResult
from app.services.movement.base import BaseMovementAnalyzer
from app.services.assessment.running_score import calculate_shuttlerun_score


class ShuttleRunAnalyzer(BaseMovementAnalyzer):
    """
    Analyzer Gerakan Shuttle Run (Lari Angka 8 / 6 x 10 Meter).
    Standar Uji Kesamaptaan Jasmani B (TNI / POLRI):
    - Jarak lintasan 10 meter antar 2 tiang.
    - Berlari membentuk angka 8 sebanyak 3 putaran penuh (total 6 kali bolak-balik melintasi tiang).
    - Penilaian berdasarkan waktu tempuh (stopwatch detik dan milidetik).
    - Semakin cepat waktu tempuh, semakin tinggi perolehan skornya (skala 0 - 100).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.exercise_type: str = "shuttlerun"
        self.total_target_laps: int = int(self.config.get("total_laps", 3))  # 3 putaran angka 8
        self.total_target_crossings: int = self.total_target_laps * 2  # 6 kali melintasi tiang
        self.min_crossing_ms: int = int(self.config.get("min_crossing_ms", 650))  # Anti-glitch minimal waktu per lintasan

        # Batas zona tiang kiri dan kanan (koordinat X normalisasi 0.0 s/d 1.0)
        # Toleransi sudut/setting dapat melebarkan atau menyempitkan zona
        tol_offset = min(0.08, float(self.tolerance_deg) * 0.01)
        self.left_threshold: float = float(self.config.get("left_threshold", 0.32)) + tol_offset
        self.right_threshold: float = float(self.config.get("right_threshold", 0.68)) - tol_offset

        self.reset_shuttle()

    def reset(self):
        super().reset()
        self.reset_shuttle()

    def reset_shuttle(self):
        self.shuttle_state = "INIT"  # INIT, READY, RUNNING, COMPLETED
        self.start_timestamp_ms: int = 0
        self.end_timestamp_ms: int = 0
        self.elapsed_time_seconds: float = 0.0
        self.final_shuttle_score: float = 0.0

        self.completed_crossings: int = 0  # 0 s/d 6
        self.completed_laps: int = 0       # 0 s/d 3
        self.current_zone: str = "UNKNOWN" # LEFT, RIGHT, CENTER
        self.last_turnaround_zone: Optional[str] = None
        self.has_left_start_zone: bool = False
        self.last_crossing_timestamp_ms: int = 0

        self.ready_frames_count: int = 0
        self.passed_center_between_poles: bool = False

    def _get_body_centroid_x(self, landmarks: dict) -> Optional[float]:
        """
        Menghitung posisi horizontal tengah tubuh (centroid X) dari pinggul, bahu, atau hidung.
        """
        # 1. Prioritaskan rata-rata pinggul kiri dan kanan
        l_hip = landmarks.get("left_hip")
        r_hip = landmarks.get("right_hip")
        if l_hip and r_hip and l_hip.is_valid and r_hip.is_valid:
            return (l_hip.x + r_hip.x) / 2.0
        elif l_hip and l_hip.is_valid:
            return l_hip.x
        elif r_hip and r_hip.is_valid:
            return r_hip.x

        # 2. Alternatif bahu kiri dan kanan
        l_sh = landmarks.get("left_shoulder")
        r_sh = landmarks.get("right_shoulder")
        if l_sh and r_sh and l_sh.is_valid and r_sh.is_valid:
            return (l_sh.x + r_sh.x) / 2.0
        elif l_sh and l_sh.is_valid:
            return l_sh.x
        elif r_sh and r_sh.is_valid:
            return r_sh.x

        # 3. Fallback hidung / kepala
        nose = landmarks.get("nose")
        if nose and nose.is_valid:
            return nose.x

        return None

    def process_frame(self, pose_result: PoseResult, timestamp_ms: int = 0) -> MovementAnalysisResult:
        now_ms = timestamp_ms if timestamp_ms > 0 else int(time.time() * 1000)

        if not pose_result.is_detected or not pose_result.landmarks:
            self.consecutive_lost_frames += 1
            feedback = "Tubuh pelari tidak terlihat di kamera" if self.consecutive_lost_frames > 5 else "Melacak posisi pelari..."
            return MovementAnalysisResult(
                exercise_type="shuttlerun",
                phase=self.shuttle_state,
                current_angle=round(self.elapsed_time_seconds, 1),
                detected_reps=self.completed_crossings,
                verified_reps=self.completed_laps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message=feedback,
                is_in_good_form=False,
                landmark_confidence_avg=0.0,
            )

        self.consecutive_lost_frames = 0
        raw_x = self._get_body_centroid_x(pose_result.landmarks)
        if raw_x is None:
            return MovementAnalysisResult(
                exercise_type="shuttlerun",
                phase=self.shuttle_state,
                current_angle=round(self.elapsed_time_seconds, 1),
                detected_reps=self.completed_crossings,
                verified_reps=self.completed_laps,
                rejected_reps=self.rejected_reps,
                last_rep=self.last_rep_result,
                feedback_message="Posisikan tubuh dalam jangkauan kamera lintasan",
                is_in_good_form=True,
                landmark_confidence_avg=pose_result.confidence_score,
            )

        # Haluskan posisi X menggunakan filter moving average
        smooth_x = self.angle_filter.filter(raw_x)

        # Klasifikasikan zona posisi pelari
        if smooth_x <= self.left_threshold:
            zone = "LEFT"
        elif smooth_x >= self.right_threshold:
            zone = "RIGHT"
        else:
            zone = "CENTER"

        self.current_zone = zone

        # ==========================================
        # STATE MACHINE SHUTTLE RUN (6 x 10m / 3 Laps)
        # ==========================================
        if self.shuttle_state == "INIT":
            # Menunggu pelari bersiap di salah satu tiang (Kiri atau Kanan)
            if zone in ["LEFT", "RIGHT"]:
                self.ready_frames_count += 1
                if self.ready_frames_count >= 3:
                    self.shuttle_state = "READY"
                    self.last_turnaround_zone = zone
                    self.ready_frames_count = 0
            feedback = "Posisikan pelari di titik start (Tiang Kiri / Kanan)"

        elif self.shuttle_state == "READY":
            # Pelari siap di tiang start. Begitu bergerak masuk ke area lintasan (CENTER atau seberang), waktu dimulai!
            if zone == "CENTER" or (self.last_turnaround_zone and zone != self.last_turnaround_zone):
                self.shuttle_state = "RUNNING"
                self.start_timestamp_ms = now_ms
                self.last_crossing_timestamp_ms = now_ms
                self.has_left_start_zone = True
                self.passed_center_between_poles = True
                self.elapsed_time_seconds = 0.0
            feedback = f"Siap di Tiang {self.last_turnaround_zone}! Mulai berlari saat aba-aba..."

        elif self.shuttle_state == "RUNNING":
            self.elapsed_time_seconds = round((now_ms - self.start_timestamp_ms) / 1000.0, 2)

            if zone == "CENTER":
                self.passed_center_between_poles = True

            # Deteksi ketika pelari mencapai tiang seberang
            if zone in ["LEFT", "RIGHT"] and zone != self.last_turnaround_zone:
                elapsed_since_last_crossing = now_ms - self.last_crossing_timestamp_ms

                # Pastikan sudah melewati area tengah lintasan dan memenuhi durasi minimal
                if self.passed_center_between_poles and elapsed_since_last_crossing >= self.min_crossing_ms:
                    self.completed_crossings += 1
                    self.last_turnaround_zone = zone
                    self.last_crossing_timestamp_ms = now_ms
                    self.passed_center_between_poles = False

                    # Setiap 2 kali crossing (bolak-balik) = 1 Putaran Penuh (Angka 8)
                    self.completed_laps = self.completed_crossings // 2
                    self.detected_reps = self.completed_crossings
                    self.verified_reps = self.completed_laps

                    # Cek apakah seluruh 3 putaran (6 crossing) sudah tuntas!
                    if self.completed_crossings >= self.total_target_crossings:
                        self.shuttle_state = "COMPLETED"
                        self.end_timestamp_ms = now_ms
                        self.elapsed_time_seconds = round((self.end_timestamp_ms - self.start_timestamp_ms) / 1000.0, 2)
                        self.final_shuttle_score = calculate_shuttlerun_score(self.elapsed_time_seconds, self.gender)

                        self.last_rep_result = RepetitionResult(
                            rep_number=self.completed_laps,
                            is_valid=True,
                            rejection_reason=None,
                            peak_angle=self.elapsed_time_seconds,
                            min_angle=self.final_shuttle_score,
                            start_time_ms=self.start_timestamp_ms,
                            end_time_ms=self.end_timestamp_ms,
                            duration_ms=int(self.elapsed_time_seconds * 1000),
                            feedback=f"Selesai! Waktu: {self.elapsed_time_seconds:.1f}s | Skor: {self.final_shuttle_score}"
                        )

            target_pole = "Tiang Kanan" if self.last_turnaround_zone == "LEFT" else "Tiang Kiri"
            current_lap_num = min(self.total_target_laps, (self.completed_crossings // 2) + 1)
            feedback = f"Putaran {current_lap_num}/3 (Lintasan {self.completed_crossings}/6) - Menuju {target_pole} | {self.elapsed_time_seconds:.1f}s"

        elif self.shuttle_state == "COMPLETED":
            feedback = f"SHUTTLE RUN SELESAI! Waktu: {self.elapsed_time_seconds:.1f} detik | Nilai: {self.final_shuttle_score}"

        else:
            feedback = "Sikapta AI Shuttle Run"

        # Tentukan label fase untuk UI
        if self.shuttle_state == "RUNNING":
            target_str = "KANAN" if self.last_turnaround_zone == "LEFT" else "KIRI"
            lap_idx = (self.completed_crossings // 2) + 1
            phase_label = f"PUTARAN_{lap_idx}_KE_{target_str}"
        elif self.shuttle_state == "COMPLETED":
            phase_label = "SELESAI"
        else:
            phase_label = self.shuttle_state

        return MovementAnalysisResult(
            exercise_type="shuttlerun",
            phase=phase_label,
            current_angle=round(self.elapsed_time_seconds, 1),
            body_alignment_angle=smooth_x * 100.0,  # Persentase posisi horizontal lintasan
            detected_reps=self.completed_crossings,
            verified_reps=self.completed_laps,
            rejected_reps=self.rejected_reps,
            last_rep=self.last_rep_result,
            feedback_message=feedback,
            is_in_good_form=True,
            landmark_confidence_avg=pose_result.confidence_score,
        )
