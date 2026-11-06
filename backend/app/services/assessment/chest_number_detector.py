import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import cv2
import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

from app.core.config import settings


@dataclass
class DetectedChestNumber:
    raw_text: str
    matched_chest_number: Optional[str]
    participant_id: Optional[int]
    participant_name: Optional[str]
    bbox: Tuple[int, int, int, int]  # (x, y, w, h)
    confidence: float
    vest_color: str = "Netral"
    vest_hex: str = "#94A3B8"
    vest_bgr: Tuple[int, int, int] = (180, 180, 180)

    @property
    def chest_number(self) -> str:
        return self.matched_chest_number or self.raw_text


class ChestNumberDetector:
    """
    Real-time Computer Vision detector for runner chest numbers (Nomor Dada)
    in Samapta 12-minute running waves.
    Uses multi-scale Bib ROI extraction, Otsu/Adaptive character segmentation,
    topological hole hierarchy analysis, and multi-font template correlation.
    """

    def __init__(self):
        self.template_w = 32
        self.template_h = 48
        self.templates: Dict[str, List[np.ndarray]] = self._build_digit_templates()
        self.pose_model = None
        if YOLO is not None:
            try:
                model_p = settings.MODELS_DIR / "yolov8n-pose.pt"
                if model_p.exists():
                    self.pose_model = YOLO(str(model_p))
            except Exception:
                self.pose_model = None

        # Matriks template unik untuk inferensi vektorisasi berkecepatan tinggi (~60x lebih cepat)
        unique_tmpls = []
        tmpl_digits = []
        for d_str, tmpl_list in self.templates.items():
            uniques = []
            for t in tmpl_list:
                if not any(np.array_equal(t, u) for u in uniques):
                    uniques.append(t)
                    unique_tmpls.append((t > 127).astype(np.float32).flatten())
                    tmpl_digits.append(d_str)

        self.tmpl_matrix: np.ndarray = np.array(unique_tmpls)
        self.tmpl_sums: np.ndarray = self.tmpl_matrix.sum(axis=1)
        self.tmpl_digits: np.ndarray = np.array(tmpl_digits)
        self.digit_indices: Dict[str, np.ndarray] = {
            d_str: np.where(self.tmpl_digits == d_str)[0] for d_str in "0123456789"
        }
        self._zone_cache: Optional[Tuple[List[Tuple[int, int, int, int]], List[Tuple[int, int, int, int]]]] = None
        self._zone_cache_frame: int = 0

    def _build_digit_templates(self) -> Dict[str, List[np.ndarray]]:
        bank: Dict[str, List[np.ndarray]] = {str(d): [] for d in range(10)}
        fonts = [
            cv2.FONT_HERSHEY_SIMPLEX,
            cv2.FONT_HERSHEY_DUPLEX,
            cv2.FONT_HERSHEY_COMPLEX,
            cv2.FONT_HERSHEY_TRIPLEX,
        ]
        scales = [1.8, 2.2, 2.6]
        thicknesses = [2, 3, 4, 5, 6, 7, 8]

        for d_int in range(10):
            d_str = str(d_int)
            for font in fonts:
                for scale in scales:
                    for thick in thicknesses:
                        canvas = np.zeros((140, 140), dtype=np.uint8)
                        cv2.putText(canvas, d_str, (25, 105), font, scale, 255, thick, cv2.LINE_AA)
                        _, bw = cv2.threshold(canvas, 127, 255, cv2.THRESH_BINARY)
                        coords = cv2.findNonZero(bw)
                        if coords is None:
                            continue
                        x, y, w, h = cv2.boundingRect(coords)
                        if w < 3 or h < 8:
                            continue
                        crop = bw[y : y + h, x : x + w]
                        norm = self._normalize_digit_crop(crop)
                        bank[d_str].append(norm)

        # Also add clean unslashed oval '0' templates (for standard sans-serif printed bibs like Arial/Roboto)
        for thick in [3, 5, 7, 9]:
            canvas = np.zeros((140, 140), dtype=np.uint8)
            cv2.ellipse(canvas, (70, 70), (28, 44), 0, 0, 360, 255, thick, cv2.LINE_AA)
            _, bw = cv2.threshold(canvas, 127, 255, cv2.THRESH_BINARY)
            coords = cv2.findNonZero(bw)
            if coords is not None:
                x, y, w, h = cv2.boundingRect(coords)
                bank["0"].append(self._normalize_digit_crop(bw[y : y + h, x : x + w]))

        # Also add clean sans-serif vertical bar '1' templates with multiple thicknesses
        for thick in [4, 6, 8, 10, 12, 14]:
            canvas = np.zeros((140, 140), dtype=np.uint8)
            cv2.rectangle(canvas, (70 - thick // 2, 25), (70 + thick // 2, 115), 255, -1)
            _, bw = cv2.threshold(canvas, 127, 255, cv2.THRESH_BINARY)
            coords = cv2.findNonZero(bw)
            if coords is not None:
                x, y, w, h = cv2.boundingRect(coords)
                bank["1"].append(self._normalize_digit_crop(bw[y : y + h, x : x + w]))

        # Tambahkan template TrueType gaya rompi atletik (Impact, Arial Bold, Trebuchet, Calibri)
        try:
            from PIL import Image, ImageDraw, ImageFont
            import os
            font_files = ["impact.ttf", "arialbd.ttf", "trebucbd.ttf", "calibrib.ttf"]
            for fn in font_files:
                fpath = os.path.join(r"C:\Windows\Fonts", fn)
                if not os.path.exists(fpath):
                    continue
                for size in [60, 80, 100, 120]:
                    try:
                        font = ImageFont.truetype(fpath, size)
                    except Exception:
                        continue
                    for stroke in [0, 2, 4]:
                        for d in range(10):
                            im = Image.new("L", (160, 160), 0)
                            draw = ImageDraw.Draw(im)
                            draw.text((25, 20), str(d), fill=255, font=font, stroke_width=stroke)
                            arr = np.array(im)
                            coords = cv2.findNonZero(arr)
                            if coords is not None:
                                x, y, w, h = cv2.boundingRect(coords)
                                if w >= 3 and h >= 8:
                                    crop = arr[y : y + h, x : x + w]
                                    bank[str(d)].append(self._normalize_digit_crop(crop))
        except Exception:
            pass

        return bank

    def _get_body_zones(
        self, frame: np.ndarray
    ) -> Tuple[List[Tuple[int, int, int, int]], List[Tuple[int, int, int, int]]]:
        """
        Mendeteksi area anatomi tubuh manusia: torso/dada pelari vs kepala/wajah.
        Menggunakan caching ringan (setiap 2 frame) untuk kecepatan streaming real-time.
        Returns: (torso_rois, face_boxes)
        """
        if self.pose_model is None or frame is None or frame.size == 0:
            return [], []

        self._zone_cache_frame += 1
        if (
            self._zone_cache is not None
            and (self._zone_cache_frame % 2 != 0)
            and len(self._zone_cache[0]) > 0
        ):
            return self._zone_cache

        h_f, w_f = frame.shape[:2]
        try:
            res = self.pose_model(frame, verbose=False, imgsz=320)
        except Exception:
            return self._zone_cache or ([], [])

        torso_rois: List[Tuple[int, int, int, int]] = []
        face_boxes: List[Tuple[int, int, int, int]] = []

        for r in res:
            if len(r.boxes) == 0:
                continue
            for idx in range(len(r.boxes)):
                box = r.boxes[idx].xyxy[0].cpu().numpy()
                kpts = r.keypoints.xy[idx].cpu().numpy() if r.keypoints is not None else None
                confs = (
                    r.keypoints.conf[idx].cpu().numpy()
                    if (r.keypoints is not None and r.keypoints.conf is not None)
                    else None
                )

                bx1, by1, bx2, by2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                bw = max(1, bx2 - bx1)
                bh = max(1, by2 - by1)

                if kpts is not None and confs is not None and confs[5] > 0.25 and confs[6] > 0.25:
                    l_sh = kpts[5]
                    r_sh = kpts[6]
                    min_sh_y = min(l_sh[1], r_sh[1])
                    sh_w = max(30.0, abs(l_sh[0] - r_sh[0]))

                    # Area kepala / wajah pelari (dari atas kepala sampai garis bahu)
                    face_h = max(20, int(min_sh_y - by1 + 10))
                    face_boxes.append((bx1, by1, bw, face_h))

                    # Area dada / torso pelari (dari bahu ke bawah pinggul / perut)
                    if confs[11] > 0.25 and confs[12] > 0.25:
                        max_hip_y = max(kpts[11][1], kpts[12][1])
                    else:
                        max_hip_y = min(float(h_f), min_sh_y + sh_w * 1.45)

                    tx1 = max(0, int(min(l_sh[0], r_sh[0]) - sh_w * 0.28))
                    ty1 = max(0, int(min_sh_y - 12))
                    tx2 = min(w_f, int(max(l_sh[0], r_sh[0]) + sh_w * 0.28))
                    ty2 = min(h_f, int(max_hip_y + 25))
                    torso_rois.append((tx1, ty1, tx2 - tx1, ty2 - ty1))
                else:
                    face_h = int(bh * 0.40)
                    face_boxes.append((bx1, by1, bw, face_h))
                    torso_rois.append((bx1, by1 + face_h - 10, bw, bh - face_h + 10))

        self._zone_cache = (torso_rois, face_boxes)
        return torso_rois, face_boxes

    def _is_bare_skin(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> bool:
        """
        Memeriksa apakah kandidat deteksi berada di area kulit terbuka (pipi, wajah, leher, lengan).
        Jika > 35% piksel di sekitar bbox adalah warna kulit manusia, tolak.
        """
        if frame is None or frame.size == 0:
            return False
        h_f, w_f = frame.shape[:2]
        bx, by, bw, bh = bbox
        margin = max(15, int(min(bw, bh) * 0.5))
        x1 = max(0, bx - margin)
        y1 = max(0, by - margin)
        x2 = min(w_f, bx + bw + margin)
        y2 = min(h_f, by + bh + margin)
        roi = frame[y1:y2, x1:x2]
        if roi.size == 0 or roi.shape[0] < 8 or roi.shape[1] < 8:
            return False

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        h = hsv[:, :, 0]
        s = hsv[:, :, 1]
        v = hsv[:, :, 2]
        b = roi[:, :, 0].astype(int)
        g = roi[:, :, 1].astype(int)
        r = roi[:, :, 2].astype(int)

        skin_mask = (
            ((h <= 25) | (h >= 170))
            & (s >= 25) & (s <= 115)
            & (v >= 45)
            & (r > g) & (g >= b - 5)
        )
        skin_ratio = np.count_nonzero(skin_mask) / float(max(1, roi.shape[0] * roi.shape[1]))
        return skin_ratio > 0.35

    def _normalize_digit_crop(self, crop: np.ndarray) -> np.ndarray:
        """
        Normalize a binary digit crop (255 foreground, 0 background) to (template_w, template_h).
        Preserves narrow aspect ratio for '1'-like thin vertical strokes while stretching standard digits.
        """
        h, w = crop.shape[:2]
        aspect = w / float(max(1, h))
        if aspect < 0.34:
            # Narrow stroke (typical of digit '1'): center horizontally with proportional width
            target_w = max(6, int(round(self.template_h * aspect)))
            target_w = min(self.template_w, target_w)
            resized = cv2.resize(crop, (target_w, self.template_h), interpolation=cv2.INTER_AREA)
            _, resized = cv2.threshold(resized, 100, 255, cv2.THRESH_BINARY)
            canvas = np.zeros((self.template_h, self.template_w), dtype=np.uint8)
            x_off = (self.template_w - target_w) // 2
            canvas[:, x_off : x_off + target_w] = resized
            return canvas
        else:
            resized = cv2.resize(crop, (self.template_w, self.template_h), interpolation=cv2.INTER_AREA)
            _, resized = cv2.threshold(resized, 100, 255, cv2.THRESH_BINARY)
            return resized

    def classify_vest_color(
        self,
        frame: np.ndarray,
        bbox: Tuple[int, int, int, int],
        bib_bbox: Optional[Tuple[int, int, int, int]] = None
    ) -> Tuple[str, str, Tuple[int, int, int]]:
        """
        Mendeteksi warna dominan rompi / kaos pelari di area pakaian sekitar kartu nomor dada.
        Mengecualikan warna kulit manusia agar tidak salah mengklasifikasikan kulit/wajah sebagai rompi.
        Returns: (nama_warna, hex_code, bgr_tuple)
        """
        if frame is None or frame.size == 0:
            return "Netral", "#94A3B8", (148, 163, 184)

        h_f, w_f = frame.shape[:2]

        # Jika bib_bbox diberikan, gunakan sebagai kartu bib; jika tidak, gunakan bbox nomor langsung
        if bib_bbox is not None:
            bx, by, bw, bh = bib_bbox
            margin_x = max(20, int(bw * 0.35))
            margin_y = max(25, int(bh * 0.40))
        else:
            bx, by, bw, bh = bbox
            margin_x = max(20, int(bw * 0.35))
            margin_y = max(25, int(bh * 0.45))

        # Ambil ROI kain rompi / kaos pelari di area sekitar nomor (torso atas/bawah/samping)
        vx1 = max(0, bx - margin_x)
        vy1 = max(0, by - margin_y)
        vx2 = min(w_f, bx + bw + margin_x)
        vy2 = min(h_f, by + bh + int(margin_y * 1.2))

        roi = frame[vy1:vy2, vx1:vx2]
        if roi.size == 0 or roi.shape[0] < 10 or roi.shape[1] < 10:
            return "Netral", "#94A3B8", (148, 163, 184)

        # Buat mask: kecualikan area kartu nomor / cetakan angka di bagian tengah
        mask = np.ones((vy2 - vy1, vx2 - vx1), dtype=np.uint8) * 255
        rbx1 = max(0, bx - vx1)
        rby1 = max(0, by - vy1)
        rbx2 = min(vx2 - vx1, bx + bw - vx1)
        rby2 = min(vy2 - vy1, by + bh - vy1)
        mask[rby1:rby2, rbx1:rbx2] = 0

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        h = hsv[:, :, 0]
        s = hsv[:, :, 1]
        v = hsv[:, :, 2]
        b = roi[:, :, 0].astype(int)
        g = roi[:, :, 1].astype(int)
        r = roi[:, :, 2].astype(int)

        valid = mask > 0
        total_valid = np.count_nonzero(valid)
        if total_valid < 40:
            return "Netral", "#94A3B8", (148, 163, 184)

        # Identifikasi piksel kulit manusia untuk dikecualikan dari warna pakaian
        is_skin = (
            ((h <= 25) | (h >= 170))
            & (s >= 25) & (s <= 115)
            & (v >= 45)
            & (r > g) & (g >= b - 5)
        )
        valid_cloth = valid & (~is_skin)
        cloth_valid_count = np.count_nonzero(valid_cloth)

        # Jika mayoritas area sekeliling adalah kulit telanjang (> 65%), pakaian tidak terdeteksi
        if cloth_valid_count < int(total_valid * 0.20):
            return "Netral", "#94A3B8", (148, 163, 184)

        # Hitung frekuensi piksel warna rompi / kaos asli (warna kain olahraga dengan saturasi kuat)
        counts = {
            "Kuning": np.count_nonzero(valid_cloth & (h >= 20) & (h <= 35) & (s >= 65) & (v >= 70) & (r > 100) & (g > 100) & (b < 140)),
            "Merah": np.count_nonzero(valid_cloth & ((h <= 5) | (h >= 168)) & (s >= 90) & (v >= 50) & (r > g + 25) & (r > b + 25)),
            "Biru": np.count_nonzero(valid_cloth & (h >= 86) & (h <= 130) & (s >= 50) & (v >= 50) & (b > r + 15)),
            "Hijau": np.count_nonzero(valid_cloth & (h >= 36) & (h <= 85) & (s >= 55) & (v >= 50) & (g > b + 10)),
            "Oranye": np.count_nonzero(valid_cloth & (h >= 6) & (h <= 19) & (s >= 80) & (v >= 70) & (r > g + 15) & (g > b)),
            "Ungu": np.count_nonzero(valid_cloth & (h >= 135) & (h <= 167) & (s >= 50) & (v >= 50) & (r > g + 10) & (b > g + 10)),
            "Hitam": np.count_nonzero(valid_cloth & (v < 40)),
            "Putih": np.count_nonzero(valid_cloth & (s < 28) & (v >= 180)),
        }

        best_color = max(counts, key=counts.get)
        max_pixels = counts[best_color]

        if max_pixels < int(total_valid * 0.15):
            return "Netral", "#94A3B8", (148, 163, 184)

        meta = {
            "Kuning": ("#FACC15", (21, 204, 250)),
            "Merah": ("#EF4444", (68, 68, 239)),
            "Biru": ("#3B82F6", (246, 130, 59)),
            "Hijau": ("#22C55E", (94, 197, 34)),
            "Oranye": ("#F97316", (22, 115, 249)),
            "Ungu": ("#A855F7", (247, 85, 168)),
            "Hitam": ("#1E293B", (59, 41, 30)),
            "Putih": ("#F8FAFC", (252, 250, 248)),
        }
        hex_c, bgr_c = meta.get(best_color, ("#94A3B8", (180, 180, 180)))
        return best_color, hex_c, bgr_c

    def _analyze_holes(self, crop: np.ndarray) -> Tuple[int, List[float], List[float], float]:
        """
        Count enclosed background holes inside a binary digit mask.
        Returns: (num_holes, list_of_normalized_hole_cy, list_of_normalized_hole_cx, total_hole_area_ratio)
        """
        norm = cv2.resize(crop, (self.template_w, self.template_h), interpolation=cv2.INTER_NEAREST)
        _, norm = cv2.threshold(norm, 100, 255, cv2.THRESH_BINARY)
        padded = cv2.copyMakeBorder(norm, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=0)

        contours, hierarchy = cv2.findContours(padded, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None or len(contours) == 0:
            return 0, [], [], 0.0

        holes_pts: List[Tuple[float, float]] = []
        total_hole_area = 0.0
        total_area = float(self.template_w * self.template_h)

        # In RETR_CCOMP, hierarchy[0][i][3] != -1 means contour i is an inner hole of an outer component
        for i, cnt in enumerate(contours):
            parent_idx = hierarchy[0][i][3]
            if parent_idx != -1:
                area = cv2.contourArea(cnt)
                if area >= 18.0:  # Ignore tiny 1-2px noise holes
                    M = cv2.moments(cnt)
                    if M["m00"] > 0:
                        cx = (M["m10"] / M["m00"]) - 4.0
                        cy = (M["m01"] / M["m00"]) - 4.0
                        norm_cx = max(0.0, min(1.0, cx / float(self.template_w)))
                        norm_cy = max(0.0, min(1.0, cy / float(self.template_h)))
                        holes_pts.append((norm_cy, norm_cx))
                        total_hole_area += area

        holes_pts.sort(key=lambda p: p[0])
        holes_cy = [p[0] for p in holes_pts]
        holes_cx = [p[1] for p in holes_pts]
        return len(holes_pts), holes_cy, holes_cx, total_hole_area / total_area

    def classify_digit(self, crop: np.ndarray) -> Tuple[str, float]:
        """
        Classify a single binary digit image (white 255 on black 0) into '0'-'9'.
        Uses vectorized NumPy matrix multiplication against unique template bank (~60x faster).
        Returns (digit_str, confidence).
        """
        h, w = crop.shape[:2]
        aspect = w / float(max(1, h))
        norm = self._normalize_digit_crop(crop)
        num_holes, holes_cy, holes_cx, hole_ratio = self._analyze_holes(crop)

        norm_bool = norm > 127
        # Check center region of normalized (48x32) digit: '0' is hollow in center, '8' has waist bar
        center_patch = norm_bool[19:29, 11:21]
        center_fill = float(center_patch.sum()) / float(max(1, center_patch.size))

        crop_flat = norm_bool.astype(np.float32).flatten()
        crop_sum = float(crop_flat.sum())
        inter = np.dot(self.tmpl_matrix, crop_flat)
        union = self.tmpl_sums + crop_sum - inter
        ious = inter / np.maximum(1.0, union)

        best_digit = "0"
        best_score = -1.0

        for d_str in "0123456789":
            max_iou = float(np.max(ious[self.digit_indices[d_str]]))
            score = max_iou

            # Apply topological adjustments based on enclosed holes
            if num_holes >= 2:
                dx = abs(holes_cx[0] - holes_cx[-1])
                dy = abs(holes_cy[-1] - holes_cy[0])
                if dx >= 0.12:
                    # Diagonally offset holes (characteristic of OpenCV Hershey slashed '0')
                    if d_str == "0":
                        score += 0.25
                    elif d_str == "8":
                        score -= 0.15
                    else:
                        score -= 0.20
                else:
                    # Vertically aligned top & bottom holes (characteristic of '8')
                    if d_str == "8" and dy >= 0.22:
                        score += 0.25
                    elif d_str in ["0", "4", "6", "9"]:
                        score -= 0.12
                    else:
                        score -= 0.20
            elif num_holes == 1:
                cy = holes_cy[0]
                if d_str == "0" and 0.30 <= cy <= 0.70:
                    score += 0.22 if center_fill < 0.25 else 0.05
                elif d_str == "8":
                    score -= 0.22 if center_fill < 0.25 else 0.08
                elif d_str == "4" and 0.30 <= cy <= 0.65:
                    score += 0.18
                elif d_str == "6" and cy >= 0.52:
                    score += 0.16
                elif d_str == "9" and cy <= 0.52:
                    score += 0.16
                elif d_str in ["1", "2", "3", "5", "7"]:
                    score -= 0.18
            else:  # num_holes == 0
                if d_str in ["0", "8"]:
                    score -= 0.22
                elif d_str in ["6", "9"]:
                    score -= 0.12

            if score > best_score:
                best_score = score
                best_digit = d_str

        # Stroke consistency verification for digit '1' to prevent false positive shadows/creases
        if best_digit == "1":
            if aspect > 0.45 or num_holes > 0:
                best_score -= 0.25
            else:
                row_widths = [np.count_nonzero(crop[r, :]) for r in range(h) if np.count_nonzero(crop[r, :]) > 0]
                if len(row_widths) >= 6:
                    mean_w = np.mean(row_widths)
                    std_w = np.std(row_widths)
                    if mean_w > 0 and (std_w / mean_w) > 0.45:
                        best_score -= 0.30
                else:
                    best_score -= 0.20

        confidence = max(0.0, min(0.99, best_score))
        return best_digit, round(confidence, 3)

    def _extract_digit_groups_from_binary(
        self,
        binary_inv: np.ndarray,
        offset_x: int = 0,
        offset_y: int = 0,
        min_h: int = 18,
        max_h: int = 320
    ) -> List[Tuple[str, Tuple[int, int, int, int], float]]:
        """
        Find digit contours in an inverted binary image (255 = dark ink),
        group horizontally adjacent digits, and classify them into number strings.
        """
        roi_h, roi_w = binary_inv.shape[:2]
        contours, _ = cv2.findContours(binary_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if h < min_h or h > max_h:
                continue
            if w < 3 or w > int(roi_w * 0.75):
                continue
            # Ignore contours touching the outer 2px border of the ROI
            if x <= 1 or y <= 1 or (x + w) >= (roi_w - 1) or (y + h) >= (roi_h - 1):
                continue

            aspect = w / float(h)
            if aspect < 0.10 or aspect > 1.15:
                continue

            # Standalone single vertical stroke needs minimum dimensions
            if aspect < 0.40 and (h < 16 or w < 3):
                continue

            area = cv2.contourArea(cnt)
            bbox_area = float(w * h)
            if bbox_area <= 0 or (area / bbox_area) < 0.08 or (area / bbox_area) > 0.95:
                continue

            crop = binary_inv[y : y + h, x : x + w]
            digit_str, conf = self.classify_digit(crop)

            # Periksa juga versi terisi jika conf awal < 0.85 (untuk angka cetakan jersey bergaris tepi / outline)
            if conf < 0.85:
                crop_filled = np.zeros_like(crop)
                cnts_sub, _ = cv2.findContours(crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cv2.drawContours(crop_filled, cnts_sub, -1, 255, -1)
                digit_filled, conf_filled = self.classify_digit(crop_filled)
                if conf_filled > conf:
                    digit_str, conf = digit_filled, conf_filled

            if conf >= 0.40:
                candidates.append({
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "cy": y + h / 2.0,
                    "digit": digit_str,
                    "conf": conf,
                })

        if not candidates:
            return []

        # Sort left to right
        candidates.sort(key=lambda c: c["x"])

        # Group horizontally adjacent digit candidates into multi-digit numbers (up to 3 digits)
        used = [False] * len(candidates)
        groups: List[Tuple[str, Tuple[int, int, int, int], float]] = []

        for i in range(len(candidates)):
            if used[i]:
                continue
            curr_group = [candidates[i]]
            used[i] = True

            for j in range(i + 1, len(candidates)):
                if used[j]:
                    continue
                prev = curr_group[-1]
                cand = candidates[j]

                # Check height similarity
                h_ratio = cand["h"] / float(max(1, prev["h"]))
                if h_ratio < 0.62 or h_ratio > 1.60:
                    continue

                # Check vertical alignment
                max_h_pair = max(prev["h"], cand["h"])
                if abs(cand["cy"] - prev["cy"]) > 0.35 * max_h_pair:
                    continue

                # Check horizontal spacing (not overlapping heavily, and not too far apart)
                gap = cand["x"] - (prev["x"] + prev["w"])
                if -0.15 * prev["w"] <= gap <= 1.15 * max_h_pair:
                    curr_group.append(cand)
                    used[j] = True
                    if len(curr_group) >= 3:
                        break

            text = "".join(c["digit"] for c in curr_group)
            avg_conf = sum(c["conf"] for c in curr_group) / len(curr_group)
            gx1 = min(c["x"] for c in curr_group) + offset_x
            gy1 = min(c["y"] for c in curr_group) + offset_y
            gx2 = max(c["x"] + c["w"] for c in curr_group) + offset_x
            gy2 = max(c["y"] + c["h"] for c in curr_group) + offset_y
            groups.append((text, (gx1, gy1, gx2 - gx1, gy2 - gy1), round(avg_conf, 3)))

        return groups

    def detect(
        self,
        frame: np.ndarray,
        registered_participants: Optional[Dict[str, Dict[str, Any]]] = None,
        valid_chest_numbers: Optional[Dict[str, Dict[str, Any]]] = None,
        min_confidence: float = 0.50,
    ) -> List[DetectedChestNumber]:
        """
        Detect chest numbers in a video frame and match them against the wave's registered participants.
        `registered_participants` / `valid_chest_numbers`: mapping of chest_number (e.g. "01") -> participant dict
            {"participant_id": 1, "full_name": "...", "chest_number": "01"}
        """
        if registered_participants is None and valid_chest_numbers is not None:
            registered_participants = valid_chest_numbers

        if frame is None or frame.size == 0:
            return []

        h_frame, w_frame = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame.copy()
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Stage 1: Analisis anatomi tubuh (torso / dada pelari vs kepala/wajah)
        torso_rois, face_boxes = self._get_body_zones(frame)

        raw_groups: List[Tuple[str, Tuple[int, int, int, int], float, Optional[Tuple[int, int, int, int]]]] = []

        # 1. Look for bright rectangular Bib / Number Cards in the frame (HSV white card detection + Grayscale bright mask)
        bib_rois_to_scan = []
        if len(frame.shape) == 3:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            white_bib_mask = ((hsv[:, :, 1] < 75) & (hsv[:, :, 2] > 155)).astype(np.uint8) * 255
            white_cnts, _ = cv2.findContours(white_bib_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for wcnt in white_cnts:
                bx, by, bw, bh = cv2.boundingRect(wcnt)
                if bw >= 40 and bh >= 30 and (bw * bh) >= 1400 and (bw * bh) <= int(w_frame * h_frame * 0.80):
                    bib_rois_to_scan.append((bx, by, bw, bh))

        _, bright_mask = cv2.threshold(blurred, 185, 255, cv2.THRESH_BINARY)
        bib_contours, _ = cv2.findContours(bright_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for bcnt in bib_contours:
            bx, by, bw, bh = cv2.boundingRect(bcnt)
            if bw >= 40 and bh >= 30 and (bw * bh) >= 1400 and (bw * bh) <= int(w_frame * h_frame * 0.80):
                bib_rois_to_scan.append((bx, by, bw, bh))

        # Deduplicate overlapping bib ROIs
        scanned_bibs = []
        for bx, by, bw, bh in bib_rois_to_scan:
            overlap = False
            for sx, sy, sw, sh in scanned_bibs:
                if abs(bx - sx) < 15 and abs(by - sy) < 15 and abs(bw - sw) < 20 and abs(bh - sh) < 20:
                    overlap = True
                    break
            if overlap:
                continue

            # Jika anatomi tubuh terdeteksi, abaikan kartu bib yang berada di area kepala / wajah
            bcx = bx + bw / 2.0
            bcy = by + bh / 2.0
            in_face = any(fx <= bcx <= fx + fw and fy <= bcy <= fy + fh for fx, fy, fw, fh in face_boxes)
            if in_face:
                continue

            scanned_bibs.append((bx, by, bw, bh))

            bib_roi = blurred[by : by + bh, bx : bx + bw]
            _, bib_bin_inv = cv2.threshold(bib_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            extracted = self._extract_digit_groups_from_binary(
                bib_bin_inv,
                offset_x=bx,
                offset_y=by,
                min_h=max(16, int(bh * 0.20)),
                max_h=int(bh * 0.95),
            )
            if not extracted:
                bib_adapt = cv2.adaptiveThreshold(
                    bib_roi, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 7
                )
                extracted = self._extract_digit_groups_from_binary(
                    bib_adapt,
                    offset_x=bx,
                    offset_y=by,
                    min_h=max(16, int(bh * 0.20)),
                    max_h=int(bh * 0.95),
                )
            for t, bb, c in extracted:
                raw_groups.append((t, bb, c, (bx, by, bw, bh)))

        # 2. Scan torso pelari (jika pose terdeteksi) atau zona tengah (fallback jersey tanpa tubuh)
        if torso_rois:
            for tx, ty, tw, th in torso_rois:
                if tw < 30 or th < 30:
                    continue
                troi = blurred[ty : ty + th, tx : tx + tw]
                if troi.size == 0:
                    continue
                _, troi_pos = cv2.threshold(troi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                for t, bb, c in self._extract_digit_groups_from_binary(troi_pos, offset_x=tx, offset_y=ty, min_h=20, max_h=int(th * 0.85)):
                    raw_groups.append((t, bb, c, None))

                _, troi_inv = cv2.threshold(troi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                for t, bb, c in self._extract_digit_groups_from_binary(troi_inv, offset_x=tx, offset_y=ty, min_h=20, max_h=int(th * 0.85)):
                    raw_groups.append((t, bb, c, None))

                # Ekstraksi cetakan nomor gelap (angka hitam) pada rompi berwarna
                troi_dark = (troi < 75).astype(np.uint8) * 255
                for t, bb, c in self._extract_digit_groups_from_binary(troi_dark, offset_x=tx, offset_y=ty, min_h=16, max_h=int(th * 0.85)):
                    raw_groups.append((t, bb, c, None))
        else:
            # Fallback scan central zone jika pelari belum berdiri penuh atau jersey/bib ditunjukkan tanpa tubuh
            zx1 = int(w_frame * 0.05)
            zy1 = int(h_frame * 0.05)
            zx2 = int(w_frame * 0.95)
            zy2 = int(h_frame * 0.95)
            zone_roi = blurred[zy1:zy2, zx1:zx2]
            if zone_roi.size > 0:
                _, zone_otsu_pos = cv2.threshold(zone_roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                for t, bb, c in self._extract_digit_groups_from_binary(zone_otsu_pos, offset_x=zx1, offset_y=zy1, min_h=22, max_h=int((zy2 - zy1) * 0.85)):
                    raw_groups.append((t, bb, c, None))

                _, zone_otsu_inv = cv2.threshold(zone_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                for t, bb, c in self._extract_digit_groups_from_binary(zone_otsu_inv, offset_x=zx1, offset_y=zy1, min_h=22, max_h=int((zy2 - zy1) * 0.85)):
                    raw_groups.append((t, bb, c, None))

                # Ekstraksi cetakan nomor gelap pada rompi berwarna di zona tengah
                zone_dark = (zone_roi < 75).astype(np.uint8) * 255
                for t, bb, c in self._extract_digit_groups_from_binary(zone_dark, offset_x=zx1, offset_y=zy1, min_h=16, max_h=int((zy2 - zy1) * 0.85)):
                    raw_groups.append((t, bb, c, None))

        if not raw_groups:
            return []

        # Kumpulkan daftar seluruh peserta yang terdaftar pada gelombang ini
        runners_list: List[Dict[str, Any]] = []
        source_data = registered_participants if registered_participants is not None else valid_chest_numbers
        if source_data:
            if isinstance(source_data, list):
                runners_list = source_data
            elif isinstance(source_data, dict):
                # Dukung dict of dicts {'cn': {...}} atau dict {'participants': [...]}
                if "participants" in source_data and isinstance(source_data["participants"], list):
                    runners_list = source_data["participants"]
                else:
                    runners_list = []
                    for k, v in source_data.items():
                        item = dict(v) if isinstance(v, dict) else {"participant_id": v}
                        if "chest_number" not in item:
                            item["chest_number"] = str(k)
                        runners_list.append(item)

        # Deduplikasi & pencocokan kandidat nomor dada & warna rompi
        best_by_key: Dict[str, DetectedChestNumber] = {}

        for text, bbox, conf, bib_box in raw_groups:
            if not text or not text.isdigit():
                continue

            bx, by, bw, bh = bbox
            bcx = bx + bw / 2.0
            bcy = by + bh / 2.0

            # 1. Cegah False Positive pada area wajah / kepala pelari
            if face_boxes:
                in_face = any(fx <= bcx <= fx + fw and fy <= bcy <= fy + fh for fx, fy, fw, fh in face_boxes)
                if in_face:
                    continue

            # 2. Cegah False Positive pada kulit terbuka di luar torso (leher/pipi/tangan) jika tubuh terdeteksi
            if torso_rois and bib_box is None:
                in_torso = any(tx <= bcx <= tx + tw and ty <= bcy <= ty + th for tx, ty, tw, th in torso_rois)
                if not in_torso and self._is_bare_skin(frame, bbox):
                    continue
            elif face_boxes and bib_box is None:
                if self._is_bare_skin(frame, bbox):
                    continue

            vest_col, vest_hx, vest_bgr = self.classify_vest_color(frame, bbox, bib_bbox=bib_box)

            matched_chest = None
            matched_pid = None
            matched_name = None
            final_conf = conf

            if runners_list:
                clean_t = text.strip()
                int_t = int(clean_t) if clean_t.isdigit() else None
                v_col = str(vest_col).strip().lower()

                # Cocokkan Nomor Dada DAN Warna Rompi secara bersamaan
                candidates_matched = []
                for p in runners_list:
                    p_cn = str(p.get("chest_number", "")).strip()
                    p_int = int(p_cn) if p_cn.isdigit() else None

                    # 1. Cek kecocokan nomor dada
                    num_match = (p_cn == clean_t) or (int_t is not None and p_int is not None and p_int == int_t)
                    if not num_match:
                        continue

                    # 2. Cek kecocokan warna rompi yang disimpan
                    p_col = str(p.get("vest_color", "Netral")).strip().lower()

                    if p_col != "netral" and v_col != "netral":
                        if p_col == v_col:
                            # Sempurna: Nomor Dada Cocok DAN Warna Rompi Cocok!
                            candidates_matched.append((p, 2.0, 0.15))
                        else:
                            # Nomor dada cocok, tetapi warna rompi yang terdaftar BERBEDA dengan yang terdeteksi di kamera!
                            # Contoh: Peserta terdaftar Rompi Kuning, tapi kamera melihat Rompi Merah.
                            # JANGAN cocokkan ke peserta ini!
                            continue
                    else:
                        # Peserta memiliki rompi Netral (atau kamera Netral)
                        candidates_matched.append((p, 1.0, 0.05))

                if candidates_matched:
                    # Pilih kandidat dengan kecocokan warna + nomor tertinggi
                    candidates_matched.sort(key=lambda c: c[1], reverse=True)
                    best_match, _, bonus = candidates_matched[0]
                    matched_chest = str(best_match.get("chest_number", text))
                    matched_pid = best_match.get("participant_id")
                    matched_name = best_match.get("full_name")
                    final_conf = min(0.99, conf + bonus)
                else:
                    # Tidak ada peserta yang cocok nomor dan warnanya
                    matched_pid = None

            if final_conf < min_confidence:
                continue

            # Jika daftar peserta gelombang disediakan, hanya terima deteksi yang valid terhubung ke peserta
            if runners_list and matched_pid is None:
                continue

            dedup_key = f"p_{matched_pid}" if matched_pid is not None else f"raw_{text}_{vest_col}_{bx // 50}_{by // 50}"
            det = DetectedChestNumber(
                raw_text=text,
                matched_chest_number=matched_chest,
                participant_id=matched_pid,
                participant_name=matched_name,
                bbox=bbox,
                confidence=round(final_conf, 3),
                vest_color=vest_col,
                vest_hex=vest_hx,
                vest_bgr=vest_bgr,
            )

            if dedup_key not in best_by_key or det.confidence > best_by_key[dedup_key].confidence:
                best_by_key[dedup_key] = det

        results = list(best_by_key.values())
        results.sort(key=lambda d: d.confidence, reverse=True)
        return results
