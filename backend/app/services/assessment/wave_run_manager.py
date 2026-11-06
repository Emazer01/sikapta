import time
import base64
import asyncio
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Set, Tuple
import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.samapta_event import SamaptaEvent
from app.models.event_participant import EventParticipant
from app.models.participant import Participant
from app.models.camera import Camera
from app.services.camera.manager import camera_manager, CameraStream
from app.services.assessment.chest_number_detector import ChestNumberDetector, DetectedChestNumber
from app.services.assessment.running_score import calculate_run_distance, calculate_run_score

logger = logging.getLogger("sikapta.wave_run")


class WaveRunnerState:
    def __init__(
        self,
        event_participant_id: int,
        participant_id: int,
        nrp: str,
        full_name: str,
        gender: str,
        unit: str,
        chest_number: str,
        wave_number: int,
        vest_color: Optional[str] = None,
        laps: int = 0,
        extra_meters: float = 0.0,
        track_length_meters: float = 400.0,
    ):
        self.event_participant_id = event_participant_id
        self.participant_id = participant_id
        self.nrp = nrp
        self.full_name = full_name
        self.gender = (gender or "L").upper()
        self.unit = unit or "-"
        self.chest_number = chest_number
        self.wave_number = wave_number
        self.assigned_vest_color = (vest_color or "Netral").strip()
        self.laps = max(0, int(laps or 0))
        self.extra_meters = max(0.0, float(extra_meters or 0.0))
        self.track_length_meters = track_length_meters

        self.total_distance_meters = 0.0
        self.run_score = 0.0
        self.recalculate(track_length_meters)

        # Detection tracking & anti-double-count cooldown
        self.last_lap_timestamp: float = 0.0
        self.last_seen_timestamp: float = 0.0
        self.consecutive_sightings: int = 0
        self.lap_history: List[Dict[str, Any]] = []
        self.detected_vest_color: Optional[str] = None
        self.detected_vest_hex: Optional[str] = None

    def recalculate(self, track_length_meters: Optional[float] = None):
        if track_length_meters is not None:
            self.track_length_meters = track_length_meters
        self.total_distance_meters = calculate_run_distance(
            laps=self.laps,
            track_length_meters=self.track_length_meters,
            extra_meters=self.extra_meters
        )
        self.run_score = calculate_run_score(
            distance_meters=self.total_distance_meters,
            gender=self.gender
        )

    def to_dict(self, now_ts: float, cooldown_seconds: float) -> Dict[str, Any]:
        elapsed_since_lap = (now_ts - self.last_lap_timestamp) if self.last_lap_timestamp > 0 else 999999.0
        in_cooldown = self.last_lap_timestamp > 0 and elapsed_since_lap < cooldown_seconds
        cooldown_rem = max(0.0, round(cooldown_seconds - elapsed_since_lap, 1)) if in_cooldown else 0.0
        recently_detected = (now_ts - self.last_seen_timestamp) <= 2.5 if self.last_seen_timestamp > 0 else False

        return {
            "event_participant_id": self.event_participant_id,
            "participant_id": self.participant_id,
            "nrp": self.nrp,
            "full_name": self.full_name,
            "gender": self.gender,
            "unit": self.unit,
            "chest_number": self.chest_number,
            "wave_number": self.wave_number,
            "run_laps": self.laps,
            "run_extra_meters": self.extra_meters,
            "run_total_distance_meters": self.total_distance_meters,
            "run_score": self.run_score,
            "in_cooldown": in_cooldown,
            "cooldown_remaining_seconds": cooldown_rem,
            "recently_detected": recently_detected,
            "vest_color": self.detected_vest_color or self.assigned_vest_color,
            "assigned_vest_color": self.assigned_vest_color,
            "detected_vest_color": self.detected_vest_color,
            "vest_hex": self.detected_vest_hex,
            "last_lap_time_str": self.lap_history[-1]["time_str"] if self.lap_history else None,
            "lap_history": self.lap_history[-5:],
        }


