import asyncio
import json
import logging
import time
import base64
import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.camera import Camera
from app.services.camera.manager import camera_manager
from app.services.pose.factory import PoseEstimatorFactory
from app.services.movement.factory import MovementAnalyzerFactory
from app.services.assessment.session_manager import session_manager
from app.services.assessment.wave_run_manager import wave_run_manager

logger = logging.getLogger("sikapta.websocket")
router = APIRouter()

@router.websocket("/ws/assessments/{session_id}/live")
async def live_assessment_websocket(websocket: WebSocket, session_id: int):
    await websocket.accept()
    logger.info(f"WebSocket client connected to session {session_id}")

    active_session = session_manager.get_session(session_id)
    if not active_session:
        await websocket.send_json({
            "error": "Sesi pengujian tidak aktif atau belum dimulai",
            "session_id": session_id
        })
        await websocket.close()
        return

    # Ensure session manager and active session have the active running event loop
    current_loop = asyncio.get_running_loop()
    if not session_manager.main_loop or session_manager.main_loop.is_closed():
        session_manager.set_event_loop(current_loop)
    active_session.loop = current_loop

    # Create dedicated queue for this WebSocket subscriber (low maxsize to ensure real-time stream)
    queue = asyncio.Queue(maxsize=3)
    active_session.subscribers.add(queue)

    try:
        # Send initial frame and state immediately if available
        if active_session.latest_annotated_jpeg_b64:
            initial_data = active_session.get_current_state_payload()
            await websocket.send_json(initial_data)

        while True:
            # Wait for next frame/state from active session worker
            data = await queue.get()
            await websocket.send_json(data)
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from session {session_id}")
    except Exception as e:
        logger.warning(f"WebSocket error in session {session_id}: {e}")
    finally:
        active_session.subscribers.discard(queue)




@router.websocket("/ws/events/{event_id}/waves/{wave_number}/run-live")
async def wave_run_live_websocket(websocket: WebSocket, event_id: int, wave_number: int):
    await websocket.accept()
    logger.info(f"WebSocket client connected to wave run E{event_id}-W{wave_number}")

    active_session = wave_run_manager.get_session(event_id, wave_number)
    if not active_session:
        await websocket.send_json({
            "error": "Sesi Live Cam Lari Gelombang belum dimulai atau sudah dihentikan",
            "event_id": event_id,
            "wave_number": wave_number
        })
        await websocket.close()
        return

    current_loop = asyncio.get_running_loop()
    if not wave_run_manager.main_loop or wave_run_manager.main_loop.is_closed():
        wave_run_manager.set_event_loop(current_loop)
    active_session.loop = current_loop

    queue = asyncio.Queue(maxsize=3)
    active_session.subscribers.add(queue)

    try:
        initial_data = active_session.get_current_state_payload()
        await websocket.send_json(initial_data)

        while True:
            data = await queue.get()
            await websocket.send_json(data)
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from wave run E{event_id}-W{wave_number}")
    except Exception as e:
        logger.warning(f"WebSocket error in wave run E{event_id}-W{wave_number}: {e}")
    finally:
        active_session.subscribers.discard(queue)


