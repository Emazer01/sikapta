import pytest
from app.services.movement.geometry import calculate_angle, calculate_distance, MovingAverageFilter

def test_calculate_angle_right_angle():
    # Vertex at (0, 0), points at (0, 1) and (1, 0) -> 90 degrees
    a = (0.0, 1.0)
    b = (0.0, 0.0)
    c = (1.0, 0.0)
    angle = calculate_angle(a, b, c)
    assert abs(angle - 90.0) < 0.1

def test_calculate_angle_straight_line():
    # Vertex at (1, 0), points at (0, 0) and (2, 0) -> 180 degrees
    a = (0.0, 0.0)
    b = (1.0, 0.0)
    c = (2.0, 0.0)
    angle = calculate_angle(a, b, c)
    assert abs(angle - 180.0) < 0.1

def test_calculate_angle_collinear_same_direction():
    # Coincident vectors
    a = (1.0, 1.0)
    b = (0.0, 0.0)
    c = (2.0, 2.0)
    angle = calculate_angle(a, b, c)
    assert abs(angle - 0.0) < 0.1

def test_moving_average_filter():
    f = MovingAverageFilter(window_size=3)
    assert f.filter(100.0) == 100.0
    assert f.filter(110.0) == 105.0
    assert f.filter(120.0) == 110.0
    # Next push evicts 100.0 -> average of (110, 120, 130) = 120.0
    assert f.filter(130.0) == 120.0

