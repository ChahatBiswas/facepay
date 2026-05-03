import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Screen } from '../App';

const API = 'http://localhost:8000';

interface Props { onNavigate: (s: Screen) => void; }

type Step =
  | 'amount'       // enter ₹ amount + note
  | 'login'        // UPI ID + PIN → JWT
  | 'liveness'     // blink detection (auto-captures 6 frames)
  | 'camera'       // final face capture
  | 'captured'     // review + confirm
  | 'processing'   // API in-flight
  | 'success'
  | 'failed';

const TOTAL_LIVENESS_FRAMES = 6;
const FRAME_INTERVAL_MS = 700;

export default function PayScreen({ onNavigate }: Props) {
  const [step, setStep]   = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [note, setNote]   = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // JWT from login step
  const [token, setToken]   = useState('');
  const [upiId, setUpiId]   = useState('');
  const [upiPin, setUpiPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Liveness
  const [livenessFrames, setLivenessFrames] = useState<Blob[]>([]);
  const [livenessCount, setLivenessCount]   = useState(0);
  const [livenessStatus, setLivenessStatus] = useState<'capturing' | 'checking' | 'passed' | 'failed'>('capturing');
  const livenessRef = useRef<NodeJS.Timeout | null>(null);

  // Face capture
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);

  const quickAmounts = [100, 250, 500, 1000];

  // ── Login ────────────────────────────────────────────────────────────────
  const login = async () => {
    if (!upiId.trim()) { setError('Enter your UPI ID.'); return; }
    if (upiPin.length < 4) { setError('Enter your UPI PIN.'); return; }
    setLoginLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upi_id: upiId.trim(), upi_pin: upiPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setToken(data.access_token);
      setStep('liveness');
    } catch (e: any) { setError(e.message); }
    finally { setLoginLoading(false); }
  };

  // ── Liveness: auto-capture frames ────────────────────────────────────────
  useEffect(() => {
    if (step !== 'liveness' || livenessStatus !== 'capturing') return;

    livenessRef.current = setInterval(async () => {
      const shot = webcamRef.current?.getScreenshot();
      if (!shot) return;

      const blob = await (await fetch(shot)).blob();
      setLivenessFrames(prev => {
        const updated = [...prev, blob];
        setLivenessCount(updated.length);
        if (updated.length >= TOTAL_LIVENESS_FRAMES) {
          clearInterval(livenessRef.current!);
          submitLiveness(updated);
        }
        return updated;
      });
    }, FRAME_INTERVAL_MS);

    return () => { if (livenessRef.current) clearInterval(livenessRef.current); };
  }, [step, livenessStatus]); // eslint-disable-line

  const submitLiveness = async (frames: Blob[]) => {
    setLivenessStatus('checking');
    try {
      const form = new FormData();
      frames.forEach(b => form.append('frames', b, 'frame.jpg'));
      const res = await fetch(`${API}/api/liveness`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setLivenessStatus('failed');
        setError(data.detail || 'Liveness check failed. Please blink clearly and try again.');
        return;
      }
      setLivenessStatus('passed');
      setTimeout(() => setStep('camera'), 900);
    } catch (e: any) {
      setLivenessStatus('failed');
      setError(e.message);
    }
  };

  const retryLiveness = () => {
    setLivenessFrames([]);
    setLivenessCount(0);
    setLivenessStatus('capturing');
    setError('');
  };

  // ── Face capture ──────────────────────────────────────────────────────────
  const capture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (shot) { setCapturedImage(shot); setStep('captured'); }
  }, []);

  // ── Pay ───────────────────────────────────────────────────────────────────
  const pay = async () => {
    if (!capturedImage) return;
    setStep('processing'); setError('');
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const form = new FormData();
      form.append('amount', amount);
      form.append('note', note);
      form.append('face_image', blob, 'face.jpg');

      const res = await fetch(`${API}/api/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Payment failed'); setStep('failed'); return; }
      setResult(data);
      setStep('success');
    } catch (e: any) { setError(e.message || 'Something went wrong'); setStep('failed'); }
  };

  const reset = () => {
    setStep('amount'); setAmount(''); setNote('');
    setCapturedImage(null); setResult(null); setError('');
    setToken(''); setUpiId(''); setUpiPin('');
    setLivenessFrames([]); setLivenessCount(0); setLivenessStatus('capturing');
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="form-page fade-in">
        <div className="card result-card" style={{ maxWidth: 440, width: '100%' }}>
          <div className="result-icon">✅</div>
          <h2 className="result-title" style={{ color: 'var(--green)' }}>Payment Successful!</h2>
          <div className="result-amount gradient-text">₹{parseFloat(amount).toLocaleString()}</div>
          <div className="result-meta">
            Paid by <strong style={{ color: 'var(--text)' }}>{result?.user?.name}</strong>
            {' · '}{result?.user?.upi_id}
          </div>
          <div className="confidence-bar-wrap">
            <div className="confidence-label">Face Match Confidence — {result?.confidence}%</div>
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${result?.confidence}%` }} />
            </div>
          </div>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>Remaining Balance</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--cyan)' }}>
              ₹{result?.new_balance?.toLocaleString()}
            </div>
          </div>
          {note && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16 }}>"{note}"</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-full" onClick={reset}>New Payment</button>
            <button className="btn btn-secondary btn-full" onClick={() => onNavigate('dashboard')}>View History</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (step === 'failed') {
    return (
      <div className="form-page fade-in">
        <div className="card result-card" style={{ maxWidth: 440, width: '100%', border: '1px solid rgba(244,63,94,0.2)' }}>
          <div className="result-icon">❌</div>
          <h2 className="result-title" style={{ color: 'var(--red)' }}>Payment Failed</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-full"
              onClick={() => { setCapturedImage(null); setStep('camera'); }}>Try Again</button>
            <button className="btn btn-secondary btn-full" onClick={reset}>Start Over</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing ─────────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="form-page fade-in">
        <div className="card" style={{ maxWidth: 380, width: '100%', padding: 48, textAlign: 'center' }}>
          <div className="spinner" style={{ width: 52, height: 52, borderWidth: 4, margin: '0 auto 20px' }} />
          <h3 className="gradient-text" style={{ fontSize: '1.2rem', fontWeight: 700 }}>Authenticating Face…</h3>
          <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: '0.85rem' }}>
            Comparing encrypted biometric against vault
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page fade-in">
      <div className="card form-card">
        <h2 className="form-title">Make a Payment</h2>
        <p className="form-subtitle">
          {step === 'amount'   && 'Enter amount · Authenticate via UPI PIN + face'}
          {step === 'login'    && 'Authenticate your identity'}
          {step === 'liveness' && 'Liveness check — please blink once'}
          {step === 'camera'   && 'Final face scan for payment authorisation'}
          {step === 'captured' && 'Review and confirm'}
        </p>

        {error && (
          <div className="card" style={{
            padding: '10px 14px', marginBottom: 16,
            background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
            color: 'var(--red)', fontSize: '0.83rem',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Amount ───────────────────────────────────────────────────── */}
        {step === 'amount' && (
          <div className="form-fields">
            <div className="input-group">
              <label className="input-label">Amount (₹)</label>
              <input className="input" type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{ fontSize: '1.4rem', fontWeight: 700 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {quickAmounts.map(a => (
                <button key={a} className="btn btn-secondary"
                  style={{ flex: 1, padding: '8px 4px', fontSize: '0.82rem' }}
                  onClick={() => setAmount(String(a))}>
                  ₹{a}
                </button>
              ))}
            </div>
            <div className="input-group">
              <label className="input-label">Note (optional)</label>
              <input className="input" placeholder="e.g. Coffee, Rent, Groceries"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <button className="btn btn-success btn-full"
              disabled={!amount || parseFloat(amount) <= 0}
              onClick={() => setStep('login')}>
              Next: Authenticate →
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Not registered?{' '}
              <span style={{ color: 'var(--purple-light)', cursor: 'pointer' }}
                onClick={() => onNavigate('register')}>Register here →</span>
            </p>
          </div>
        )}

        {/* ── UPI Login ────────────────────────────────────────────────── */}
        {step === 'login' && (
          <div className="form-fields">
            <div className="card" style={{
              padding: '10px 16px', marginBottom: 4, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Paying</span>
              <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--cyan)' }}>
                ₹{parseFloat(amount).toLocaleString()}
              </span>
            </div>
            <div className="card" style={{
              padding: '10px 14px', marginBottom: 8,
              background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
              fontSize: '0.78rem', color: 'var(--purple-light)',
            }}>
              🔒 Credentials issue a 30-min JWT — your PIN is never sent again after this step.
            </div>
            <div className="input-group">
              <label className="input-label">UPI ID</label>
              <input className="input" placeholder="e.g. chahat@upi"
                value={upiId} onChange={e => setUpiId(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">UPI PIN</label>
              <input className="input" type="password" placeholder="4–6 digit PIN" maxLength={6}
                value={upiPin} onChange={e => setUpiPin(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: '1.4rem', letterSpacing: 6 }} />
            </div>
            <button className="btn btn-primary btn-full"
              disabled={loginLoading || !upiId.trim() || upiPin.length < 4}
              onClick={login}>
              {loginLoading
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Authenticating…</>
                : '🔐 Authenticate →'}
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => setStep('amount')}>← Back</button>
          </div>
        )}

        {/* ── Liveness ─────────────────────────────────────────────────── */}
        {step === 'liveness' && (
          <div className="capture-area">
            <div className="card" style={{
              padding: '10px 16px', marginBottom: 10,
              background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
              fontSize: '0.8rem', color: 'var(--purple-light)',
            }}>
              🔐 JWT issued · Liveness check prevents replay attacks
            </div>

            {livenessStatus !== 'failed' && (
              <div className={`webcam-wrapper ${livenessStatus === 'passed' ? 'matched' : 'scanning'}`}>
                <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width="100%"
                  videoConstraints={{ facingMode: 'user', width: 400, height: 300 }} />
                <div className="scan-line" />
                <div className="face-overlay" />
              </div>
            )}

            {livenessStatus === 'capturing' && (
              <>
                <p className="capture-hint pulse">👁 Please blink once naturally…</p>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, marginTop: 8 }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg,var(--purple),var(--cyan))',
                    width: `${(livenessCount / TOTAL_LIVENESS_FRAMES) * 100}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                  Capturing frame {livenessCount} / {TOTAL_LIVENESS_FRAMES}
                </p>
              </>
            )}

            {livenessStatus === 'checking' && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, margin: '0 auto 8px' }} />
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Analysing liveness…</p>
              </div>
            )}

            {livenessStatus === 'passed' && (
              <p style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700, marginTop: 10 }}>
                ✓ Liveness confirmed — redirecting…
              </p>
            )}

            {livenessStatus === 'failed' && (
              <>
                <div className="card" style={{
                  padding: '14px 18px', textAlign: 'center',
                  background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>👁</div>
                  <p style={{ color: 'var(--red)', fontWeight: 700 }}>Liveness check failed</p>
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 4 }}>{error}</p>
                </div>
                <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={retryLiveness}>
                  ↺ Try Again
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Face camera ──────────────────────────────────────────────── */}
        {step === 'camera' && (
          <div className="capture-area">
            <div className="card" style={{
              padding: '10px 16px', marginBottom: 12, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Paying</span>
              <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--cyan)' }}>
                ₹{parseFloat(amount).toLocaleString()}
              </span>
            </div>
            <div className="card" style={{
              padding: '8px 12px', marginBottom: 8, fontSize: '0.77rem',
              color: 'var(--green)', background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.15)',
            }}>
              ✓ Liveness verified · ✓ JWT authenticated
            </div>
            <div className="webcam-wrapper scanning">
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width="100%"
                videoConstraints={{ facingMode: 'user', width: 400, height: 300 }} />
              <div className="scan-line" />
              <div className="face-overlay" />
            </div>
            <p className="capture-hint pulse">👁 Look directly at the camera</p>
            <button className="btn btn-success btn-full" style={{ marginTop: 8 }} onClick={capture}>
              ◉ Capture Face
            </button>
          </div>
        )}

        {/* ── Captured: confirm ─────────────────────────────────────────── */}
        {step === 'captured' && capturedImage && (
          <div className="capture-area">
            <div className="card" style={{
              padding: '10px 16px', marginBottom: 12, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Paying</span>
              <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--cyan)' }}>
                ₹{parseFloat(amount).toLocaleString()}
              </span>
            </div>
            <div className="webcam-wrapper matched">
              <img src={capturedImage} alt="Captured" style={{ width: '100%', display: 'block' }} />
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--green)', textAlign: 'center' }}>✓ Face captured</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full"
                onClick={() => { setCapturedImage(null); setStep('camera'); }}>↺ Retake</button>
              <button className="btn btn-success btn-full" onClick={pay}>◉ Confirm & Pay</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
