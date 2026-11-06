import time
import base64
import asyncio
import threading
import logging
from typing import Dict, Any, Optional, Set
import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.assessment_session import AssessmentSession
from app.models.rep_event import RepEvent
from app.models.camera import Camera
from app.models.rule_profile import RuleProfile
from app.schemas.pose import PoseResult, MovementAnalysisResult
from app.services.camera.manager import camera_manager, CameraStream
from app.services.pose.factory import PoseEstimatorFactory
from app.services.movement.factory import MovementAnalyzerFactory

logger = logging.getLogger("sikapta.assessment")

class ActiveAssessmentSession:
    def __init__(
        self,
        session_id: int,
        session_code: str,
        participant_id: int,
        camera_id: Optional[int],
        exercise_type: str,
        model_name: str,
        rule_config: Dict[str, Any],
        gender: str = "L",
        tolerance_deg: float = 5.0
    ):
        self.session_id = session_id
        self.session_code = session_code
        self.participant_id = participant_id
        self.camera_id = camera_id
        self.exercise_type = exercise_type
        self.model_name = model_name
        self.rule_config = rule_config
        self.gender = str(rule_config.get("gender", gender)).upper()
        self.tolerance_deg = float(rule_config.get("tolerance_deg", tolerance_deg))

        self.status = "in_progress"  # in_progress, paused, completed
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.subscribers: Set[asyncio.Queue] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

        self.stream: Optional[CameraStream] = None
        self.estimator = PoseEstimatorFactory.get_estimator(model_name)
        self.analyzer = MovementAnalyzerFactory.create_analyzer(exercise_type, rule_config)

        self.start_time = time.time()
        self.total_frames = 0
        self.latencies = []
        self.fps_list = []
        self.rep_events_to_save = []
        self.latest_analysis: Optional[MovementAnalysisResult] = None
        self.latest_annotated_jpeg_b64: Optional[str] = None
        self.last_rep_counted = 0

    def start(self, event_loop: Optional[asyncio.AbstractEventLoop] = None):
        if event_loop and not event_loop.is_closed():
            self.loop = event_loop
        elif session_manager.main_loop and not session_manager.main_loop.is_closed():
            self.loop = session_manager.main_loop

        self.is_running = True

        # Open camera stream
        if self.camera_id:
            try:
                db = SessionLocal()
                cam = db.query(Camera).filter(Camera.id == self.camera_id).first()
                if cam:
                    self.stream = camera_manager.get_or_create_stream(
                        camera_id=cam.id,
                        camera_type=cam.camera_type,
                        device_index=cam.device_index or 0,
                        rtsp_url=cam.rtsp_url,
                        width=cam.resolution_w,
                        height=cam.resolution_h,
                        target_fps=cam.target_fps
                    )
                db.close()
            except Exception as e:
                logger.error(f"Error opening camera for session {self.session_code}: {e}")

        self.thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.thread.start()
        logger.info(f"Assessment session {self.session_code} processing loop started.")

    def pause(self):
        self.status = "paused"
        logger.info(f"Assessment session {self.session_code} paused.")

    def resume(self):
        self.status = "in_progress"
        logger.info(f"Assessment session {self.session_code} resumed.")

    def stop(self, save_to_db: bool = False):
        self.is_running = False
        self.status = "completed"
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)

        # Release camera hardware so it is available for next session
        if self.camera_id:
            try:
                camera_manager.stop_stream(self.camera_id)
            except Exception as e:
                logger.error(f"Error stopping camera {self.camera_id}: {e}")
            self.stream = None

        # Persist session summary and rep events to Database only if explicitly requested
        if save_to_db:
            self._save_session_results()
            logger.info(f"Assessment session {self.session_code} stopped and saved to DB.")
        else:
            logger.info(f"Assessment session {self.session_code} stopped cleanly.")

    def get_current_state_payload(self, fps: Optional[float] = None, latency_ms: Optional[float] = None) -> Dict[str, Any]:
        curr_fps = fps if fps is not None else (self.fps_list[-1] if self.fps_list else 30.0)
        curr_lat = latency_ms if latency_ms is not None else (self.latencies[-1] if self.latencies else 0.0)
        return {
            "session_id": self.session_id,
            "session_code": self.session_code,
            "status": self.status,
            "exercise": self.exercise_type,
            "model": self.model_name,
            "gender": self.gender,
            "tolerance_deg": self.tolerance_deg,
            "fps": curr_fps,
            "latency_ms": round(curr_lat, 1),
            "current_angle": self.latest_analysis.current_angle if self.latest_analysis else 0.0,
            "phase": self.latest_analysis.phase if self.latest_analysis else "INIT",
            "detected_reps": self.latest_analysis.detected_reps if self.latest_analysis else 0,
            "verified_reps": self.latest_analysis.verified_reps if self.latest_analysis else 0,
            "rejected_reps": self.latest_analysis.rejected_reps if self.latest_analysis else 0,
            "feedback": self.latest_analysis.feedback_message if self.latest_analysis else "",
            "is_good_form": self.latest_analysis.is_in_good_form if self.latest_analysis else True,
            "bar_y": self.latest_analysis.bar_y if self.latest_analysis else None,
            "chin_y": self.latest_analysis.chin_y if self.latest_analysis else None,
            "chin_passed_bar": self.latest_analysis.chin_passed_bar if self.latest_analysis else None,
            "frame": self.latest_annotated_jpeg_b64,
            "is_completed": (self.status == "completed"),
            "final_time_seconds": getattr(self.analyzer, "elapsed_time_seconds", 0.0) if (self.exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]) else None,
            "final_score": getattr(self.analyzer, "final_shuttle_score", 0.0) if (self.exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]) else None,
        }

    def _processing_loop(self):
        frame_interval = 1.0 / max(1, settings.CAMERA_TARGET_FPS)
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
                    # Fallback to visual standby canvas if no camera hardware frame is ready yet
                    frame = np.zeros((settings.CAMERA_FRAME_HEIGHT, settings.CAMERA_FRAME_WIDTH, 3), dtype=np.uint8)
                    cv2.putText(
                        frame,
                        "SIKAPTA AI - MEMPROSES FEED KAMERA...",
                        (30, 240),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (200, 200, 200),
                        2,
                        cv2.LINE_AA
                    )

                now_ms = int(time.time() * 1000)

                # 1. Pose Estimation
                pose_result = self.estimator.estimate(frame, timestamp_ms=now_ms)
                self.latencies.append(pose_result.inference_latency_ms)

                # 2. Movement Analysis
                analysis = self.analyzer.process_frame(pose_result, timestamp_ms=now_ms)
                self.latest_analysis = analysis

                is_shuttle = self.exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]
                shuttle_completed = is_shuttle and (
                    analysis.phase == "SELESAI" or
                    analysis.verified_reps >= 3 or
                    getattr(self.analyzer, "shuttle_state", "") == "COMPLETED" or
                    getattr(self.analyzer, "completed_crossings", 0) >= 6
                )

                # Check if a new rep was detected and prepare DB record
                if analysis.last_rep and analysis.last_rep.rep_number > self.last_rep_counted:
                    self.last_rep_counted = analysis.last_rep.rep_number
                    self.rep_events_to_save.append(analysis.last_rep)

                # 3. Draw Skeleton and Live HUD Overlay
                status_color = (0, 255, 0) if analysis.is_in_good_form else (0, 165, 255)
                annotated = self.estimator.draw_skeleton(frame, pose_result, status_color=status_color)

                # Draw HUD
                self._render_hud(annotated, analysis, pose_result)

                # 4. Encode frame to JPEG
                ret, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY])
                if ret:
                    self.latest_annotated_jpeg_b64 = base64.b64encode(buf).decode('utf-8')

                # Calculate FPS
                dt = time.time() - last_time
                current_fps = round(1.0 / dt, 1) if dt > 0 else 30.0
                last_time = time.time()
                self.fps_list.append(current_fps)
                self.total_frames += 1

                # 5. Broadcast to WebSocket subscribers
                self._broadcast_state(current_fps, pose_result.inference_latency_ms, is_completed=shuttle_completed)

                # Auto-stop trigger for Shuttle Run upon completing 3 laps (6 crossings)
                if shuttle_completed:
                    logger.info(f"Shuttle run reached 3 laps in session {self.session_code}. Auto-completing session...")
                    self.status = "completed"
                    if getattr(self.analyzer, "last_rep_result", None) and self.analyzer.last_rep_result not in self.rep_events_to_save:
                        self.rep_events_to_save.append(self.analyzer.last_rep_result)
                    self._save_session_results()
                    self.is_running = False
                    break

            except Exception as e:
                logger.error(f"Error in assessment processing loop ({self.session_code}): {e}", exc_info=True)
                time.sleep(0.05)

            elapsed = time.time() - loop_start
            sleep_time = max(0.001, frame_interval - elapsed)
            time.sleep(sleep_time)

    def _render_hud(self, frame: np.ndarray, analysis: MovementAnalysisResult, pose_result: PoseResult):
        h, w, _ = frame.shape
        gender_label = "WANITA" if self.gender in ["P", "FEMALE", "WANITA", "PEREMPUAN"] else "PRIA"
        # Top banner with institutional styling
        cv2.rectangle(frame, (0, 0), (w, 55), (15, 23, 42), -1)  # Navy banner
        is_shuttle = self.exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]
        banner_title = (
            f"SIKAPTA AI | SHUTTLE RUN ({gender_label}) | 6x10M ANGKA 8"
            if is_shuttle
            else f"SIKAPTA AI | {self.exercise_type.upper()} ({gender_label}) | TOL: \u00b1{int(self.tolerance_deg)}\u00b0"
        )
        cv2.putText(
            frame,
            banner_title,
            (15, 25),
            cv2.FONT_HERSHEY_DUPLEX,
            0.55,
            (217, 119, 6),
            1,
            cv2.LINE_AA
        )
        cv2.putText(frame, f"Model: {self.model_name.upper()} | Fase: {analysis.phase}", (15, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # Rep Counters (Top Right)
        if is_shuttle:
            stat_text = f"Putaran: {analysis.verified_reps}/3 | Lintasan: {analysis.detected_reps}/6"
        else:
            stat_text = f"Terverifikasi: {analysis.verified_reps} | Ditolak: {analysis.rejected_reps} | Total: {analysis.detected_reps}"
        cv2.putText(frame, stat_text, (w - 420, 32), cv2.FONT_HERSHEY_DUPLEX, 0.5, (16, 185, 129), 1, cv2.LINE_AA)

        # Bottom Feedback Banner
        cv2.rectangle(frame, (0, h - 45), (w, h), (15, 23, 42), -1)
        feedback_color = (16, 185, 129) if analysis.is_in_good_form else (0, 69, 255)
        cv2.putText(frame, f"Feedback: {analysis.feedback_message}", (15, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, feedback_color, 1, cv2.LINE_AA)

        # Angle or Time indicator
        if is_shuttle:
            time_text = f"Waktu: {analysis.current_angle:.1f}s"
            cv2.putText(frame, time_text, (w - 180, h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        else:
            angle_text = f"Sudut: {analysis.current_angle:.1f}\u00b0"
            cv2.putText(frame, angle_text, (w - 180, h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    def _broadcast_state(self, fps: float, latency_ms: float, is_completed: bool = False):
        if not self.subscribers:
            return

        target_loop = self.loop if (self.loop and not self.loop.is_closed()) else session_manager.main_loop
        if not target_loop or target_loop.is_closed():
            return

        payload = self.get_current_state_payload(fps=fps, latency_ms=latency_ms)
        if is_completed:
            payload["is_completed"] = True
            payload["auto_stop"] = True
            payload["phase"] = "SELESAI"

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
            logger.debug(f"Error dispatching state to websocket: {e}")

    def _save_session_results(self):
        db: Session = SessionLocal()
        try:
            session_record = db.query(AssessmentSession).filter(AssessmentSession.id == self.session_id).first()
            if session_record:
                now = time.time()
                duration = max(1, int(now - self.start_time))
                avg_fps = round(sum(self.fps_list) / len(self.fps_list), 1) if self.fps_list else 30.0
                avg_lat = round(sum(self.latencies) / len(self.latencies), 1) if self.latencies else 0.0

                session_record.status = "completed"

                is_shuttle = self.exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]
                if is_shuttle and getattr(self.analyzer, "elapsed_time_seconds", 0) > 0:
                    shuttle_sec = float(self.analyzer.elapsed_time_seconds)
                    session_record.duration_seconds = max(1, int(round(shuttle_sec)))
                    shuttle_score = getattr(self.analyzer, "final_shuttle_score", 0.0)
                    shuttle_note = f"Waktu Shuttle Run: {shuttle_sec:.2f}s | Nilai: {shuttle_score}"
                    if session_record.examiner_notes:
                        if "Waktu Shuttle Run:" not in session_record.examiner_notes:
                            session_record.examiner_notes = f"{shuttle_note} | {session_record.examiner_notes}"
                    else:
                        session_record.examiner_notes = shuttle_note
                else:
                    session_record.duration_seconds = max(session_record.duration_seconds, duration)

                det = self.analyzer.detected_reps if self.analyzer else (self.latest_analysis.detected_reps if self.latest_analysis else 0)
                ver = self.analyzer.verified_reps if self.analyzer else (self.latest_analysis.verified_reps if self.latest_analysis else 0)
                rej = self.analyzer.rejected_reps if self.analyzer else (self.latest_analysis.rejected_reps if self.latest_analysis else 0)

                session_record.detected_reps = max(session_record.detected_reps, det)
                session_record.verified_reps = max(session_record.verified_reps, ver)
                session_record.rejected_reps = max(session_record.rejected_reps, rej)
                session_record.avg_fps = avg_fps
                session_record.avg_latency_ms = avg_lat

                # Save RepEvents (avoid duplicate rep_number)
                existing_reps = {r.rep_number for r in db.query(RepEvent.rep_number).filter(RepEvent.session_id == self.session_id).all()}
                for rep in self.rep_events_to_save:
                    if rep.rep_number not in existing_reps:
                        rep_event = RepEvent(
                            session_id=self.session_id,
                            rep_number=rep.rep_number,
                            status="verified" if rep.is_valid else "rejected",
                            rejection_reason=rep.rejection_reason,
                            start_timestamp_ms=rep.start_time_ms,
                            end_timestamp_ms=rep.end_time_ms,
                            peak_angle=rep.peak_angle,
                            min_angle=rep.min_angle,
                            confidence_avg=0.85,
                            feedback=rep.feedback
                        )
                        db.add(rep_event)

                db.commit()
                logger.info(f"Persisted assessment session {self.session_id} to database.")
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving assessment session {self.session_id}: {e}")
        finally:
            db.close()

class AssessmentSessionManager:
    def __init__(self):
        self.active_sessions: Dict[int, ActiveAssessmentSession] = {}
        self.lock = threading.Lock()
        self.main_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self.main_loop = loop
        logger.info("Main event loop registered in AssessmentSessionManager.")

    def create_session(
        self,
        session_id: int,
        session_code: str,
        participant_id: int,
        camera_id: Optional[int],
        exercise_type: str,
        model_name: str,
        rule_config: Dict[str, Any],
        gender: str = "L",
        tolerance_deg: float = 5.0,
        loop: Optional[asyncio.AbstractEventLoop] = None
    ) -> ActiveAssessmentSession:
        with self.lock:
            if session_id in self.active_sessions:
                return self.active_sessions[session_id]

            effective_loop = loop if (loop and not loop.is_closed()) else self.main_loop

            session = ActiveAssessmentSession(
                session_id=session_id,
                session_code=session_code,
                participant_id=participant_id,
                camera_id=camera_id,
                exercise_type=exercise_type,
                model_name=model_name,
                rule_config=rule_config,
                gender=gender,
                tolerance_deg=tolerance_deg
            )
            session.start(effective_loop)
            self.active_sessions[session_id] = session
            return session

    def get_session(self, session_id: int) -> Optional[ActiveAssessmentSession]:
        with self.lock:
            return self.active_sessions.get(session_id)

    def stop_session(self, session_id: int, save_to_db: bool = False):
        with self.lock:
            session = self.active_sessions.pop(session_id, None)
            if session:
                session.stop(save_to_db=save_to_db)

    def stop_all(self):
        with self.lock:
            for s in list(self.active_sessions.values()):
                try:
                    s.stop()
                except Exception as e:
                    logger.error(f"Error stopping session {s.session_code}: {e}")
            self.active_sessions.clear()

session_manager = AssessmentSessionManager()

