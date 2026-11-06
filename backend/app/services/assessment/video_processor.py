import os
import time
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.assessment_session import AssessmentSession
from app.models.rep_event import RepEvent
from app.schemas.pose import MovementAnalysisResult, PoseResult
from app.services.pose.factory import PoseEstimatorFactory
from app.services.movement.factory import MovementAnalyzerFactory

logger = logging.getLogger("sikapta.video_processor")

class VideoProcessorService:
    @staticmethod
    def process_video_session(
        session_id: int,
        video_path: Path,
        exercise_type: str,
        model_name: str = "mediapipe",
        gender: str = "L",
        tolerance_deg: float = 5.0,
        rule_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Processes an uploaded video file frame-by-frame, performs full pose estimation
        and movement analytics, records repetition events, generates an annotated video output,
        and persists the final assessment session results into PostgreSQL.
        """
        logger.info(f"Starting video processing for session {session_id} on {video_path}...")
        
        db: Session = SessionLocal()
        session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
        if not session_record:
            db.close()
            raise ValueError(f"Sesi {session_id} tidak ditemukan di database.")

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            db.close()
            raise ValueError(f"Gagal membuka file video: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS)
        fps = orig_fps if (orig_fps and orig_fps > 5 and orig_fps < 120) else 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

        # Setup output annotated video
        output_filename = f"annotated_{session_record.session_code}_{int(time.time())}.mp4"
        output_video_path = settings.EXPORTS_DIR / output_filename
        settings.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))

        # Setup Pose Estimator
        estimator = PoseEstimatorFactory.get_estimator(model_name)

        # Setup Movement Analyzer
        cfg = dict(rule_config or {})
        cfg["gender"] = gender
        cfg["tolerance_deg"] = tolerance_deg

        analyzer = MovementAnalyzerFactory.create_analyzer(exercise_type, cfg)

        latencies: List[float] = []
        rep_events_to_save: List[Any] = []
        last_counted_rep = 0
        frame_idx = 0
        start_time_proc = time.time()

        gender_label = "WANITA" if gender in ["P", "FEMALE", "WANITA", "PEREMPUAN"] else "PRIA"
        is_shuttle = exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                frame_idx += 1
                timestamp_ms = int((frame_idx / fps) * 1000)

                # 1. Pose Estimation
                pose_result = estimator.estimate(frame, timestamp_ms=timestamp_ms)
                latencies.append(pose_result.inference_latency_ms)

                # 2. Movement Analysis
                analysis = analyzer.process_frame(pose_result, timestamp_ms=timestamp_ms)

                # Check if a new rep cycle was completed
                if analysis.last_rep and analysis.last_rep.rep_number > last_counted_rep:
                    last_counted_rep = analysis.last_rep.rep_number
                    rep_events_to_save.append(analysis.last_rep)

                # 3. Draw Skeleton & Overlay
                status_color = (0, 255, 0) if analysis.is_in_good_form else (0, 165, 255)
                annotated = estimator.draw_skeleton(frame, pose_result, status_color=status_color)

                # 4. Render HUD
                h, w, _ = annotated.shape
                # Top Navy Banner
                cv2.rectangle(annotated, (0, 0), (w, 55), (15, 23, 42), -1)
                banner_title = (
                    f"SIKAPTA AI | SHUTTLE RUN ({gender_label}) | 6x10M ANGKA 8 [VIDEO]"
                    if is_shuttle
                    else f"SIKAPTA AI | {exercise_type.upper()} ({gender_label}) | TOL: \u00b1{int(tolerance_deg)}\u00b0 [VIDEO]"
                )
                cv2.putText(
                    annotated,
                    banner_title,
                    (15, 25),
                    cv2.FONT_HERSHEY_DUPLEX,
                    0.55,
                    (217, 119, 6),
                    1,
                    cv2.LINE_AA
                )
                cv2.putText(
                    annotated,
                    f"Model: {model_name.upper()} | Fase: {analysis.phase} | Frame: {frame_idx}/{total_frames}",
                    (15, 45),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA
                )

                # Rep Counters (Top Right)
                if is_shuttle:
                    stat_text = f"Putaran: {analysis.verified_reps}/3 | Lintasan: {analysis.detected_reps}/6"
                else:
                    stat_text = f"Terverifikasi: {analysis.verified_reps} | Ditolak: {analysis.rejected_reps} | Total: {analysis.detected_reps}"
                cv2.putText(annotated, stat_text, (max(10, w - 420), 32), cv2.FONT_HERSHEY_DUPLEX, 0.5, (16, 185, 129), 1, cv2.LINE_AA)

                # Bottom Feedback Banner
                cv2.rectangle(annotated, (0, h - 45), (w, h), (15, 23, 42), -1)
                feedback_color = (16, 185, 129) if analysis.is_in_good_form else (0, 69, 255)
                cv2.putText(annotated, f"Feedback: {analysis.feedback_message}", (15, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, feedback_color, 1, cv2.LINE_AA)

                # Angle or Time indicator
                if is_shuttle:
                    time_text = f"Waktu: {analysis.current_angle:.1f}s"
                    cv2.putText(annotated, time_text, (max(10, w - 180), h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
                else:
                    angle_text = f"Sudut: {analysis.current_angle:.1f}\u00b0"
                    cv2.putText(annotated, angle_text, (max(10, w - 180), h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

                # Write annotated frame
                out.write(annotated)

        finally:
            cap.release()
            out.release()

        proc_time_sec = time.time() - start_time_proc
        duration_sec = int(frame_idx / fps) if fps > 0 else 0
        avg_lat = round(sum(latencies) / len(latencies), 1) if latencies else 0.0
        avg_fps_proc = round(frame_idx / proc_time_sec, 1) if proc_time_sec > 0 else 30.0

        # Save repetition events to Database
        saved_events = []
        for rep in rep_events_to_save:
            ev = RepEvent(
                session_id=session_id,
                rep_number=rep.rep_number,
                status="valid" if rep.is_valid else "rejected",
                rejection_reason=rep.rejection_reason,
                start_timestamp_ms=rep.start_time_ms,
                end_timestamp_ms=rep.end_time_ms,
                peak_angle=rep.peak_angle,
                min_angle=rep.min_angle,
                confidence_avg=0.9,
                feedback=rep.feedback
            )
            db.add(ev)
            saved_events.append({
                "rep_number": rep.rep_number,
                "is_valid": rep.is_valid,
                "rejection_reason": rep.rejection_reason,
                "peak_angle": rep.peak_angle,
                "min_angle": rep.min_angle,
                "duration_ms": rep.duration_ms,
                "feedback": rep.feedback
            })

        # Update Session Record
        session_record.detected_reps = analyzer.detected_reps
        session_record.verified_reps = analyzer.verified_reps
        session_record.rejected_reps = analyzer.rejected_reps
        session_record.duration_seconds = duration_sec
        session_record.avg_fps = avg_fps_proc
        session_record.avg_latency_ms = avg_lat
        session_record.source_type = "video_upload"
        session_record.video_path = str(video_path)
        session_record.annotated_video_path = str(output_video_path)
        session_record.status = "pending_approval"
        session_record.end_time = datetime.now(timezone.utc)

        db.commit()
        db.refresh(session_record)
        db.close()

        logger.info(
            f"Video assessment analyzed (pending approval) for session {session_record.session_code}: "
            f"{analyzer.verified_reps} verified reps, {analyzer.rejected_reps} rejected reps, {analyzer.detected_reps} total."
        )

        return {
            "session_id": session_record.id,
            "session_code": session_record.session_code,
            "status": "pending_approval",
            "exercise_type": exercise_type,
            "model_used": model_name,
            "gender": gender,
            "tolerance_deg": tolerance_deg,
            "total_frames": frame_idx,
            "duration_seconds": duration_sec,
            "avg_fps": avg_fps_proc,
            "avg_latency_ms": avg_lat,
            "detected_reps": analyzer.detected_reps,
            "verified_reps": analyzer.verified_reps,
            "rejected_reps": analyzer.rejected_reps,
            "annotated_video_filename": output_filename,
            "annotated_video_url": f"/api/assessments/{session_record.id}/annotated-video",
            "source_video_url": f"/api/assessments/{session_record.id}/source-video",
            "rep_events": saved_events
        }

