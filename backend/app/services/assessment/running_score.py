"""
Modul Penilaian Lari 12 Menit (Tes Kesamaptaan Jasmani A).
Standar Penilaian Jasmani Militer / Polri / Kedinasan Republik Indonesia.
Mendukung interpolasi linier berdasarkan tabel resmi standar jarak lari 12 menit.
"""
from typing import Dict, Any, List, Tuple

# Tabel Standar Nilai Lari 12 Menit Pria (Jarak dalam meter -> Nilai 0-100)
MALE_RUN_TABLE: List[Tuple[float, float]] = [
    (3444.0, 100.0),
    (3380.0, 97.0),
    (3300.0, 93.0),
    (3200.0, 88.0),
    (3100.0, 84.0),
    (3000.0, 80.0),
    (2900.0, 76.0),
    (2800.0, 72.0),
    (2700.0, 68.0),
    (2600.0, 64.0),
    (2500.0, 60.0),
    (2400.0, 56.0),
    (2300.0, 52.0),
    (2200.0, 48.0),
    (2100.0, 44.0),
    (2000.0, 40.0),
    (1900.0, 36.0),
    (1800.0, 31.0),
    (1700.0, 26.0),
    (1600.0, 21.0),
    (1500.0, 16.0),
    (1400.0, 11.0),
    (1300.0, 6.0),
    (1200.0, 1.0),
    (0.0, 0.0),
]

# Tabel Standar Nilai Lari 12 Menit Wanita (Jarak dalam meter -> Nilai 0-100)
FEMALE_RUN_TABLE: List[Tuple[float, float]] = [
    (3095.0, 100.0),
    (3000.0, 96.0),
    (2900.0, 92.0),
    (2800.0, 88.0),
    (2700.0, 84.0),
    (2600.0, 80.0),
    (2500.0, 75.0),
    (2400.0, 70.0),
    (2300.0, 65.0),
    (2200.0, 60.0),
    (2100.0, 55.0),
    (2000.0, 50.0),
    (1900.0, 45.0),
    (1800.0, 40.0),
    (1700.0, 35.0),
    (1600.0, 30.0),
    (1500.0, 25.0),
    (1400.0, 20.0),
    (1300.0, 15.0),
    (1200.0, 10.0),
    (1100.0, 5.0),
    (1000.0, 1.0),
    (0.0, 0.0),
]

# Tabel Standar Nilai Shuttle Run 6 x 10 Meter (Angka 8) Pria (Waktu dalam detik -> Nilai 0-100)
MALE_SHUTTLERUN_TABLE: List[Tuple[float, float]] = [
    (16.2, 100.0),
    (16.5, 97.0),
    (17.0, 92.0),
    (17.5, 87.0),
    (18.0, 82.0),
    (18.5, 77.0),
    (19.0, 72.0),
    (19.5, 67.0),
    (20.0, 62.0),
    (20.5, 57.0),
    (21.0, 52.0),
    (21.5, 47.0),
    (22.0, 42.0),
    (22.5, 37.0),
    (23.0, 32.0),
    (23.5, 27.0),
    (24.0, 21.0),
    (24.5, 15.0),
    (25.0, 8.0),
    (25.5, 1.0),
    (26.0, 0.0),
]

# Tabel Standar Nilai Shuttle Run 6 x 10 Meter (Angka 8) Wanita (Waktu dalam detik -> Nilai 0-100)
FEMALE_SHUTTLERUN_TABLE: List[Tuple[float, float]] = [
    (17.6, 100.0),
    (18.0, 96.0),
    (18.5, 91.0),
    (19.0, 86.0),
    (19.5, 81.0),
    (20.0, 76.0),
    (20.5, 71.0),
    (21.0, 66.0),
    (21.5, 61.0),
    (22.0, 56.0),
    (22.5, 51.0),
    (23.0, 46.0),
    (23.5, 41.0),
    (24.0, 36.0),
    (24.5, 31.0),
    (25.0, 25.0),
    (25.5, 19.0),
    (26.0, 12.0),
    (26.5, 5.0),
    (27.0, 1.0),
    (27.5, 0.0),
]

