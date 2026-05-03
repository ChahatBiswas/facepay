import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Screen } from '../App';

const API = 'http://localhost:8000';

interface Props { onNavigate: (s: Screen) => void; }

type Step =
  | 'personal' | 'aadhaar' | 'otp'
  | 'bank' | 'pennydrop'
  | 'upi' | 'face' | 'captured' | 'success';

const STEPS = ['Personal', 'Aadhaar', 'Verify', 'Bank', 'UPI', 'Face'];
const STEP_INDEX: Record<Step, number> = {
  personal: 0, aadhaar: 1, otp: 2, bank: 3, pennydrop: 3,
  upi: 4, face: 5, captured: 5, success: 6,
};

export default function Register({ onNavigate }: Props) {
  const [step, setStep] = useState<Step>('personal');

  // personal
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');

  // aadhaar
  const [aadhaar, setAadhaar]       = useState('');
  const [dob, setDob]               = useState('');
  const [aadhaarRef, setAadhaarRef] = useState('');
  const [aadhaarMasked, setAadhaarMasked] = useState('');

  // otp
  const [sentOtp, setSentOtp]       = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');

  // bank
  const [bankAccount, setBankAccount]   = useState('');
  const [bankAccount2, setBankAccount2] = useState('');
  const [ifsc, setIfsc]                 = useState('');
  const [bankInfo, setBankInfo]         = useState<{ bank: string; branch: string } | null>(null);
  const [ifscLoading, setIfscLoading]   = useState(false);

  // penny drop
  const [pennyUtr, setPennyUtr] = useState('');

  // upi
  const [upiId, setUpiId]   = useState('');
  const [upiPin, setUpiPin] = useState('');
  const [upiPin2, setUpiPin2] = useState('');

  // face
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<any>(null);

  const clearError = () => setError('');

  // ── Step 1: Aadhaar eKYC ─────────────────────────────────────────────────
  const submitPersonal = () => {
    if (!name.trim() || phone.length < 10) {
      setError('Enter your full name and a valid 10-digit phone number.');
      return;
    }
    clearError();
    setStep('aadhaar');
  };

  const verifyAadhaar = async () => {
    const clean = aadhaar.replace(/\D/g, '');
    if (clean.length !== 12) { setError('Aadhaar number must be 12 digits.'); return; }
    if (!dob) { setError('Enter your date of birth.'); return; }
    setLoading(true); clearError();
    try {
      const res = await fetch(`${API}/api/kyc/aadhaar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar_number: clean, name: name.trim(), dob }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setAadhaarRef(data.ref_id);
      setAadhaarMasked(data.masked_aadhaar);
      setStep('otp');
      // Automatically trigger OTP after KYC passes
      await triggerOtp();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Step 2: OTP ───────────────────────────────────────────────────────────
  const triggerOtp = async () => {
    try {
      const res = await fetch(`${API}/api/otp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (res.ok) setSentOtp(data.otp);
    } catch {}
  };

  const sendOtp = async () => {
    setLoading(true); clearError();
    try { await triggerOtp(); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (enteredOtp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setLoading(true); clearError();
    try {
      const res = await fetch(`${API}/api/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: enteredOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStep('bank');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── IFSC lookup ───────────────────────────────────────────────────────────
  const lookupIfsc = async (code: string) => {
    setIfsc(code.toUpperCase());
    if (code.length !== 11) { setBankInfo(null); return; }
    setIfscLoading(true);
    try {
      const res = await fetch(`${API}/api/ifsc/${code}`);
      const data = await res.json();
      if (res.ok) setBankInfo({ bank: data.bank, branch: data.branch });
      else setBankInfo(null);
    } catch { setBankInfo(null); }
    finally { setIfscLoading(false); }
  };

  // ── Step 3: Bank ──────────────────────────────────────────────────────────
  const submitBank = () => {
    if (!bankAccount || bankAccount.length < 8) { setError('Enter a valid account number (min 8 digits).'); return; }
    if (bankAccount !== bankAccount2) { setError('Account numbers do not match.'); return; }
    if (!bankInfo) { setError('Enter a valid 11-character IFSC code.'); return; }
    clearError();
    setStep('pennydrop');
    runPennyDrop();
  };

  // ── Penny drop ────────────────────────────────────────────────────────────
  const runPennyDrop = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/bank/pennydrop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_number: bankAccount, ifsc_code: ifsc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setPennyUtr(data.utr);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Step 4: UPI ───────────────────────────────────────────────────────────
  const submitUpi = () => {
    if (!upiId.trim()) { setError('Enter a UPI ID.'); return; }
    if (upiPin.length < 4) { setError('UPI PIN must be at least 4 digits.'); return; }
    if (upiPin !== upiPin2) { setError('UPI PINs do not match.'); return; }
    clearError();
    setStep('face');
  };

  // ── Step 5: Face ──────────────────────────────────────────────────────────
  const capture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (shot) { setCapturedImage(shot); setStep('captured'); }
  }, []);

  // ── Final: Submit ─────────────────────────────────────────────────────────
  const submit = async () => {
    if (!capturedImage) return;
    setLoading(true); clearError();
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const form = new FormData();
      form.append('name', name.trim());
      form.append('phone', phone);
      form.append('upi_id', upiId.trim());
      form.append('upi_pin', upiPin);
      form.append('bank_account', bankAccount);
      form.append('ifsc_code', ifsc);
      form.append('bank_name', bankInfo!.bank);
      form.append('face_image', blob, 'face.jpg');

      const res = await fetch(`${API}/api/register`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setResult(data);
      setStep('success');
    } catch (e: any) { setError(e.message); setStep('captured'); }
    finally { setLoading(false); }
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const currentStepIdx = STEP_INDEX[step] ?? 0;

  const ProgressBar = () => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 700, fontSize: '0.78rem',
              background: i < currentStepIdx ? 'var(--green)' : i === currentStepIdx
                ? 'linear-gradient(135deg,var(--purple),#4f46e5)' : 'var(--surface)',
              border: i <= currentStepIdx ? 'none' : '1px solid var(--border)',
              color: i <= currentStepIdx ? '#fff' : 'var(--muted)',
              boxShadow: i === currentStepIdx ? '0 0 16px rgba(124,58,237,0.4)' : 'none',
              transition: 'all 0.3s',
            }}>
              {i < currentStepIdx ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: '0.68rem', color: i <= currentStepIdx ? 'var(--text)' : 'var(--muted)' }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: 'linear-gradient(90deg,var(--purple),var(--cyan))',
          width: `${(currentStepIdx / (STEPS.length - 1)) * 100}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );

  const ErrorBox = () => error ? (
    <div className="card" style={{
      padding: '10px 14px', marginBottom: 16,
      background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
      color: 'var(--red)', fontSize: '0.83rem',
    }}>
      ⚠ {error}
    </div>
  ) : null;

  const GreenBanner = ({ text }: { text: string }) => (
    <div className="card" style={{
      padding: '10px 14px', marginBottom: 4,
      background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
      fontSize: '0.8rem', color: 'var(--green)',
    }}>
      ✓ {text}
    </div>
  );

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="form-page fade-in">
        <div className="card form-card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: '4rem', marginBottom: 12 }}>🎉</div>
            <h2 className="gradient-text" style={{ fontSize: '1.8rem', fontWeight: 900 }}>Account Created!</h2>
            <p style={{ color: 'var(--muted)', marginTop: 6 }}>KYC verified · Bank linked · Biometric enrolled</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['👤 Name', result?.user?.name],
              ['📱 UPI ID', result?.user?.upi_id],
              ['🏦 Bank', result?.user?.bank_name],
              ['💰 Starting Balance', `₹${result?.user?.balance?.toLocaleString()}`],
              ['🪪 Aadhaar eKYC', `Verified · Ref ${aadhaarRef}`],
              ['✅ KYC Status', 'Fully Verified'],
            ].map(([label, value]) => (
              <div key={label} className="card" style={{
                padding: '12px 16px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{label}</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{value}</span>
              </div>
            ))}
          </div>
          {capturedImage && (
            <img src={capturedImage} alt="face" style={{
              width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
              border: '3px solid var(--purple)', margin: '20px auto 0', display: 'block',
            }} />
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-success btn-full" onClick={() => onNavigate('pay')}>Pay Now →</button>
            <button className="btn btn-secondary btn-full" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page fade-in">
      <div className="card form-card" style={{ maxWidth: 520 }}>
        <h2 className="form-title">Create FacePay Account</h2>
        <p className="form-subtitle">Full KYC verification · Bank linking · Biometric enrolment</p>

        <ProgressBar />
        <ErrorBox />

        {/* ── Step 1: Personal ───────────────────────────────────────────── */}
        {step === 'personal' && (
          <div className="form-fields">
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input className="input" placeholder="As per Aadhaar / bank records"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Mobile Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="input" style={{ width: 56, flexShrink: 0, color: 'var(--muted)' }}>+91</div>
                <input className="input" style={{ flex: 1 }} placeholder="10-digit number"
                  maxLength={10} value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <button className="btn btn-primary btn-full"
              disabled={!name.trim() || phone.length < 10}
              onClick={submitPersonal}>
              Next: Aadhaar eKYC →
            </button>
          </div>
        )}

        {/* ── Step 2: Aadhaar eKYC ─────────────────────────────────────── */}
        {step === 'aadhaar' && (
          <div className="form-fields">
            <GreenBanner text={`Name: ${name} · +91-${phone}`} />
            <div className="card" style={{
              padding: '12px 16px', marginBottom: 8,
              background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
              fontSize: '0.8rem', color: 'var(--purple-light)',
            }}>
              🔐 Your Aadhaar data is verified via UIDAI sandbox and never stored in plaintext.
            </div>
            <div className="input-group">
              <label className="input-label">Aadhaar Number</label>
              <input className="input" placeholder="XXXX XXXX XXXX" maxLength={14}
                value={aadhaar}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setAadhaar(digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim());
                }}
                style={{ letterSpacing: 3 }} />
            </div>
            <div className="input-group">
              <label className="input-label">Date of Birth</label>
              <input className="input" type="date" value={dob}
                onChange={e => setDob(e.target.value)}
                max={new Date().toISOString().split('T')[0]} />
            </div>
            <button className="btn btn-primary btn-full"
              disabled={loading || aadhaar.replace(/\D/g, '').length !== 12 || !dob}
              onClick={verifyAadhaar}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Verifying…</> : '🔐 Verify Aadhaar →'}
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => setStep('personal')}>← Back</button>
          </div>
        )}

        {/* ── Step 3: OTP ──────────────────────────────────────────────── */}
        {step === 'otp' && (
          <div className="form-fields">
            {aadhaarMasked && <GreenBanner text={`Aadhaar eKYC passed · ${aadhaarMasked} · Ref ${aadhaarRef}`} />}
            <div className="card" style={{
              padding: '14px 18px', background: 'rgba(34,211,238,0.06)',
              border: '1px solid rgba(34,211,238,0.15)',
            }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 4 }}>OTP sent to +91-{phone}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--cyan)' }}>
                Demo OTP: <strong style={{ fontSize: '1.1rem', letterSpacing: 4 }}>{sentOtp}</strong>
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 6 }}>
                Production: delivered via Twilio SMS — OTP not exposed in response.
              </p>
            </div>
            <div className="input-group">
              <label className="input-label">Enter OTP</label>
              <input className="input" placeholder="6-digit OTP" maxLength={6}
                value={enteredOtp} onChange={e => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: 8, textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary btn-full"
              disabled={loading || enteredOtp.length !== 6} onClick={verifyOtp}>
              {loading ? '…' : 'Verify OTP →'}
            </button>
            <button className="btn btn-secondary btn-full"
              disabled={loading} onClick={sendOtp} style={{ opacity: 0.7 }}>
              Resend OTP
            </button>
          </div>
        )}

        {/* ── Step 4: Bank ──────────────────────────────────────────────── */}
        {step === 'bank' && (
          <div className="form-fields">
            <GreenBanner text={`Phone verified: +91-${phone}`} />
            <div className="input-group">
              <label className="input-label">Bank Account Number</label>
              <input className="input" placeholder="Enter account number"
                value={bankAccount} onChange={e => setBankAccount(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="input-group">
              <label className="input-label">Confirm Account Number</label>
              <input className="input" placeholder="Re-enter account number"
                value={bankAccount2} onChange={e => setBankAccount2(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="input-group">
              <label className="input-label">IFSC Code</label>
              <input className="input" placeholder="e.g. SBIN0001234" maxLength={11}
                value={ifsc} onChange={e => lookupIfsc(e.target.value)}
                style={{ textTransform: 'uppercase', letterSpacing: 2 }} />
              {ifscLoading && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Looking up bank…</p>}
              {bankInfo && (
                <div className="card" style={{
                  padding: '10px 14px', background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.2)', marginTop: 4,
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.9rem' }}>✓ {bankInfo.bank}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>{bankInfo.branch}</div>
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-full" onClick={submitBank}>
              Verify Account →
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => setStep('otp')}>← Back</button>
          </div>
        )}

        {/* ── Penny drop in progress ─────────────────────────────────────── */}
        {step === 'pennydrop' && (
          <div className="form-fields">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div className="spinner" style={{ width: 44, height: 44, borderWidth: 4, margin: '0 auto 16px' }} />
                <p className="gradient-text" style={{ fontWeight: 700 }}>Running penny-drop verification…</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 6 }}>
                  Sending ₹1.00 micro-credit to confirm your account is active
                </p>
              </div>
            ) : error ? (
              <>
                <div className="card" style={{ padding: '12px 16px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: 'var(--red)', fontSize: '0.83rem' }}>
                  ⚠ {error}
                </div>
                <button className="btn btn-primary btn-full" onClick={() => { clearError(); setStep('bank'); }}>← Fix Bank Details</button>
              </>
            ) : (
              <>
                <div className="card" style={{ padding: '14px 18px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>✓ Bank Account Verified</div>
                  {[
                    ['Bank', bankInfo?.bank],
                    ['IFSC', ifsc],
                    ['Account', `XXXX${bankAccount.slice(-4)}`],
                    ['UTR Reference', pennyUtr],
                    ['Amount Credited', '₹1.00'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary btn-full" onClick={() => setStep('upi')}>
                  Continue to UPI Setup →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 5: UPI ────────────────────────────────────────────────── */}
        {step === 'upi' && (
          <div className="form-fields">
            <GreenBanner text={`Bank linked: ${bankInfo?.bank} ···${bankAccount.slice(-4)}`} />
            <div className="input-group">
              <label className="input-label">UPI ID</label>
              <input className="input" placeholder="e.g. chahat@upi"
                value={upiId} onChange={e => setUpiId(e.target.value)} />
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                Your payment handle — others use this to send you money.
              </p>
            </div>
            <div className="input-group">
              <label className="input-label">Set UPI PIN</label>
              <input className="input" type="password" placeholder="4–6 digit PIN" maxLength={6}
                value={upiPin} onChange={e => setUpiPin(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: '1.4rem', letterSpacing: 6 }} />
            </div>
            <div className="input-group">
              <label className="input-label">Confirm UPI PIN</label>
              <input className="input" type="password" placeholder="Re-enter PIN" maxLength={6}
                value={upiPin2} onChange={e => setUpiPin2(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: '1.4rem', letterSpacing: 6 }} />
            </div>
            <button className="btn btn-primary btn-full" onClick={submitUpi}>
              Next: Enrol Face →
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => setStep('bank')}>← Back</button>
          </div>
        )}

        {/* ── Step 6: Face capture ───────────────────────────────────────── */}
        {step === 'face' && (
          <div className="capture-area">
            <GreenBanner text={`UPI ready: ${upiId}`} />
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: 10 }}>
              Final step — register your face as your biometric key.
              No PIN or OTP needed for payments after this.
            </p>
            <div className="webcam-wrapper scanning">
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width="100%"
                videoConstraints={{ facingMode: 'user', width: 400, height: 300 }} />
              <div className="scan-line" />
              <div className="face-overlay" />
            </div>
            <p className="capture-hint pulse">Centre your face inside the oval · Good lighting</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep('upi')}>← Back</button>
              <button className="btn btn-primary btn-full" onClick={capture}>📸 Capture Face</button>
            </div>
          </div>
        )}

        {/* ── Captured: confirm ─────────────────────────────────────────── */}
        {step === 'captured' && capturedImage && (
          <div className="capture-area">
            <div className="captured-preview">
              <img src={capturedImage} alt="Your face" />
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--green)', textAlign: 'center' }}>
              ✓ Face looks good?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full"
                onClick={() => { setCapturedImage(null); setStep('face'); }}>↺ Retake</button>
              <button className="btn btn-primary btn-full" disabled={loading} onClick={submit}>
                {loading
                  ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating…</>
                  : '✓ Create Account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
