"""
FacePay — Face Recognition Payment API
---------------------------------------
POST /api/otp/send          Simulate OTP to phone (Twilio-ready)
POST /api/otp/verify        Verify OTP + issue short-lived token
GET  /api/ifsc/{code}       Look up bank name from IFSC code
POST /api/kyc/aadhaar       Simulated Aadhaar eKYC verification
POST /api/bank/pennydrop    Simulate ₹1 penny-drop bank verification
POST /api/auth/login        UPI ID + PIN → JWT access token
POST /api/liveness          Multi-frame blink detection
POST /api/register          Full registration (face + bank + UPI)
POST /api/pay               Face-authenticate and pay (JWT required)
GET  /api/users             List all users
DELETE /api/users/{id}      Remove a user
GET  /api/transactions      Payment history
GET  /api/stats             Dashboard numbers
"""

import hashlib
import json
import os
import random
import string
import uuid
from datetime import datetime

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from auth import create_token, verify_token
from database import get_connection, init_db
from encryption import decrypt_encoding, encrypt_encoding
from face_utils import encode_face, match_face
from liveness import analyse_frames

app = FastAPI(title="FacePay API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FACES_DIR = os.path.join(os.path.dirname(__file__), "data", "faces")
os.makedirs(FACES_DIR, exist_ok=True)

# In-memory OTP store: { phone: otp_code }
# Production: replace with Redis + TTL.
_otp_store: dict[str, str] = {}

# Simulated Aadhaar registry for demo — in production this calls UIDAI API.
_aadhaar_registry: dict[str, dict] = {}

# Known IFSC codes for the demo.
IFSC_DB = {
    "SBIN": "State Bank of India",
    "HDFC": "HDFC Bank",
    "ICIC": "ICICI Bank",
    "UTIB": "Axis Bank",
    "KKBK": "Kotak Mahindra Bank",
    "PUNB": "Punjab National Bank",
    "BARB": "Bank of Baroda",
    "UBIN": "Union Bank of India",
    "CNRB": "Canara Bank",
    "IOBA": "Indian Overseas Bank",
    "FDRL": "Federal Bank",
    "YESB": "Yes Bank",
    "IDFC": "IDFC First Bank",
    "FINO": "Fino Payments Bank",
    "AIRP": "Airtel Payments Bank",
}


@app.on_event("startup")
def startup():
    init_db()


# ---------------------------------------------------------------------------
# OTP  (Twilio-ready stub)
# ---------------------------------------------------------------------------

@app.post("/api/otp/send")
def send_otp(payload: dict):
    """
    Generate a 6-digit OTP.
    Returns OTP in response body for demo/testing purposes only.
    In production: swap the return value for a Twilio SMS call and omit 'otp' from response.

    Production swap:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(body=f"Your FacePay OTP is {otp}", from_=TWILIO_FROM, to=f"+91{phone}")
    """
    phone = payload.get("phone", "").strip()
    if not phone or len(phone) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit phone number.")

    otp = "".join(random.choices(string.digits, k=6))
    _otp_store[phone] = otp

    # ----- Twilio integration point -----
    # Uncomment below and remove 'otp' from return to go live.
    # _send_sms(phone, otp)
    # ------------------------------------

    return {"success": True, "otp": otp, "message": f"OTP sent to +91-{phone}"}


@app.post("/api/otp/verify")
def verify_otp(payload: dict):
    phone = payload.get("phone", "").strip()
    otp = payload.get("otp", "").strip()
    stored = _otp_store.get(phone)

    if not stored or stored != otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    del _otp_store[phone]
    return {"success": True, "message": "Phone verified successfully."}


# ---------------------------------------------------------------------------
# IFSC lookup
# ---------------------------------------------------------------------------

@app.get("/api/ifsc/{code}")
def lookup_ifsc(code: str):
    code = code.upper().strip()
    if len(code) != 11:
        raise HTTPException(status_code=400, detail="IFSC code must be 11 characters.")

    bank_prefix = code[:4]
    bank_name = IFSC_DB.get(bank_prefix)
    if not bank_name:
        raise HTTPException(status_code=404, detail="Bank not found for this IFSC. Try SBIN0001234, HDFC0001234, etc.")

    return {"ifsc": code, "bank": bank_name, "branch": f"Branch {code[5:]}", "valid": True}


# ---------------------------------------------------------------------------
# Aadhaar eKYC simulation
# ---------------------------------------------------------------------------

@app.post("/api/kyc/aadhaar")
def verify_aadhaar(payload: dict):
    """
    Simulate Aadhaar OTP-based eKYC via UIDAI sandbox.
    In production: call https://developer.uidai.gov.in/ with the resident's Aadhaar number.

    This simulation:
    - Accepts any 12-digit Aadhaar number
    - Returns a masked Aadhaar (XXXX-XXXX-1234) with name + DOB from payload
    - Sets kyc_verified flag that gets stored during registration
    """
    aadhaar = payload.get("aadhaar_number", "").replace(" ", "").replace("-", "")
    name = payload.get("name", "").strip()
    dob = payload.get("dob", "").strip()

    if not aadhaar or len(aadhaar) != 12 or not aadhaar.isdigit():
        raise HTTPException(status_code=400, detail="Aadhaar number must be exactly 12 digits.")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required for eKYC.")

    masked = f"XXXX-XXXX-{aadhaar[-4:]}"
    ref_id = str(uuid.uuid4())[:8].upper()

    # Cache for downstream registration step
    _aadhaar_registry[aadhaar] = {"name": name, "dob": dob, "verified": True, "ref_id": ref_id}

    return {
        "success": True,
        "masked_aadhaar": masked,
        "name": name,
        "dob": dob,
        "ref_id": ref_id,
        "message": "eKYC verified successfully via UIDAI sandbox.",
    }


# ---------------------------------------------------------------------------
# Penny-drop bank account verification
# ---------------------------------------------------------------------------

@app.post("/api/bank/pennydrop")
def penny_drop(payload: dict):
    """
    Simulate penny-drop verification (₹1 micro-credit to confirm account is active).
    Real-world: integrate with Razorpay Route, PayU, or NPCI's penny-drop API.

    This simulation:
    - Accepts any account number (8-18 digits) + valid IFSC
    - Returns a fake UTR reference number confirming credit
    - In production the credited ₹1 is recovered via debit or written off as verification cost
    """
    account = payload.get("account_number", "").strip()
    ifsc = payload.get("ifsc_code", "").upper().strip()

    if not account or not (8 <= len(account) <= 18) or not account.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid bank account number (8–18 digits).")
    if len(ifsc) != 11:
        raise HTTPException(status_code=400, detail="IFSC code must be 11 characters.")

    bank_prefix = ifsc[:4]
    if bank_prefix not in IFSC_DB:
        raise HTTPException(status_code=400, detail="Unrecognised IFSC code.")

    utr = "UTR" + "".join(random.choices(string.digits, k=12))
    masked_account = f"XXXX{account[-4:]}"

    return {
        "success": True,
        "utr": utr,
        "account": masked_account,
        "ifsc": ifsc,
        "bank": IFSC_DB[bank_prefix],
        "amount_credited": 1.00,
        "message": f"₹1.00 credited to {masked_account}. Account verified.",
    }


# ---------------------------------------------------------------------------
# JWT login  (UPI ID + PIN → access token)
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
def login(payload: dict):
    upi_id = payload.get("upi_id", "").strip()
    upi_pin = payload.get("upi_pin", "").strip()

    if not upi_id or not upi_pin:
        raise HTTPException(status_code=400, detail="UPI ID and PIN are required.")

    pin_hash = hashlib.sha256(upi_pin.encode()).hexdigest()

    conn = get_connection()
    user = conn.execute(
        "SELECT id, name, upi_id, upi_pin_hash FROM users WHERE upi_id = ?", (upi_id,)
    ).fetchone()
    conn.close()

    if not user or user["upi_pin_hash"] != pin_hash:
        raise HTTPException(status_code=401, detail="Invalid UPI ID or PIN.")

    token = create_token(user["id"], user["upi_id"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "upi_id": user["upi_id"]},
    }


# ---------------------------------------------------------------------------
# Liveness detection
# ---------------------------------------------------------------------------

@app.post("/api/liveness")
async def check_liveness(frames: list[UploadFile] = File(...)):
    """
    Accept 4–8 JPEG frames captured at ~5 fps.
    Analyses EAR (Eye Aspect Ratio) across frames to detect at least one blink.
    Returns live=True/False with blink count and reason.
    """
    if not frames or len(frames) < 2:
        raise HTTPException(status_code=400, detail="Send at least 2 frames for liveness analysis.")

    raw_frames = [await f.read() for f in frames]
    result = analyse_frames(raw_frames)

    if not result["live"]:
        raise HTTPException(status_code=422, detail=result["reason"])

    return result


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@app.post("/api/register")
async def register_user(
    name: str = Form(...),
    phone: str = Form(...),
    upi_id: str = Form(...),
    upi_pin: str = Form(...),
    bank_account: str = Form(...),
    ifsc_code: str = Form(...),
    bank_name: str = Form(...),
    face_image: UploadFile = File(...),
):
    image_bytes = await face_image.read()

    try:
        encoding = encode_face(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    conn = get_connection()
    if conn.execute("SELECT id FROM users WHERE upi_id = ?", (upi_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="UPI ID already registered.")
    if conn.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Phone number already registered.")

    user_id = str(uuid.uuid4())
    face_filename = f"{user_id}.jpg"
    with open(os.path.join(FACES_DIR, face_filename), "wb") as f:
        f.write(image_bytes)

    pin_hash = hashlib.sha256(upi_pin.encode()).hexdigest()

    # Encrypt face encoding before persisting — never store raw biometric vectors
    encrypted_encoding = encrypt_encoding(encoding)

    conn.execute(
        """INSERT INTO users
           (id, name, phone, upi_id, upi_pin_hash, bank_account, ifsc_code,
            bank_name, face_path, face_encoding, balance, kyc_verified, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user_id, name, phone, upi_id, pin_hash,
         bank_account, ifsc_code.upper(), bank_name,
         face_filename, encrypted_encoding,
         10000.0, 1, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Welcome, {name}! Your FacePay account is ready.",
        "user": {"id": user_id, "name": name, "upi_id": upi_id, "bank_name": bank_name, "balance": 10000.0},
    }


# ---------------------------------------------------------------------------
# Pay  (JWT-protected)
# ---------------------------------------------------------------------------

@app.post("/api/pay")
async def process_payment(
    amount: float = Form(...),
    note: str = Form(""),
    face_image: UploadFile = File(...),
    _token: dict = Depends(verify_token),
):
    """
    JWT-protected payment endpoint.
    1. Verifies the Bearer token issued by /api/auth/login
    2. Encodes the submitted face
    3. Matches against all registered users (using encrypted-then-decrypted encodings)
    4. Deducts balance and logs the transaction
    """
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than ₹0.")

    image_bytes = await face_image.read()
    try:
        unknown_encoding = encode_face(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    conn = get_connection()
    users = conn.execute(
        "SELECT id, name, upi_id, face_encoding, balance, bank_name FROM users"
    ).fetchall()

    best_match = None
    best_distance = 1.0
    for user in users:
        try:
            known_encoding = decrypt_encoding(user["face_encoding"])
        except Exception:
            # Legacy row stored as plain JSON — fall back gracefully
            known_encoding = json.loads(user["face_encoding"])

        matched, distance = match_face(unknown_encoding, json.dumps(known_encoding))
        if matched and distance < best_distance:
            best_distance = distance
            best_match = user

    txn_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    if not best_match:
        conn.execute(
            "INSERT INTO transactions VALUES (?,?,?,?,?,?,?)",
            (txn_id, "unknown", "Unknown", amount, "failed", "Face not recognised", now),
        )
        conn.commit()
        conn.close()
        raise HTTPException(status_code=401, detail="Face not recognised. Try again with better lighting.")

    if best_match["balance"] < amount:
        conn.close()
        raise HTTPException(status_code=402, detail=f"Insufficient balance. Available: ₹{best_match['balance']:.2f}")

    new_balance = best_match["balance"] - amount
    conn.execute("UPDATE users SET balance = ? WHERE id = ?", (new_balance, best_match["id"]))
    conn.execute(
        "INSERT INTO transactions VALUES (?,?,?,?,?,?,?)",
        (txn_id, best_match["id"], best_match["name"], amount, "success", note, now),
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "transaction_id": txn_id,
        "user": {"name": best_match["name"], "upi_id": best_match["upi_id"], "bank_name": best_match["bank_name"]},
        "amount": amount,
        "new_balance": new_balance,
        "confidence": round((1 - best_distance) * 100, 1),
        "message": f"₹{amount:.2f} paid by {best_match['name']}",
    }


# ---------------------------------------------------------------------------
# Users / Transactions / Stats
# ---------------------------------------------------------------------------

@app.get("/api/users")
def list_users():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name, phone, upi_id, bank_name, ifsc_code, balance, kyc_verified, created_at FROM users ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str):
    conn = get_connection()
    user = conn.execute("SELECT face_path FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
    face_path = os.path.join(FACES_DIR, user["face_path"])
    if os.path.exists(face_path):
        os.remove(face_path)
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.get("/api/transactions")
def list_transactions():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 50").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/stats")
def get_stats():
    conn = get_connection()
    total_users  = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    total_txns   = conn.execute("SELECT COUNT(*) FROM transactions WHERE status='success'").fetchone()[0]
    total_volume = conn.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status='success'").fetchone()[0]
    failed_txns  = conn.execute("SELECT COUNT(*) FROM transactions WHERE status='failed'").fetchone()[0]
    conn.close()
    return {
        "total_users": total_users,
        "total_transactions": total_txns,
        "total_volume": round(total_volume, 2),
        "failed_attempts": failed_txns,
    }
