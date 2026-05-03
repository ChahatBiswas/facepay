"""
JWT authentication helpers.
Tokens are HS256-signed, expire in 30 minutes, and carry user_id + upi_id claims.
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

SECRET_KEY = os.environ.get("FACEPAY_JWT_SECRET", "jwt-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_TTL_MINUTES = 30

_bearer = HTTPBearer(auto_error=False)


def create_token(user_id: str, upi_id: str) -> str:
    payload = {
        "sub": user_id,
        "upi": upi_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return {"user_id": payload["sub"], "upi_id": payload["upi"]}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalid or expired.")
