"""
Liveness detection via Eye Aspect Ratio (EAR) across multiple frames.

EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
where p1..p6 are the 6 dlib eye landmark points (left or right eye).

A single blink registers when EAR drops below BLINK_THRESH in one frame
then rises back above it. We require at least MIN_BLINKS detected across
the submitted frames to pass liveness.
"""

import io
from typing import Optional

import face_recognition
import numpy as np
from PIL import Image

BLINK_THRESH = 0.22   # EAR below this → eye closed
CONSEC_FRAMES = 1     # consecutive closed frames to count as blink
MIN_BLINKS = 1        # frames required to pass liveness

# dlib 68-point landmark indices for left/right eyes
_LEFT_EYE  = list(range(36, 42))
_RIGHT_EYE = list(range(42, 48))


def _ear(eye_pts: np.ndarray) -> float:
    v1 = np.linalg.norm(eye_pts[1] - eye_pts[5])
    v2 = np.linalg.norm(eye_pts[2] - eye_pts[4])
    h  = np.linalg.norm(eye_pts[0] - eye_pts[3])
    return (v1 + v2) / (2.0 * h + 1e-6)


def _landmarks_for_frame(image_bytes: bytes) -> Optional[np.ndarray]:
    """Return (68, 2) landmark array or None if no face found."""
    img = face_recognition.load_image_file(io.BytesIO(image_bytes))
    landmarks_list = face_recognition.face_landmarks(img, model="large")
    if not landmarks_list:
        return None
    lm = landmarks_list[0]
    pts = np.array(lm["left_eye"] + lm["right_eye"] +
                   lm.get("top_lip", []) + lm.get("bottom_lip", []) +
                   lm.get("nose_bridge", []) + lm.get("nose_tip", []))
    left  = np.array(lm["left_eye"])
    right = np.array(lm["right_eye"])
    return left, right


def analyse_frames(frames_bytes: list[bytes]) -> dict:
    """
    Analyse a sequence of JPEG frames for liveness.

    Returns:
        {
          "live": bool,
          "blinks": int,
          "frames_processed": int,
          "reason": str
        }
    """
    blink_count = 0
    eye_closed_streak = 0
    frames_with_face = 0
    prev_ear: Optional[float] = None

    for raw in frames_bytes:
        result = _landmarks_for_frame(raw)
        if result is None:
            continue
        left_pts, right_pts = result
        frames_with_face += 1

        ear = (_ear(left_pts) + _ear(right_pts)) / 2.0

        if ear < BLINK_THRESH:
            eye_closed_streak += 1
        else:
            if eye_closed_streak >= CONSEC_FRAMES:
                blink_count += 1
            eye_closed_streak = 0

        prev_ear = ear

    if frames_with_face == 0:
        return {"live": False, "blinks": 0, "frames_processed": 0, "reason": "No face detected in any frame."}

    live = blink_count >= MIN_BLINKS
    reason = "Liveness confirmed." if live else f"Please blink clearly. Detected {blink_count} blink(s), need {MIN_BLINKS}."

    return {
        "live": live,
        "blinks": blink_count,
        "frames_processed": frames_with_face,
        "reason": reason,
    }
