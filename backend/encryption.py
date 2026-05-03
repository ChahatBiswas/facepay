"""
Face encoding encryption at rest using Fernet symmetric AES-128-CBC + HMAC.
Key is derived from an env var FACEPAY_SECRET (falls back to a dev default).
"""

import base64
import json
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

_SALT = b"facepay_static_salt_v1"  # in prod, store this in a secrets manager

def _derive_key() -> bytes:
    secret = os.environ.get("FACEPAY_SECRET", "dev-secret-change-in-production").encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=_SALT, iterations=390_000)
    return base64.urlsafe_b64encode(kdf.derive(secret))

_fernet = Fernet(_derive_key())


def encrypt_encoding(encoding: list[float]) -> str:
    """Serialize face encoding list → encrypt → return base64 ciphertext string."""
    plaintext = json.dumps(encoding).encode()
    return _fernet.encrypt(plaintext).decode()


def decrypt_encoding(ciphertext: str) -> list[float]:
    """Decrypt stored ciphertext → return face encoding as list[float]."""
    plaintext = _fernet.decrypt(ciphertext.encode())
    return json.loads(plaintext)
