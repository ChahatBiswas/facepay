import React, { useEffect, useState } from 'react';
import { Screen } from '../App';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Props { onNavigate: (s: Screen) => void; }

export default function Landing({ onNavigate }: Props) {
  const [stats, setStats] = useState({ total_users: 0, total_transactions: 0, total_volume: 0 });

  useEffect(() => {
    fetch(`${API}/api/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div className="landing-center fade-in">
      <div className="landing-icon pulse">◉</div>

      <div>
        <h1 className="landing-title">
          Pay with your <span className="gradient-text">Face</span>
        </h1>
        <p className="landing-subtitle" style={{ margin: '16px auto 0' }}>
          No OTP. No PIN. No friction. Just look at the camera and your payment is done in under a second.
        </p>
      </div>

      <div className="landing-actions">
        <button className="btn btn-primary" style={{ padding: '16px 36px', fontSize: '1rem' }}
          onClick={() => onNavigate('register')}>
          ＋ Register Face
        </button>
        <button className="btn btn-success" style={{ padding: '16px 36px', fontSize: '1rem' }}
          onClick={() => onNavigate('pay')}>
          ◉ Pay Now
        </button>
        <button className="btn btn-secondary" style={{ padding: '16px 36px', fontSize: '1rem' }}
          onClick={() => onNavigate('dashboard')}>
          ↗ Dashboard
        </button>
      </div>

      {/* Live stats */}
      <div className="card" style={{ padding: '28px 48px', marginTop: 8 }}>
        <div className="landing-stats">
          <div className="stat-item">
            <div className="stat-value gradient-text">{stats.total_users}</div>
            <div className="stat-label">Registered Users</div>
          </div>
          <div className="stat-item">
            <div className="stat-value gradient-text">{stats.total_transactions}</div>
            <div className="stat-label">Transactions</div>
          </div>
          <div className="stat-item">
            <div className="stat-value gradient-text">₹{stats.total_volume.toLocaleString()}</div>
            <div className="stat-label">Volume Processed</div>
          </div>
        </div>
      </div>

      {/* Feature pills */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {['🔒 Liveness Detection', '⚡ Sub-second Auth', '🇮🇳 UPI Native', '📊 Real-time Dashboard'].map(f => (
          <div key={f} className="card" style={{ padding: '10px 18px', fontSize: '0.82rem', color: 'var(--muted)' }}>
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}