@router.websocket("/ws/cameras/{camera_id}/preview")
async def camera_preview_websocket(
    websocket: WebSocket,
    camera_id: int,
    exercise_type: str = "shuttlerun",
    model_name: str = "mediapipe",
    gender: str = "L",
    tolerance_deg: float = 5.0
):
    """
    WebSocket endpoint untuk pratinjau kamera deteksi langsung (Live Preview with AI Pose & Track HUD).
    Memungkinkan penguji/operator mengaktifkan kamera sebelum menekan tombol 'Mulai Pengujian',
    memastikan jangkauan tiang/garis lintasan dan pelari sudah terdeteksi dengan tepat.
    """
    await websocket.accept()
    logger.info(f"Camera preview WebSocket connected: camera_id={camera_id}, exercise={exercise_type}")

    # Ambil konfigurasi kamera dari database atau fallback ke device webcam lokal
    stream = None
    db = SessionLocal()
    try:
        cam = db.query(Camera).filter(Camera.id == camera_id).first()
        if cam:
            stream = camera_manager.get_or_create_stream(
                camera_id=cam.id,
                camera_type=cam.camera_type or "webcam",
                device_index=cam.device_index if cam.device_index is not None else 0,
                rtsp_url=cam.rtsp_url,
                width=cam.resolution_w or settings.CAMERA_FRAME_WIDTH,
                height=cam.resolution_h or settings.CAMERA_FRAME_HEIGHT,
                target_fps=cam.target_fps or settings.CAMERA_TARGET_FPS
            )
        else:
            stream = camera_manager.get_or_create_stream(
                camera_id=camera_id,
                camera_type="webcam",
                device_index=0,
                width=settings.CAMERA_FRAME_WIDTH,
                height=settings.CAMERA_FRAME_HEIGHT,
                target_fps=settings.CAMERA_TARGET_FPS
            )
    except Exception as e:
        logger.warning(f"Error querying camera from DB: {e}")
        stream = camera_manager.get_or_create_stream(
            camera_id=camera_id,
            camera_type="webcam",
            device_index=0,
            width=settings.CAMERA_FRAME_WIDTH,
            height=settings.CAMERA_FRAME_HEIGHT,
            target_fps=settings.CAMERA_TARGET_FPS
        )
    finally:
        db.close()

    if stream:
        try:
            stream.start()
        except Exception as e:
            logger.warning(f"Error starting camera stream: {e}")

    estimator = PoseEstimatorFactory.get_estimator(model_name)
    analyzer = MovementAnalyzerFactory.create_analyzer(exercise_type, {
        "gender": gender,
        "tolerance_deg": tolerance_deg
    })

    frame_interval = 1.0 / max(1, settings.CAMERA_TARGET_FPS)
    last_time = time.time()
    gender_label = "WANITA" if str(gender).upper() in ["P", "FEMALE", "WANITA", "PEREMPUAN"] else "PRIA"
    is_shuttle = exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]

    try:
        while True:
            loop_start = time.time()
            frame = None
            if stream:
                frame = stream.get_latest_frame()

            if frame is None:
                frame = np.zeros((settings.CAMERA_FRAME_HEIGHT, settings.CAMERA_FRAME_WIDTH, 3), dtype=np.uint8)
                err = getattr(stream, "error_message", None) if stream else None
                if err:
                    cv2.putText(
                        frame,
                        "GAGAL MEMBUKA KAMERA PERANGKAT",
                        (30, 220),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.62,
                        (0, 0, 240),
                        2,
                        cv2.LINE_AA
                    )
                    cv2.putText(
                        frame,
                        str(err),
                        (30, 255),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.48,
                        (0, 180, 255),
                        1,
                        cv2.LINE_AA
                    )
                else:
                    cv2.putText(
                        frame,
                        "SIKAPTA AI - MEMBUKA STREAM KAMERA...",
                        (30, 240),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.65,
                        (200, 200, 200),
                        2,
                        cv2.LINE_AA
                    )

            now_ms = int(time.time() * 1000)
            pose_result = estimator.estimate(frame, timestamp_ms=now_ms)
            analysis = analyzer.process_frame(pose_result, timestamp_ms=now_ms)

            status_color = (0, 255, 0) if analysis.is_in_good_form else (0, 165, 255)
            annotated = estimator.draw_skeleton(frame, pose_result, status_color=status_color)

            h, w, _ = annotated.shape

            # Top Navy Banner for Preview
            cv2.rectangle(annotated, (0, 0), (w, 55), (15, 23, 42), -1)
            cv2.putText(
                annotated,
                f"SIKAPTA AI | PRATINJAU KAMERA DETEKSI | {exercise_type.upper()} ({gender_label})",
                (15, 25),
                cv2.FONT_HERSHEY_DUPLEX,
                0.52,
                (245, 158, 11),
                1,
                cv2.LINE_AA
            )
            cv2.putText(
                annotated,
                f"Model: {model_name.upper()} | Status: {analysis.feedback_message}",
                (15, 45),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

            # Draw Figure-8 track guidelines when in Shuttle Run
            if is_shuttle:
                left_thresh = getattr(analyzer, "left_threshold", 0.32)
                right_thresh = getattr(analyzer, "right_threshold", 0.68)
                left_x = int(w * left_thresh)
                right_x = int(w * right_thresh)
                center_x = int(w * 0.5)

                # Vertical guide lines
                cv2.line(annotated, (left_x, 60), (left_x, h - 50), (0, 215, 255), 2, cv2.LINE_AA)
                cv2.putText(annotated, "TIANG KIRI", (max(5, left_x - 90), 80), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 215, 255), 1, cv2.LINE_AA)

                cv2.line(annotated, (center_x, 60), (center_x, h - 50), (120, 120, 120), 1, cv2.LINE_AA)
                cv2.putText(annotated, "TENGAH", (center_x - 30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA)

                cv2.line(annotated, (right_x, 60), (right_x, h - 50), (0, 215, 255), 2, cv2.LINE_AA)
                cv2.putText(annotated, "TIANG KANAN", (min(w - 110, right_x + 10), 80), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 215, 255), 1, cv2.LINE_AA)

            # Bottom info banner
            cv2.rectangle(annotated, (0, h - 45), (w, h), (15, 23, 42), -1)
            shuttle_state = getattr(analyzer, "shuttle_state", "INIT")
            if shuttle_state == "READY":
                status_text = "PELARI SIAP DI TITIK START - Siap Mulai Pengujian!"
                text_color = (16, 185, 129)
            elif pose_result.is_detected:
                status_text = "PELARI TERDETEKSI: Arahkan pelari ke titik tiang start"
                text_color = (59, 130, 246)
            else:
                status_text = "MENCARI PELARI: Arahkan kamera ke lintasan agar pelari terlihat"
                text_color = (234, 179, 8)

            cv2.putText(annotated, status_text, (15, h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.46, text_color, 1, cv2.LINE_AA)

            ret, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY])
            frame_b64 = base64.b64encode(buf).decode('utf-8') if ret else None

            dt = time.time() - last_time
            current_fps = round(1.0 / dt, 1) if dt > 0 else 30.0
            last_time = time.time()

            await websocket.send_json({
                "fps": current_fps,
                "latency_ms": pose_result.inference_latency_ms,
                "current_angle": analysis.current_angle,
                "phase": analysis.phase,
                "detected_reps": analysis.detected_reps,
                "verified_reps": analysis.verified_reps,
                "rejected_reps": analysis.rejected_reps,
                "feedback": analysis.feedback_message,
                "is_good_form": analysis.is_in_good_form,
                "is_detected": pose_result.is_detected,
                "frame": frame_b64,
                "preview": True,
                "shuttle_state": shuttle_state
            })

            elapsed = time.time() - loop_start
            sleep_time = max(0.005, frame_interval - elapsed)
            await asyncio.sleep(sleep_time)

    except WebSocketDisconnect:
        logger.info(f"Camera preview WebSocket disconnected: camera_id={camera_id}")
    except Exception as e:
        logger.warning(f"Error in camera preview WebSocket: {e}")