class ActiveWaveRunSession:
    """
    Sesi Live Cam Penilaian Lari Satu Gelombang.
    Mendeteksi nomor dada peserta pada gelombang tersebut saat melewati kamera (1 putaran),
    menghitung putaran otomatis dengan proteksi cooldown anti-dobel hitung,
    serta mendukung penyesuaian manual & persetujuan simpan ke database.
    """

    def __init__(
        self,
        event_id: int,
        event_name: str,
        wave_number: int,
        track_length_meters: float,
        runners: List[WaveRunnerState],
        camera_id: Optional[int] = None,
        target_duration_seconds: int = 720,
        lap_cooldown_seconds: float = 15.0,
        confirm_frames_required: int = 1,
    ):
        self.event_id = event_id
        self.event_name = event_name
        self.wave_number = wave_number
        self.track_length_meters = float(track_length_meters or 400.0)
        self.camera_id = camera_id
        self.target_duration_seconds = int(target_duration_seconds or 720)
        self.lap_cooldown_seconds = max(2.0, float(lap_cooldown_seconds or 15.0))
        self.confirm_frames_required = max(1, int(confirm_frames_required or 1))

        self.runners_by_id: Dict[int, WaveRunnerState] = {r.participant_id: r for r in runners}
        # Daftar seluruh pelari terdaftar gelombang untuk pencocokan nomor & warna rompi
        self.registered_runners_list: List[Dict[str, Any]] = []
        for r in runners:
            self.registered_runners_list.append({
                "participant_id": r.participant_id,
                "event_participant_id": r.event_participant_id,
                "full_name": r.full_name,
                "nrp": r.nrp,
                "gender": r.gender,
                "chest_number": r.chest_number,
                "vest_color": r.assigned_vest_color,
            })

        self.detector = ChestNumberDetector()
        self.status = "in_progress"  # in_progress, paused, completed
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.subscribers: Set[asyncio.Queue] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.stream: Optional[CameraStream] = None
        self.lock = threading.Lock()

        self.start_time = time.time()
        self.paused_duration = 0.0
        self.last_pause_time: Optional[float] = None
        self.total_frames = 0
        self.fps_list: List[float] = []
        self.latest_annotated_jpeg_b64: Optional[str] = None
        self.lap_crossing_log: List[Dict[str, Any]] = []
        self.latest_banner_event: Optional[Dict[str, Any]] = None

    def get_elapsed_seconds(self, now_ts: Optional[float] = None) -> int:
        now = now_ts if now_ts is not None else time.time()
        extra_pause = (now - self.last_pause_time) if (self.status == "paused" and self.last_pause_time) else 0.0
        elapsed = max(0.0, now - self.start_time - self.paused_duration - extra_pause)
        return int(elapsed)

    def start(self, event_loop: Optional[asyncio.AbstractEventLoop] = None):
        if event_loop and not event_loop.is_closed():
            self.loop = event_loop
        elif wave_run_manager.main_loop and not wave_run_manager.main_loop.is_closed():
            self.loop = wave_run_manager.main_loop

        self.is_running = True
        self.start_time = time.time()

        # Buka stream kamera (otomatis fallback ke kamera aktif atau webcam device 0)
        try:
            db = SessionLocal()
            cam = None
            if self.camera_id:
                cam = db.query(Camera).filter(Camera.id == self.camera_id).first()
            if not cam:
                cam = db.query(Camera).filter(Camera.is_active == True).first()
            if not cam:
                cam = db.query(Camera).first()

            if cam:
                self.camera_id = cam.id
                self.stream = camera_manager.get_or_create_stream(
                    camera_id=cam.id,
                    camera_type=cam.camera_type,
                    device_index=cam.device_index if cam.device_index is not None else 0,
                    rtsp_url=cam.rtsp_url,
                    width=cam.resolution_w or 640,
                    height=cam.resolution_h or 480,
                    target_fps=cam.target_fps or 30
                )
            else:
                self.camera_id = 1
                self.stream = camera_manager.get_or_create_stream(
                    camera_id=1,
                    camera_type="webcam",
                    device_index=0,
                    width=640,
                    height=480,
                    target_fps=30
                )
            db.close()
        except Exception as e:
            logger.error(f"Error opening camera for wave run E{self.event_id}-W{self.wave_number}: {e}")

        self.thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.thread.start()
        logger.info(f"Wave run live session started for Event {self.event_id} Wave {self.wave_number}")

    def pause(self):
        with self.lock:
            if self.status == "in_progress":
                self.status = "paused"
                self.last_pause_time = time.time()

    def resume(self):
        with self.lock:
            if self.status == "paused":
                if self.last_pause_time:
                    self.paused_duration += max(0.0, time.time() - self.last_pause_time)
                    self.last_pause_time = None
                self.status = "in_progress"

    def stop(self):
        self.is_running = False
        with self.lock:
            if self.last_pause_time:
                self.paused_duration += max(0.0, time.time() - self.last_pause_time)
                self.last_pause_time = None
            self.status = "completed"

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)

        if self.camera_id:
            try:
                camera_manager.stop_stream(self.camera_id)
            except Exception as e:
                logger.error(f"Error stopping camera {self.camera_id}: {e}")
            self.stream = None

    def adjust_lap(self, participant_id: int, delta: int) -> Optional[Dict[str, Any]]:
        now_ts = time.time()
        with self.lock:
            runner = self.runners_by_id.get(participant_id)
            if not runner:
                return None
            new_laps = max(0, runner.laps + int(delta))
            diff = new_laps - runner.laps
            runner.laps = new_laps
            runner.recalculate(self.track_length_meters)
            if diff > 0:
                elapsed_s = self.get_elapsed_seconds(now_ts)
                mins, secs = divmod(elapsed_s, 60)
                time_str = f"{mins:02d}:{secs:02d}"
                log_item = {
                    "participant_id": runner.participant_id,
                    "chest_number": runner.chest_number,
                    "full_name": runner.full_name,
                    "lap_number": runner.laps,
                    "total_distance_meters": runner.total_distance_meters,
                    "run_score": runner.run_score,
                    "time_str": time_str,
                    "source": "manual",
                    "timestamp": now_ts,
                }
                runner.lap_history.append(log_item)
                self.lap_crossing_log.insert(0, log_item)
                self.lap_crossing_log = self.lap_crossing_log[:40]
            return runner.to_dict(now_ts, self.lap_cooldown_seconds)

    def set_extra_meters(self, participant_id: int, extra_meters: float) -> Optional[Dict[str, Any]]:
        now_ts = time.time()
        with self.lock:
            runner = self.runners_by_id.get(participant_id)
            if not runner:
                return None
            runner.extra_meters = max(0.0, float(extra_meters or 0.0))
            runner.recalculate(self.track_length_meters)
            return runner.to_dict(now_ts, self.lap_cooldown_seconds)

    def process_frame(self, frame: np.ndarray, now_ts: Optional[float] = None) -> Tuple[np.ndarray, List[DetectedChestNumber]]:
        """
        Memproses 1 frame gambar:
        1. Deteksi nomor dada yang terdaftar pada gelombang ini
        2. Cek cooldown per peserta: jika tidak sedang cooldown, tambah 1 putaran
        3. Render HUD visual & bounding box nomor dada
        """
        now = now_ts if now_ts is not None else time.time()
        detections = self.detector.detect(
            frame=frame,
            registered_participants=self.registered_runners_list,
            min_confidence=0.60
        )

        detected_pids_this_frame = set()
        active_overlays = []

        with self.lock:
            elapsed_s = self.get_elapsed_seconds(now)
            mins, secs = divmod(elapsed_s, 60)
            time_str = f"{mins:02d}:{secs:02d}"

            for det in detections:
                pid = det.participant_id
                if pid is None or pid not in self.runners_by_id:
                    continue

                runner = self.runners_by_id[pid]

                # Verifikasi ganda warna rompi jika pelari memiliki warna rompi terdaftar
                if runner.assigned_vest_color and runner.assigned_vest_color.lower() != "netral":
                    if det.vest_color and det.vest_color.lower() != "netral":
                        if det.vest_color.lower() != runner.assigned_vest_color.lower():
                            # Warna rompi tidak cocok dengan yang terdaftar, jangan catat putaran
                            continue
                detected_pids_this_frame.add(pid)
                runner.last_seen_timestamp = now
                if det.vest_color and det.vest_color != "Netral":
                    runner.detected_vest_color = det.vest_color
                    runner.detected_vest_hex = det.vest_hex

                elapsed_since_last_lap = (now - runner.last_lap_timestamp) if runner.last_lap_timestamp > 0 else 999999.0
                if runner.last_lap_timestamp > 0 and elapsed_since_last_lap < self.lap_cooldown_seconds:
                    rem_cd = max(0.1, round(self.lap_cooldown_seconds - elapsed_since_last_lap, 1))
                    active_overlays.append({
                        "bbox": det.bbox,
                        "chest_number": runner.chest_number,
                        "full_name": runner.full_name,
                        "laps": runner.laps,
                        "vest_color": runner.detected_vest_color or det.vest_color,
                        "vest_hex": runner.detected_vest_hex or det.vest_hex,
                        "status": "cooldown",
                        "cooldown_rem": rem_cd,
                        "confidence": det.confidence,
                    })
                else:
                    runner.consecutive_sightings += 1
                    if runner.consecutive_sightings >= self.confirm_frames_required:
                        runner.laps += 1
                        runner.last_lap_timestamp = now
                        runner.consecutive_sightings = 0
                        runner.recalculate(self.track_length_meters)

                        log_entry = {
                            "participant_id": runner.participant_id,
                            "chest_number": runner.chest_number,
                            "full_name": runner.full_name,
                            "lap_number": runner.laps,
                            "total_distance_meters": runner.total_distance_meters,
                            "run_score": runner.run_score,
                            "time_str": time_str,
                            "source": "camera_ai",
                            "vest_color": runner.detected_vest_color or det.vest_color,
                            "vest_hex": runner.detected_vest_hex or det.vest_hex,
                            "confidence": det.confidence,
                            "timestamp": now,
                        }
                        runner.lap_history.append(log_entry)
                        self.lap_crossing_log.insert(0, log_entry)
                        self.lap_crossing_log = self.lap_crossing_log[:40]
                        self.latest_banner_event = log_entry

                        active_overlays.append({
                            "bbox": det.bbox,
                            "chest_number": runner.chest_number,
                            "full_name": runner.full_name,
                            "laps": runner.laps,
                            "vest_color": runner.detected_vest_color or det.vest_color,
                            "vest_hex": runner.detected_vest_hex or det.vest_hex,
                            "status": "counted",
                            "cooldown_rem": self.lap_cooldown_seconds,
                            "confidence": det.confidence,
                        })
                    else:
                        active_overlays.append({
                            "bbox": det.bbox,
                            "chest_number": runner.chest_number,
                            "full_name": runner.full_name,
                            "laps": runner.laps,
                            "vest_color": runner.detected_vest_color or det.vest_color,
                            "vest_hex": runner.detected_vest_hex or det.vest_hex,
                            "status": "verifying",
                            "cooldown_rem": 0.0,
                            "confidence": det.confidence,
                        })

            # Reset consecutive sightings for runners not seen in this frame
            for pid, runner in self.runners_by_id.items():
                if pid not in detected_pids_this_frame and (now - runner.last_seen_timestamp) > 1.2:
                    runner.consecutive_sightings = 0

        annotated = frame.copy()
        self._render_hud(annotated, active_overlays, now)
        return annotated, detections

    def _render_hud(self, frame: np.ndarray, active_overlays: List[Dict[str, Any]], now_ts: float):
        h, w = frame.shape[:2]
        elapsed_s = self.get_elapsed_seconds(now_ts)
        mins, secs = divmod(elapsed_s, 60)

        # Top header bar
        cv2.rectangle(frame, (0, 0), (w, 56), (15, 23, 42), -1)
        cv2.putText(
            frame,
            f"SIKAPTA AI | LIVE CAM LARI GELOMBANG {self.wave_number} | LINTASAN {int(self.track_length_meters)}M",
            (15, 24),
            cv2.FONT_HERSHEY_DUPLEX,
            0.55,
            (245, 158, 11),
            1,
            cv2.LINE_AA
        )
        total_laps_all = sum(r.laps for r in self.runners_by_id.values())
        cv2.putText(
            frame,
            f"Peserta Gelombang: {len(self.runners_by_id)} | Total Putaran Tercatat: {total_laps_all} | Waktu: {mins:02d}:{secs:02d}",
            (15, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (255, 255, 255),
            1,
            cv2.LINE_AA
        )

        # Draw subtle finish/lap gate guide lines
        gate_x1 = int(w * 0.12)
        gate_x2 = int(w * 0.88)
        gate_y1 = int(h * 0.14)
        gate_y2 = int(h * 0.86)
        cv2.rectangle(frame, (gate_x1, gate_y1), (gate_x2, gate_y2), (245, 158, 11), 1)
        cv2.putText(
            frame,
            "ZONA DETEKSI NOMOR DADA PUTARAN LARI",
            (gate_x1 + 8, gate_y1 + 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (245, 158, 11),
            1,
            cv2.LINE_AA
        )

        # Draw detected chest number bounding boxes
        for ov in active_overlays:
            bx, by, bw, bh = ov["bbox"]
            vest_str = f" | {ov['vest_color']}" if ov.get("vest_color") and ov["vest_color"] != "Netral" else ""
            if ov["status"] == "counted":
                color = (16, 185, 129)  # Emerald green
                label = f"NO. DADA {ov['chest_number']}{vest_str} | +1 PUTARAN (TOTAL: {ov['laps']})"
            elif ov["status"] == "cooldown":
                color = (0, 165, 255)  # Amber
                label = f"NO. DADA {ov['chest_number']}{vest_str} | PUTARAN: {ov['laps']} (Cooldown {ov['cooldown_rem']}s)"
            else:
                color = (255, 200, 0)
                label = f"NO. DADA {ov['chest_number']}{vest_str} | Memverifikasi..."

            cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), color, 3)
            label_y = max(75, by - 10)
            cv2.rectangle(frame, (bx, label_y - 22), (min(w - 10, bx + 360), label_y + 4), color, -1)
            cv2.putText(
                frame,
                label,
                (bx + 6, label_y - 4),
                cv2.FONT_HERSHEY_DUPLEX,
                0.46,
                (15, 23, 42),
                1,
                cv2.LINE_AA
            )

        # Bottom banner showing latest lap crossing notification
        cv2.rectangle(frame, (0, h - 46), (w, h), (15, 23, 42), -1)
        if self.latest_banner_event and (now_ts - self.latest_banner_event["timestamp"]) <= 6.0:
            ev = self.latest_banner_event
            vest_notif = f" [Rompi {ev['vest_color']}]" if ev.get("vest_color") and ev["vest_color"] != "Netral" else ""
            msg = (
                f"TERDETEKSI: No. Dada {ev['chest_number']} ({ev['full_name']}){vest_notif} "
                f"melewati putaran ke-{ev['lap_number']} ({int(ev['total_distance_meters'])} m)"
            )
            cv2.putText(frame, msg, (15, h - 17), cv2.FONT_HERSHEY_DUPLEX, 0.50, (16, 185, 129), 1, cv2.LINE_AA)
        else:
            cv2.putText(
                frame,
                "Arahkan kamera ke lintasan untuk mendeteksi Nomor Dada & Rompi peserta yang melewati putaran...",
                (15, h - 17),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.46,
                (200, 210, 225),
                1,
                cv2.LINE_AA
            )

    def get_current_state_payload(self, fps: Optional[float] = None) -> Dict[str, Any]:
        now_ts = time.time()
        with self.lock:
            elapsed_s = self.get_elapsed_seconds(now_ts)
            remaining_s = max(0, self.target_duration_seconds - elapsed_s) if self.target_duration_seconds > 0 else 0
            curr_fps = fps if fps is not None else (self.fps_list[-1] if self.fps_list else 25.0)
            runners_list = [
                r.to_dict(now_ts, self.lap_cooldown_seconds)
                for r in sorted(self.runners_by_id.values(), key=lambda x: x.chest_number)
            ]
            return {
                "event_id": self.event_id,
                "event_name": self.event_name,
                "wave_number": self.wave_number,
                "track_length_meters": self.track_length_meters,
                "status": self.status,
                "elapsed_seconds": elapsed_s,
                "target_duration_seconds": self.target_duration_seconds,
                "remaining_seconds": remaining_s,
                "lap_cooldown_seconds": self.lap_cooldown_seconds,
                "fps": curr_fps,
                "participants": runners_list,
                "lap_crossing_log": list(self.lap_crossing_log[:25]),
                "frame": self.latest_annotated_jpeg_b64,
            }

    def _processing_loop(self):
        frame_interval = 1.0 / max(1, min(15, settings.CAMERA_TARGET_FPS))
        last_time = time.time()

        while self.is_running:
            loop_start = time.time()
            if self.status == "paused":
                time.sleep(0.1)
                continue

            try:
                frame = None
                if self.stream:
                    frame = self.stream.get_latest_frame()

                if frame is None:
                    frame = np.zeros((settings.CAMERA_FRAME_HEIGHT, settings.CAMERA_FRAME_WIDTH, 3), dtype=np.uint8)
                    cv2.putText(
                        frame,
                        f"SIKAPTA AI - LIVE CAM LARI GELOMBANG {self.wave_number}",
                        (30, 220),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.68,
                        (220, 220, 220),
                        2,
                        cv2.LINE_AA
                    )
                    cv2.putText(
                        frame,
                        "Menunggu sinyal video kamera...",
                        (30, 260),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (160, 170, 185),
                        1,
                        cv2.LINE_AA
                    )

                now_ts = time.time()
                annotated, _ = self.process_frame(frame, now_ts=now_ts)

                ret, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY])
                if ret:
                    self.latest_annotated_jpeg_b64 = base64.b64encode(buf).decode('utf-8')

                dt = time.time() - last_time
                current_fps = round(1.0 / dt, 1) if dt > 0 else 15.0
                last_time = time.time()
                self.fps_list.append(current_fps)
                self.total_frames += 1

                # Auto-pause when target timer expires (if target_duration_seconds > 0)
                if self.target_duration_seconds > 0 and self.get_elapsed_seconds(now_ts) >= self.target_duration_seconds:
                    self.pause()

                self._broadcast_state(current_fps)

            except Exception as e:
                logger.error(f"Error in wave run processing loop E{self.event_id}-W{self.wave_number}: {e}", exc_info=True)
                time.sleep(0.05)

            elapsed = time.time() - loop_start
            time.sleep(max(0.005, frame_interval - elapsed))

    def _broadcast_state(self, fps: float):
        if not self.subscribers:
            return

        target_loop = self.loop if (self.loop and not self.loop.is_closed()) else wave_run_manager.main_loop
        if not target_loop or target_loop.is_closed():
            return

        payload = self.get_current_state_payload(fps=fps)

        def _dispatch():
            for q in list(self.subscribers):
                try:
                    if q.full():
                        try:
                            q.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    q.put_nowait(payload)
                except Exception:
                    pass

        try:
            target_loop.call_soon_threadsafe(_dispatch)
        except Exception as e:
            logger.debug(f"Error dispatching wave run state: {e}")

    def save_to_database(self, db: Session, overrides: Optional[List[Dict[str, Any]]] = None) -> List[EventParticipant]:
        """
        Simpan resmi perolehan putaran & lebihan meter seluruh peserta gelombang ke database.
        """
        override_map = {}
        if overrides:
            for item in overrides:
                pid = item.get("participant_id")
                if pid is not None:
                    override_map[int(pid)] = item

        saved_records: List[EventParticipant] = []
        with self.lock:
            for pid, runner in self.runners_by_id.items():
                if pid in override_map:
                    ov = override_map[pid]
                    if "run_laps" in ov and ov["run_laps"] is not None:
                        runner.laps = max(0, int(ov["run_laps"]))
                    if "run_extra_meters" in ov and ov["run_extra_meters"] is not None:
                        runner.extra_meters = max(0.0, float(ov["run_extra_meters"]))
                    runner.recalculate(self.track_length_meters)

                ep = db.query(EventParticipant).filter(
                    EventParticipant.event_id == self.event_id,
                    EventParticipant.participant_id == pid
                ).first()
                if ep:
                    ep.run_laps = runner.laps
                    ep.run_extra_meters = runner.extra_meters
                    ep.run_total_distance_meters = runner.total_distance_meters
                    ep.run_score = runner.run_score
                    if runner.laps > 0 or runner.extra_meters > 0:
                        ep.attendance_status = "completed"
                    ep.updated_at = datetime.now(timezone.utc)
                    saved_records.append(ep)

        db.commit()
        for ep in saved_records:
            db.refresh(ep)
        return saved_records


