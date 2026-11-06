import time
import threading
import logging
from typing import Optional, Tuple, Dict, Any
import cv2
import numpy as np

logger = logging.getLogger("sikapta.camera")

class CameraStream:
    """Threaded camera stream providing low-latency latest-frame capture."""
    def __init__(
        self,
        camera_id: int,
        camera_type: str = "webcam",
        device_index: int = 0,
        rtsp_url: Optional[str] = None,
        width: int = 640,
        height: int = 480,
        target_fps: int = 30
    ):
        self.camera_id = camera_id
        self.camera_type = camera_type
        self.device_index = device_index
        self.rtsp_url = rtsp_url
        self.width = width
        self.height = height
        self.target_fps = target_fps

        self.cap: Optional[cv2.VideoCapture] = None
        self.latest_frame: Optional[np.ndarray] = None
        self.is_running = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.fps_actual = 0.0
        self.last_frame_time = time.time()
        self.error_message: Optional[str] = None

    def start(self) -> bool:
        if self.is_running:
            return True

        if self.camera_type == "webcam":
            source = self.device_index
            # Try DirectShow on Windows, fallback to default backend
            self.cap = cv2.VideoCapture(source, cv2.CAP_DSHOW if hasattr(cv2, 'CAP_DSHOW') else cv2.CAP_ANY)
            if not self.cap or not self.cap.isOpened():
                self.cap = cv2.VideoCapture(source, cv2.CAP_ANY)
        else:
            source = self.rtsp_url
            self.cap = cv2.VideoCapture(source)

        if not self.cap or not self.cap.isOpened():
            self.error_message = f"Gagal membuka kamera ({self.camera_type}: {source})"
            logger.error(self.error_message)
            return False

        # Configure resolution
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.target_fps)

        self.is_running = True
        self.error_message = None
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        logger.info(f"Camera {self.camera_id} ({self.camera_type}) started successfully.")
        return True

    def _capture_loop(self):
        frame_interval = 1.0 / max(1, self.target_fps)
        frame_count = 0
        start_stat_time = time.time()

        while self.is_running and self.cap and self.cap.isOpened():
            loop_start = time.time()
            ret, frame = self.cap.read()
            if not ret or frame is None:
                logger.warning(f"Failed to read frame from camera {self.camera_id}. Attempting reconnect...")
                time.sleep(0.5)
                continue

            with self.lock:
                self.latest_frame = frame
                self.last_frame_time = time.time()

            frame_count += 1
            if time.time() - start_stat_time >= 1.0:
                self.fps_actual = round(frame_count / (time.time() - start_stat_time), 1)
                frame_count = 0
                start_stat_time = time.time()

            elapsed = time.time() - loop_start
            sleep_time = max(0.001, frame_interval - elapsed)
            time.sleep(sleep_time)

    def get_latest_frame(self) -> Optional[np.ndarray]:
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None
        self.latest_frame = None
        logger.info(f"Camera {self.camera_id} stopped.")

class CameraManager:
    """Manages active camera streams and connection testing."""
    def __init__(self):
        self.streams: Dict[int, CameraStream] = {}
        self.lock = threading.Lock()

    def get_or_create_stream(
        self,
        camera_id: int,
        camera_type: str = "webcam",
        device_index: int = 0,
        rtsp_url: Optional[str] = None,
        width: int = 640,
        height: int = 480,
        target_fps: int = 30
    ) -> CameraStream:
        with self.lock:
            if camera_id in self.streams:
                stream = self.streams[camera_id]
                if not stream.is_running or not stream.cap or not stream.cap.isOpened():
                    try:
                        stream.stop()
                    except Exception:
                        pass
                else:
                    return stream

            stream = CameraStream(
                camera_id=camera_id,
                camera_type=camera_type,
                device_index=device_index,
                rtsp_url=rtsp_url,
                width=width,
                height=height,
                target_fps=target_fps
            )
            stream.start()
            self.streams[camera_id] = stream
            return stream

    def stop_stream(self, camera_id: int):
        with self.lock:
            if camera_id in self.streams:
                self.streams[camera_id].stop()
                del self.streams[camera_id]

    def stop_all(self):
        with self.lock:
            for s in self.streams.values():
                s.stop()
            self.streams.clear()

    @staticmethod
    def test_connection(
        camera_type: str = "webcam",
        device_index: int = 0,
        rtsp_url: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Test whether a webcam or RTSP feed can be connected and grabbed."""
        source = device_index if camera_type == "webcam" else rtsp_url
        if camera_type == "rtsp" and not rtsp_url:
            return False, "URL RTSP tidak boleh kosong", None

        try:
            if camera_type == "webcam":
                cap = cv2.VideoCapture(source, cv2.CAP_DSHOW if hasattr(cv2, 'CAP_DSHOW') else cv2.CAP_ANY)
            else:
                cap = cv2.VideoCapture(source)

            if not cap.isOpened():
                return False, f"Tidak dapat membuka koneksi ke {camera_type} ({source})", None

            ret, frame = cap.read()
            cap.release()

            if ret and frame is not None:
                h, w, _ = frame.shape
                return True, f"Koneksi berhasil! Resolusi: {w}x{h}", {"width": w, "height": h}
            else:
                return False, "Kamera terdeteksi namun tidak dapat membaca frame", None
        except Exception as e:
            return False, f"Kesalahan saat menguji kamera: {str(e)}", None

camera_manager = CameraManager()

