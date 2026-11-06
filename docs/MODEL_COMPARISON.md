# SIKAPTA AI - Komparasi Model Pose Estimation (CPU Mode)

Dokumen ini menjelaskan perbandingan teknis antara **MediaPipe Pose Landmarker** dan **Ultralytics YOLO Pose (yolov8n-pose)** pada lingkungan Windows tanpa GPU diskrit.

---

## 1. Karakteristik Model

| Parameter | MediaPipe Pose Landmarker | Ultralytics YOLOv8n-Pose |
| :--- | :--- | :--- |
| **Arsitektur Backing** | MobileNet / BlazePose TFLite | YOLOv8 nano Anchor-free CNN |
| **Ukuran File Model** | ~5.5 MB (`pose_landmarker_lite.task`) | ~6.5 MB (`yolov8n-pose.pt`) |
| **Jumlah Keypoint** | 33 Landmark Tubuh Lengkap | 17 Keypoints Standar COCO |
| **Eksekusi CPU** | XNNPACK TFLite CPU Delegate | PyTorch CPU Inference (LibTorch) |
| **Konsumsi Memori RAM** | ~150 - 250 MB | ~300 - 450 MB |
| **Kelebihan Utama** | Ekstraksi sendi sangat presisi pada jarak dekat; latensi rendah. | Tahan terhadap sudut miring kamera dan jarak pandang jauh (*wide-field*). |
| **Keterbatasan** | Sensitif terhadap oklusi parsial ekstrem atau objek di luar frame. | Latensi per frame sedikit lebih tinggi pada CPU dual-core lawas. |

---

## 2. Metodologi Benchmark Empiris

SIKAPTA AI mengimplementasikan benchmark sequential otomatis (`scripts/download_models.py` & `app/services/benchmark/runner.py`):
1. **Sekuens Video Uji Tunggal**: Kedua model dievaluasi secara bergiliran (*sequential*) pada video rekaman yang sama. Menjalankan dua model berat secara bersamaan dalam loop frame dapat menimbulkan CPU thread thrashing yang membiaskan hasil pengukuran latensi.
2. **Pengukuran Latensi Komprehensif**:
   - $\text{Latensi Rata-rata}$
   - $\text{Percentile 50 (p50)}$: Median latensi.
   - $\text{Percentile 95 (p95)}$: Penanda *jitter* / lonjakan latensi.
3. **Metrik Akurasi**:
   - $\text{Precision} = \frac{TP}{TP + FP}$
   - $\text{Recall} = \frac{TP}{TP + FN}$
   - $\text{F1-Score} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$
   - Hitungan frame tanpa pose valid (*pose loss count*).

