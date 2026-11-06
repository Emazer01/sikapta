from typing import Dict, Any, Optional
from app.services.movement.base import BaseMovementAnalyzer
from app.services.movement.pushup_analyzer import PushUpAnalyzer
from app.services.movement.pullup_analyzer import PullUpAnalyzer
from app.services.movement.situp_analyzer import SitUpAnalyzer
from app.services.movement.shuttlerun_analyzer import ShuttleRunAnalyzer

class MovementAnalyzerFactory:
    @staticmethod
    def create_analyzer(exercise_type: str, config: Optional[Dict[str, Any]] = None) -> BaseMovementAnalyzer:
        exercise_type = exercise_type.lower().strip()
        if exercise_type in ["shuttlerun", "shuttle_run", "shuttle"]:
            return ShuttleRunAnalyzer(config=config)
        elif exercise_type == "pullup":
            return PullUpAnalyzer(config=config)
        elif exercise_type == "situp":
            return SitUpAnalyzer(config=config)
        else:  # default pushup
            return PushUpAnalyzer(config=config)

