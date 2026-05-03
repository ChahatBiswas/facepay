import React, { useEffect, useState } from 'react';
import { Screen } from '../App';

const API = 'http://localhost:8000';

interface Props { onNavigate: (s: Screen) => void; }

export default function Dashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u, t] = await Promise.all([
        fetch(`${API}/api/stats`).then(r => r.json()),
        fetch(`${API}/api/users`).then(r => r.json()),
        fetch(`${API}/api/transactions`).then(r => r.json()),
      ]);
      setStats(s); setUsers(u); setTransactions(t);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteUser = async (id: string) => {
    if (!window.confirm('Remove this user?')) return;
    setDeletingId(id);
    await fetch(`${API}/api/users/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
      </div>
    );
  }

  return (
    <div className="dashboard fade-in">
      <div className="dashboard-header">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900 }}>Dashboard</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>Real-time overview of FacePay activity</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { icon: '👥', label: 'Registered Users', value: stats?.total_users ?? 0, color: 'var(--purple-light)' },
          { icon: '✅', label: 'Successful Payments', value: stats?.total_transactions ?? 0, color: 'var(--green)' },
          { icon: '₹', label: 'Volume Processed', value: `₹${(stats?.total_volume ?? 0).toLocaleString()}`, color: 'var(--cyan)' },
          { icon: '❌', label: 'Failed Attempts', value: stats?.failed_attempts ?? 0, color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="card stat-card">
            <div className="stat-card-icon">{s.icon}</div>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Registered Users */}
      <div className="section-title">Registered Users</div>
      {users.length === 0 ? (
        <div className="empty"><div className="empty-icon">👤</div><p>No users registered yet.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onNavigate('register')}>Register First User</button>
        </div>
      ) : (
        <div className="users-grid" style={{ marginBottom: 40 }}>
          {users.map(u => (
            <div key={u.id} className="card user-card">
              <div className="user-avatar-placeholder">{u.name[0].toUpperCase()}</div>
              <div className="user-info">
                <div className="user-name">{u.name}</div>
                <div className="user-upi">{u.upi_id}</div>
                <div className="user-balance">₹{u.balance?.toLocaleString()}</div>
              </div>
              <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                disabled={deletingId === u.id}
                onClick={() => deleteUser(u.id)}>
                {deletingId === u.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transactions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Recent Transactions</div>
        <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={load}>↺ Refresh</button>
      </div>
      {transactions.length === 0 ? (
        <div className="empty"><div className="empty-icon">💳</div><p>No transactions yet.</p>
          <button className="btn btn-success" style={{ marginTop: 16 }} onClick={() => onNavigate('pay')}>Make First Payment</button>
        </div>
      ) : (
        <div className="txn-list">
          {transactions.map(t => (
            <div key={t.id} className="txn-row">
              <div className="txn-icon">{t.status === 'success' ? '✅' : '❌'}</div>
              <div className="txn-info">
                <div className="txn-name">{t.sender_name}</div>
                {t.note && <div className="txn-note">"{t.note}"</div>}
                <div className="txn-time">{fmt(t.timestamp)}</div>
              </div>
              <div>
                <div className={`txn-amount ${t.status}`}>
                  {t.status === 'success' ? `−₹${t.amount.toLocaleString()}` : 'Failed'}
                </div>
                <div style={{ textAlign: 'right', marginTop: 4 }}>
                  <span className={`badge badge-${t.status}`}>{t.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
