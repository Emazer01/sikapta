import math
from typing import Tuple, List, Optional
from collections import deque

def calculate_angle(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> float:
    """
    Calculate the interior 2D angle (in degrees) at vertex b between vectors ba and bc.
    a: (x, y)
    b: (x, y) - vertex
    c: (x, y)
    """
    ba_x = a[0] - b[0]
    ba_y = a[1] - b[1]
    bc_x = c[0] - b[0]
    bc_y = c[1] - b[1]

    dot_product = ba_x * bc_x + ba_y * bc_y
    mag_ba = math.hypot(ba_x, ba_y)
    mag_bc = math.hypot(bc_x, bc_y)

    if mag_ba * mag_bc == 0:
        return 0.0

    cosine_angle = dot_product / (mag_ba * mag_bc)
    # Clamp cosine_angle to [-1.0, 1.0] to prevent floating point domain errors
    cosine_angle = max(-1.0, min(1.0, cosine_angle))

    angle = math.degrees(math.acos(cosine_angle))
    return round(angle, 2)

def calculate_distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])

class MovingAverageFilter:
    """Outlier-resistant filter combining trimmed mean and moving average for robust joint angle smoothing."""
    def __init__(self, window_size: int = 5):
        self.window_size = max(1, window_size)
        self.history: deque = deque(maxlen=self.window_size)

    def filter(self, value: float) -> float:
        self.history.append(value)
        if self.window_size <= 1 or len(self.history) == 1:
            return round(value, 2)

        # Outlier rejection using trimmed mean for 3 or more samples
        vals = sorted(self.history)
        if len(vals) >= 4:
            trimmed = vals[1:-1]
            return round(sum(trimmed) / len(trimmed), 2)
        return round(sum(vals) / len(vals), 2)

    def reset(self):
        self.history.clear()

    @property
    def value(self) -> Optional[float]:
        if not self.history:
            return None
        if self.window_size <= 1 or len(self.history) == 1:
            return round(self.history[-1], 2)
        vals = sorted(self.history)
        if len(vals) >= 4:
            trimmed = vals[1:-1]
            return round(sum(trimmed) / len(trimmed), 2)
        return round(sum(vals) / len(vals), 2)

