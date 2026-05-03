"""
Face encoding and matching utilities.

face_recognition gives us a 128-dimensional vector per face. We store that
vector in the database as JSON and compare it at payment time using Euclidean
distance. Tolerance of 0.5 is stricter than the default 0.6 — appropriate for
payment authentication where false positives are costly.
"""

import face_recognition
import numpy as np
from PIL import Image
import io
import json

MATCH_TOLERANCE = 0.5  # lower = stricter


def encode_face(image_bytes: bytes) -> list[float]:
    """
    Given raw image bytes (JPEG/PNG from webcam), return the 128-d face encoding.
    Raises ValueError if no face is detected in the image.
    """
    image = face_recognition.load_image_file(io.BytesIO(image_bytes))
    encodings = face_recognition.face_encodings(image)

    if not encodings:
        raise ValueError("No face detected in the image. Please ensure your face is clearly visible.")

    if len(encodings) > 1:
        raise ValueError("Multiple faces detected. Please ensure only one face is in the frame.")

    return encodings[0].tolist()


def match_face(unknown_encoding: list[float], known_encoding_json: str) -> tuple[bool, float]:
    """
    Compare an unknown face encoding against a stored encoding.
    Returns (matched: bool, distance: float).
    Lower distance = better match. Threshold is MATCH_TOLERANCE.
    """
    known = np.array(json.loads(known_encoding_json))
    unknown = np.array(unknown_encoding)

    distance = float(face_recognition.face_distance([known], unknown)[0])
    matched = distance <= MATCH_TOLERANCE

    return matched, distance
