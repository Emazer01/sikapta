"""
Script to download AI models for SIKAPTA AI:
1. MediaPipe Pose Landmarker (pose_landmarker_lite.task, pose_landmarker_full.task)
2. Ultralytics YOLO Pose (yolov8n-pose.pt)
"""
import os
import urllib.request
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "data" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MEDIAPIPE_MODELS = {
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    "pose_landmarker_full.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
}

def download_file(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 0:
        print(f"[OK] Already exists: {dest_path.name} ({dest_path.stat().st_size / (1024*1024):.2f} MB)")
        return
    print(f"[*] Downloading {dest_path.name} from {url}...")
    urllib.request.urlretrieve(url, str(dest_path))
    print(f"[OK] Downloaded: {dest_path.name} ({dest_path.stat().st_size / (1024*1024):.2f} MB)")

def setup_models():
    # 1. MediaPipe models
    for name, url in MEDIAPIPE_MODELS.items():
        try:
            download_file(url, MODELS_DIR / name)
        except Exception as e:
            print(f"[!] Warning downloading {name}: {e}")

    # 2. YOLO Pose model
    yolo_model_path = MODELS_DIR / "yolov8n-pose.pt"
    root_yolo = BASE_DIR / "yolov8n-pose.pt"
    if root_yolo.exists() and not yolo_model_path.exists():
        shutil.move(str(root_yolo), str(yolo_model_path))
        print(f"[OK] Moved yolov8n-pose.pt to {yolo_model_path}")
    elif yolo_model_path.exists():
        print(f"[OK] Already exists: yolov8n-pose.pt ({yolo_model_path.stat().st_size / (1024*1024):.2f} MB)")
    else:
        print("[*] Downloading yolov8n-pose.pt via Ultralytics...")
        from ultralytics import YOLO
        model = YOLO("yolov8n-pose.pt")
        if root_yolo.exists():
            shutil.move(str(root_yolo), str(yolo_model_path))
        print(f"[OK] yolov8n-pose.pt is ready in {yolo_model_path}")

if __name__ == "__main__":
    setup_models()