def calculate_shuttlerun_score(time_seconds: float, gender: str = "L") -> float:
    """
    Hitung nilai skor Shuttle Run 6 x 10 meter (angka 8) skala 0 - 100 berdasarkan waktu tempuh (detik).
    Semakin cepat waktu tempuh, semakin tinggi nilainya.
    """
    if time_seconds <= 0:
        return 0.0

    is_female = str(gender).upper() in ["P", "FEMALE", "WANITA", "PEREMPUAN"]
    table = FEMALE_SHUTTLERUN_TABLE if is_female else MALE_SHUTTLERUN_TABLE

    best_time, best_score = table[0]
    worst_time, worst_score = table[-1]

    if time_seconds <= best_time:
        return 100.0
    if time_seconds >= worst_time:
        return 0.0

    # Cari interval interpolasi linier
    for i in range(len(table) - 1):
        t1, s1 = table[i]
        t2, s2 = table[i + 1]

        if t1 <= time_seconds <= t2:
            time_range = t2 - t1
            if time_range == 0:
                return float(s1)
            fraction = (time_seconds - t1) / time_range
            score = s1 + fraction * (s2 - s1)
            return round(min(100.0, max(0.0, score)), 1)

    return 0.0

def calculate_run_distance(laps: int, track_length_meters: float = 400.0, extra_meters: float = 0.0) -> float:
    """Hitung total jarak lari (putaran * panjang lintasan + lebihan meter)."""
    return round(max(0.0, (float(laps) * float(track_length_meters)) + float(extra_meters)), 2)

def calculate_run_score(distance_meters: float, gender: str = "L") -> float:
    """
    Hitung nilai skor lari 12 menit (0 - 100) berdasarkan jenis kelamin dan jarak tempuh.
    Menggunakan interpolasi linier antara titik tabel standar.
    """
    if distance_meters <= 0:
        return 0.0

    table = FEMALE_RUN_TABLE if str(gender).upper() in ["P", "FEMALE", "WANITA"] else MALE_RUN_TABLE

    # Jika melebihi atau sama dengan batas maksimal untuk nilai 100
    if distance_meters >= table[0][0]:
        return 100.0

    # Cari interval interpolasi
    for i in range(len(table) - 1):
        upper_dist, upper_score = table[i]
        lower_dist, lower_score = table[i + 1]

        if lower_dist <= distance_meters <= upper_dist:
            dist_range = upper_dist - lower_dist
            if dist_range == 0:
                return float(upper_score)
            fraction = (distance_meters - lower_dist) / dist_range
            score = lower_score + fraction * (upper_score - lower_score)
            return round(min(100.0, max(0.0, score)), 1)

    return 0.0

def evaluate_run_category(score: float) -> str:
    """Kategori predikat nilai lari."""
    if score >= 81.0:
        return "SANGAT BAIK (BS)"
    elif score >= 65.0:
        return "BAIK (B)"
    elif score >= 51.0:
        return "CUKUP (C)"
    elif score >= 41.0:
        return "KURANG (K)"
    else:
        return "KURANG SEKALI (KS)"

def calculate_calisthenics_score(exercise_type: str, reps: float, gender: str = "L") -> float:
    """Hitung nilai skor gerak Samapta B (Pullup, Pushup, Situp, Shuttle Run) skala 0 - 100."""
    if reps <= 0:
        return 0.0

    is_female = str(gender).upper() in ["P", "FEMALE", "WANITA"]
    ex = exercise_type.lower()

    if "shuttle" in ex:
        # Jika nilai adalah waktu dalam detik (misal 16.5)
        return calculate_shuttlerun_score(time_seconds=float(reps), gender=gender)

    if "pull" in ex or "chin" in ex:
        max_reps = 60 if is_female else 18
    elif "push" in ex:
        max_reps = 38 if is_female else 43
    elif "sit" in ex:
        max_reps = 40 if is_female else 43
    else:
        max_reps = 40

    if reps >= max_reps:
        return 100.0

    # Skala proporsional berbobot
    score = (float(reps) / float(max_reps)) * 100.0
    return round(min(100.0, max(0.0, score)), 1)

def evaluate_total_samapta(score_a: float, scores_b: List[float]) -> Tuple[float, str]:
    """Hitung nilai akhir kesamaptaan: (Skor A + Avg Skor B) / 2."""
    valid_b = [s for s in scores_b if s is not None and s > 0]
    avg_b = sum(valid_b) / len(valid_b) if valid_b else 0.0

    if score_a > 0 and valid_b:
        final_score = round((score_a + avg_b) / 2.0, 1)
    elif score_a > 0:
        final_score = round(score_a, 1)
    elif valid_b:
        final_score = round(avg_b, 1)
    else:
        final_score = 0.0

    predicate = evaluate_run_category(final_score)
    return final_score, predicate

