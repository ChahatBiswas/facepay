import React, { useState, useEffect } from 'react';
import Landing from './components/Landing';
import Register from './components/Register';
import PayScreen from './components/PayScreen';
import Dashboard from './components/Dashboard';

export type Screen = 'landing' | 'register' | 'pay' | 'dashboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');

  return (
    <div className="page">
      {/* Animated background */}
      <div className="orb orb1" />
      <div className="orb orb2" />
      <div className="orb orb3" />

      {/* Nav */}
      <nav className="nav">
        <div className="nav-logo gradient-text" style={{ cursor: 'pointer' }} onClick={() => setScreen('landing')}>
          ◉ FacePay
        </div>
        <div className="nav-links">
          <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setScreen('register')}>Register</button>
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setScreen('pay')}>Pay</button>
          <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setScreen('dashboard')}>Dashboard</button>
        </div>
      </nav>

      {/* Screens */}
      {screen === 'landing'    && <Landing    onNavigate={setScreen} />}
      {screen === 'register'   && <Register   onNavigate={setScreen} />}
      {screen === 'pay'        && <PayScreen  onNavigate={setScreen} />}
      {screen === 'dashboard'  && <Dashboard  onNavigate={setScreen} />}
    </div>
  );
}
