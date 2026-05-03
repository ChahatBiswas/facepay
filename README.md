# ◉ FacePay — Face Recognition Payment System

A production-grade biometric payment system where users pay by looking at a camera. No card, no phone unlock, no PIN entry at the point of sale.

## Demo

**Registration** — 6-step KYC wizard:
`Personal → Aadhaar eKYC → OTP → Bank (IFSC + penny-drop) → UPI → Face enrolment`

**Payment** — 4-step authenticated flow:
`Amount → UPI PIN login (JWT) → Liveness blink detection → Face match`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 · FastAPI · Uvicorn |
| Computer Vision | face_recognition (dlib ResNet-34) |
| Biometric Security | Fernet AES-128-CBC + HMAC-SHA256 |
| Authentication | JWT HS256 (python-jose) · PBKDF2 key derivation |
| Liveness Detection | Eye Aspect Ratio (EAR) across multi-frame sequence |
| Database | SQLite (via stdlib sqlite3) |
| Frontend | React 18 · TypeScript · react-webcam |
| Styling | Glassmorphism dark UI · CSS custom properties |

## Security Features

- **Face encodings encrypted at rest** — Fernet (AES-128) with PBKDF2-derived key
- **JWT-protected payment API** — 30-min Bearer tokens, HS256 signed
- **Liveness detection** — EAR blink analysis prevents photo/video replay attacks
- **UPI PIN hashed** — SHA-256, never stored in plaintext
- **Parameterised SQL queries** — no SQL injection surface
- **Audit trail** — failed payment attempts logged with timestamp

## Production Integration Points

| Feature | Demo | Production |
|---------|------|-----------|
| SMS OTP | Shown on screen | Twilio SMS gateway |
| Aadhaar eKYC | Simulation | UIDAI Authentication API |
| Bank verification | Penny-drop stub | Razorpay Route / NPCI IMPS |
| OTP store | In-memory dict | Redis with TTL=300s |
| Database | SQLite | PostgreSQL + asyncpg |
| PIN hashing | SHA-256 | Argon2id |

## Running Locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start
```

App runs at `http://localhost:3000` · API at `http://localhost:8000`

### API Docs

FastAPI auto-generates interactive docs at `http://localhost:8000/docs`

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/otp/send` | — | Generate OTP for phone |
| POST | `/api/otp/verify` | — | Verify OTP |
| GET | `/api/ifsc/{code}` | — | IFSC → bank name |
| POST | `/api/kyc/aadhaar` | — | Aadhaar eKYC simulation |
| POST | `/api/bank/pennydrop` | — | Bank account verification |
| POST | `/api/auth/login` | — | UPI ID + PIN → JWT |
| POST | `/api/liveness` | — | Multi-frame blink detection |
| POST | `/api/register` | — | Full registration |
| POST | `/api/pay` | JWT | Face-authenticate and pay |
| GET | `/api/users` | — | List all users |
| DELETE | `/api/users/{id}` | — | Delete user |
| GET | `/api/transactions` | — | Payment history |
| GET | `/api/stats` | — | Dashboard stats |

## Environment Variables

```env
FACEPAY_SECRET=your-strong-secret-for-fernet-key-derivation
FACEPAY_JWT_SECRET=your-jwt-signing-secret
```

## Project Structure

```
facepay/
├── backend/
│   ├── main.py          # All API routes
│   ├── database.py      # SQLite schema + connection factory
│   ├── face_utils.py    # Face encoding + matching (dlib)
│   ├── encryption.py    # Fernet AES encryption for face data
│   ├── auth.py          # JWT issue + verify
│   ├── liveness.py      # EAR blink detection
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.tsx
        ├── styles.css
        └── components/
            ├── Landing.tsx
            ├── Register.tsx   # 6-step KYC wizard
            ├── PayScreen.tsx  # 4-step payment flow
            └── Dashboard.tsx
```