class WaveRunSessionManager:
    def __init__(self):
        self.active_sessions: Dict[Tuple[int, int], ActiveWaveRunSession] = {}
        self.lock = threading.Lock()
        self.main_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self.main_loop = loop

    def start_or_replace_session(
        self,
        db: Session,
        event_id: int,
        wave_number: int,
        camera_id: Optional[int] = None,
        target_duration_seconds: int = 720,
        lap_cooldown_seconds: float = 15.0,
        confirm_frames_required: int = 1,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ) -> ActiveWaveRunSession:
        key = (event_id, wave_number)
        with self.lock:
            old_session = self.active_sessions.pop(key, None)
            if old_session:
                old_session.stop()

            event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
            if not event:
                raise ValueError("Kegiatan Samapta tidak ditemukan")

            event_parts = (
                db.query(EventParticipant)
                .filter(
                    EventParticipant.event_id == event_id,
                    EventParticipant.wave_number == wave_number
                )
                .order_by(EventParticipant.chest_number.asc(), EventParticipant.id.asc())
                .all()
            )

            runners: List[WaveRunnerState] = []
            for idx, ep in enumerate(event_parts):
                part = ep.participant
                chest_no = (ep.chest_number or f"{idx + 1:02d}").strip()
                runners.append(
                    WaveRunnerState(
                        event_participant_id=ep.id,
                        participant_id=ep.participant_id,
                        nrp=part.participant_number if part else f"NRP-{ep.participant_id}",
                        full_name=part.full_name if part else f"Peserta #{ep.participant_id}",
                        gender=(part.gender if part else "L") or "L",
                        unit=(part.organization if part else "-") or "-",
                        chest_number=chest_no,
                        wave_number=wave_number,
                        vest_color=ep.vest_color or "Netral",
                        laps=ep.run_laps or 0,
                        extra_meters=ep.run_extra_meters or 0.0,
                        track_length_meters=event.track_length_meters or 400.0,
                    )
                )

            effective_loop = loop if (loop and not loop.is_closed()) else self.main_loop
            session = ActiveWaveRunSession(
                event_id=event.id,
                event_name=event.name,
                wave_number=wave_number,
                track_length_meters=event.track_length_meters or 400.0,
                runners=runners,
                camera_id=camera_id,
                target_duration_seconds=target_duration_seconds,
                lap_cooldown_seconds=lap_cooldown_seconds,
                confirm_frames_required=confirm_frames_required,
            )
            session.start(effective_loop)
            self.active_sessions[key] = session
            return session

    def get_session(self, event_id: int, wave_number: int) -> Optional[ActiveWaveRunSession]:
        with self.lock:
            return self.active_sessions.get((event_id, wave_number))

    def stop_session(self, event_id: int, wave_number: int) -> Optional[ActiveWaveRunSession]:
        with self.lock:
            session = self.active_sessions.pop((event_id, wave_number), None)
            if session:
                session.stop()
            return session

    def stop_all(self):
        with self.lock:
            for s in list(self.active_sessions.values()):
                try:
                    s.stop()
                except Exception as e:
                    logger.error(f"Error stopping wave run session: {e}")
            self.active_sessions.clear()


wave_run_manager = WaveRunSessionManager()

