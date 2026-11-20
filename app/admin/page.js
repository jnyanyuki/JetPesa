'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

export default function JetPesaAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('radar'); // 'radar' | 'overview' | 'users' | 'bets' | 'ledger'
  const [overviewData, setOverviewData] = useState(null);
  const [roundsData, setRoundsData] = useState([]);
  const [pastRoundsData, setPastRoundsData] = useState([]);
  const [inFlightStats, setInFlightStats] = useState(null);
  const [dailyStats, setDailyStats] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dailyTab, setDailyTab] = useState('summary'); // 'summary' | 'payins' | 'payouts'
  const [currentCycleState, setCurrentCycleState] = useState(null);
  const [usersData, setUsersData] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [betsData, setBetsData] = useState([]);
  const [ledgerData, setLedgerData] = useState({ deposits: [], withdrawals: [] });

  const [overrideModal, setOverrideModal] = useState({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' });
  const [adjustModal, setAdjustModal] = useState({ open: false, user: null, amount: '', reason: '' });
  const [instantCrashing, setInstantCrashing] = useState(false);
  const [toast, setToast] = useState(null);

  const pollTimerRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getStoredSecret = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('jetpesa_admin_secret') || '';
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Access Denied: Invalid Admin Secret.');
      }

      localStorage.setItem('jetpesa_admin_secret', secretInput);
      setIsAuthenticated(true);
      showToast('Super Admin access authenticated.');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {}
    localStorage.removeItem('jetpesa_admin_secret');
    setIsAuthenticated(false);
    setSecretInput('');
  };

  // Authenticated fetch helper
  const adminFetch = useCallback(async (url, options = {}) => {
    const secret = getStoredSecret();
    const headers = {
      ...(options.headers || {}),
      'x-admin-secret': secret,
    };
    return fetch(url, { ...options, headers });
  }, []);

  // Fetch Radar (Current + Next 6 Rounds + Last 5 Past Rounds + Daily Stats)
  const loadRoundsRadar = useCallback(async (dateParam) => {
    try {
      const targetDate = dateParam || selectedDate;
      const res = await adminFetch(`/api/admin/rounds?count=6&pastCount=5&date=${encodeURIComponent(targetDate)}`);
      const data = await res.json();
      if (data.success) {
        setRoundsData(data.rounds || []);
        setPastRoundsData(data.pastRounds || []);
        setCurrentCycleState(data.currentState || null);
        if (data.inFlightStats) setInFlightStats(data.inFlightStats);
        if (data.dailyStats) setDailyStats(data.dailyStats);
      }
    } catch (e) {
      console.warn('Radar error:', e);
    }
  }, [adminFetch, selectedDate]);

  // Fetch Overview Stats
  const loadOverview = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/overview');
      const data = await res.json();
      if (data.success) {
        setOverviewData(data);
        if (data.game) setCurrentCycleState(data.game);
      }
    } catch (e) {
      console.warn('Overview error:', e);
    }
  }, [adminFetch]);

  // Fetch Users
  const loadUsers = useCallback(async (query = '') => {
    try {
      const res = await adminFetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=30`);
      const data = await res.json();
      if (data.success) setUsersData(data.users || []);
    } catch (e) {
      console.warn('Users error:', e);
    }
  }, [adminFetch]);

  // Fetch Bets
  const loadBets = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/bets?limit=40');
      const data = await res.json();
      if (data.success) setBetsData(data.bets || []);
    } catch (e) {
      console.warn('Bets error:', e);
    }
  }, [adminFetch]);

  // Fetch Ledger
  const loadLedger = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/transactions?limit=30');
      const data = await res.json();
      if (data.success) setLedgerData({ deposits: data.deposits || [], withdrawals: data.withdrawals || [] });
    } catch (e) {
      console.warn('Ledger error:', e);
    }
  }, [adminFetch]);

  // Initial Auth Check
  useEffect(() => {
    const saved = getStoredSecret();
    if (saved) {
      setSecretInput(saved);
      adminFetch('/api/admin/overview')
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('jetpesa_admin_secret');
          }
        })
        .catch(() => {});
    }
  }, [adminFetch]);

  // Polling loop when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    loadRoundsRadar();
    loadOverview();

    pollTimerRef.current = setInterval(() => {
      loadRoundsRadar();
      if (activeTab === 'overview') loadOverview();
      else if (activeTab === 'bets') loadBets();
      else if (activeTab === 'ledger') loadLedger();
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isAuthenticated, activeTab, loadRoundsRadar, loadOverview, loadBets, loadLedger]);

  // Tab switch loader
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'radar') loadRoundsRadar();
    else if (activeTab === 'overview') loadOverview();
    else if (activeTab === 'users') loadUsers(userSearch);
    else if (activeTab === 'bets') loadBets();
    else if (activeTab === 'ledger') loadLedger();
  }, [activeTab, isAuthenticated, loadRoundsRadar, loadOverview, loadUsers, loadBets, loadLedger, userSearch]);

  // Save Round Override
  const submitRoundOverride = async () => {
    try {
      const targetPoint = overrideModal.newPoint ? parseFloat(overrideModal.newPoint) : null;
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleIndex: overrideModal.cycleIndex,
          crashPoint: targetPoint,
          note: 'Set via Super Admin Panel',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Override failed.');
      showToast(data.message);
      setOverrideModal({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' });
      loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Instant Crash Current Active Flight Round
  const handleInstantCrash = async () => {
    const curRoundId = inFlightStats?.roundId || currentCycleState?.currentCycleIndex || currentCycleState?.cycleIndex;
    if (!curRoundId) return;

    if (inFlightStats?.hasCrashed) {
      showToast('Current round has already ended.', 'error');
      return;
    }

    setInstantCrashing(true);
    try {
      const curMultiplier = inFlightStats?.multiplier || currentCycleState?.currentMultiplier || 1.0;
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleIndex: curRoundId,
          instantCrash: true,
          crashPoint: inFlightStats?.isBettingPhase ? 1.0 : curMultiplier,
          note: 'Instant crash triggered via Admin Cockpit',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Instant crash failed.');
      showToast(data.message || `🚨 Round #${curRoundId} instantly crashed!`);
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setInstantCrashing(false);
    }
  };

  // Submit User Balance Adjustment
  const submitBalanceAdjustment = async () => {
    try {
      const amt = parseFloat(adjustModal.amount);
      if (isNaN(amt) || amt === 0) throw new Error('Enter a valid non-zero amount.');
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adjustModal.user.id,
          amount: amt,
          reason: adjustModal.reason || 'Admin manual balance adjustment',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Adjustment failed.');
      showToast(data.message);
      setAdjustModal({ open: false, user: null, amount: '', reason: '' });
      loadUsers(userSearch);
      loadOverview();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  UNAUTHENTICATED GATE                                                    */
  /* ------------------------------------------------------------------------ */
  if (!isAuthenticated) {
    return (
      <main className="jp-admin-login-wrap">
        <div className="jp-admin-login-box">
          <div className="jp-admin-logo-head">
            <div className="jp-admin-emblem">⚡</div>
            <h2>JETPESA COMMAND DECK</h2>
            <p>Super Admin Oracle & Multi-Round Controller</p>
          </div>

          <form onSubmit={handleLogin} className="jp-admin-login-form">
            <label>ENTER MASTER ADMIN SECRET KEY</label>
            <input
              type="password"
              placeholder="e.g. jetpesa_super_admin_2026"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              autoFocus
              required
            />
            {authError && <div className="jp-admin-auth-err">{authError}</div>}
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'AUTHENTICATING...' : 'ENTER SECURE CONSOLE →'}
            </button>
          </form>

          <div className="jp-admin-login-foot">
            <Link href="/dashboard">← Back to Player Cockpit</Link>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{
          __html: `
          body { margin: 0; background: #030712; color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
          .jp-admin-login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at top, #1e1b4b 0%, #070913 50%, #020617 100%); }
          .jp-admin-login-box { width: 100%; max-width: 440px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(225, 29, 72, 0.3); border-radius: 20px; padding: 36px 28px; box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 35px rgba(225,29,72,0.15); backdrop-filter: blur(16px); }
          .jp-admin-logo-head { text-align: center; margin-bottom: 28px; }
          .jp-admin-emblem { width: 56px; height: 56px; line-height: 56px; margin: 0 auto 12px; background: linear-gradient(135deg, #e11d48, #be123c); border-radius: 16px; font-size: 26px; box-shadow: 0 8px 25px rgba(225,29,72,0.4); }
          .jp-admin-logo-head h2 { margin: 0 0 6px; font-size: 20px; font-weight: 900; letter-spacing: 0.05em; color: #fff; }
          .jp-admin-logo-head p { margin: 0; font-size: 12px; color: #94a3b8; }
          .jp-admin-login-form label { display: block; font-size: 10px; font-weight: 800; color: #cbd5e1; letter-spacing: 0.08em; margin-bottom: 8px; }
          .jp-admin-login-form input { width: 100%; padding: 14px 16px; background: #090d16; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none; margin-bottom: 16px; transition: border-color .2s; }
          .jp-admin-login-form input:focus { border-color: #e11d48; box-shadow: 0 0 0 3px rgba(225,29,72,0.25); }
          .jp-admin-login-form button { width: 100%; padding: 14px; background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; border: none; border-radius: 12px; font-weight: 900; font-size: 13px; letter-spacing: 0.05em; cursor: pointer; transition: transform .15s, opacity .15s; }
          .jp-admin-login-form button:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.95; }
          .jp-admin-auth-err { background: rgba(225,29,72,0.15); border: 1px solid rgba(225,29,72,0.4); color: #fda4af; padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 700; margin-bottom: 14px; text-align: center; }
          .jp-admin-login-foot { text-align: center; margin-top: 24px; }
          .jp-admin-login-foot a { color: #64748b; font-size: 12px; text-decoration: none; font-weight: 700; }
          .jp-admin-login-foot a:hover { color: #cbd5e1; }
        ` }} />
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  AUTHENTICATED ADMIN COCKPIT                                             */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="jp-admin-app">
      {/* Toast Notification */}
      {toast && (
        <div className={`jp-admin-toast jp-admin-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Top Admin Header */}
      <header className="jp-admin-header">
        <div className="jp-admin-brand">
          <span className="jp-admin-pill">SUPER ADMIN</span>
          <h1>JETPESA ORACLE</h1>
        </div>

        {/* Live Flight Telemetry Indicator */}
        <div className="jp-admin-telemetry">
          {currentCycleState ? (
            <div className="jp-admin-live-badge">
              <span className="jp-pulse-dot" />
              <span>ROUND #{currentCycleState.currentCycleIndex || currentCycleState.cycleIndex}</span>
              <span className="jp-tele-divider">|</span>
              <span style={{ color: currentCycleState.hasCrashed ? '#f43f5e' : currentCycleState.isBettingPhase ? '#fbbf24' : '#22c55e', fontWeight: 900 }}>
                {currentCycleState.hasCrashed
                  ? `CRASHED @ ${(currentCycleState.crashPoint || currentCycleState.currentCrashPoint || currentCycleState.currentMultiplier || 1.0).toFixed(2)}x`
                  : currentCycleState.isBettingPhase
                  ? 'COUNTDOWN'
                  : `FLYING @ ${(currentCycleState.currentMultiplier || currentCycleState.multiplier || 1.0).toFixed(2)}x`}
              </span>
            </div>
          ) : (
            <div className="jp-admin-live-badge">Connecting to Game Engine...</div>
          )}
        </div>

        <div className="jp-admin-head-actions">
          <Link href="/dashboard" className="jp-admin-dash-link" target="_blank">
            Open Player UI ↗
          </Link>
          <button onClick={handleLogout} className="jp-admin-logout-btn">
            Log Out
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="jp-admin-tabs">
        <button
          className={`jp-admin-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          🎯 Flight Radar & Next Rounds
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Treasury & Platform Health
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Players & Wallets
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'bets' ? 'active' : ''}`}
          onClick={() => setActiveTab('bets')}
        >
          🎲 Live Bets Log
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          💳 M-Pesa In/Out Ledger
        </button>
      </nav>

      {/* Main Container */}
      <main className="jp-admin-body">
        {/* ================================================================= */}
        {/* TAB 1: FLIGHT RADAR & NEXT ROUNDS ORACLE                          */}
        {/* ================================================================= */}
        {activeTab === 'radar' && (
          <div className="jp-admin-radar-view">
            {/* Last 5 Crash Points (History) */}
            <section className="jp-admin-history-strip">
              <div className="jp-history-strip-header">
                <div className="jp-history-strip-title">
                  <span className="jp-history-clock-icon">🕒</span>
                  <h3>Past Flight Outcomes (Last 5 Crash Points)</h3>
                </div>
                <span className="jp-panel-note">Live cryptographic historical audit tape</span>
              </div>

              {pastRoundsData.length === 0 ? (
                <div className="jp-history-empty">
                  <span>Awaiting initial round completions...</span>
                </div>
              ) : (
                <div className="jp-history-cards-grid">
                  {pastRoundsData.map((pr) => (
                    <div key={pr.cycleIndex} className={`jp-history-card border-${pr.category.toLowerCase()}`}>
                      <div className="jp-history-card-top">
                        <span className="jp-history-round-label">Round #{pr.cycleIndex}</span>
                        <span className={`jp-cat-badge badge-${pr.category.toLowerCase()}`}>
                          {pr.category}
                        </span>
                      </div>
                      <div className="jp-history-card-body">
                        <span className={`jp-history-mult-num mult-${pr.category.toLowerCase()}`}>
                          {pr.crashPoint.toFixed(2)}x
                        </span>
                      </div>
                      <div className="jp-history-card-footer">
                        <span className="jp-history-ago">Ended ~{pr.completedAgoSeconds}s ago</span>
                        {pr.isOverridden ? (
                          <span className="jp-tag-override-sm">Overridden</span>
                        ) : (
                          <span className="jp-tag-natural-sm">Provably Fair</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Middle Row: Minimized In-Flight Telemetry (Left) + Daily Platform Financials & Pay-Ins/Payouts (Right) */}
            <div className="jp-middle-split-row">
              {/* LEFT: Minimized In-Flight Telemetry */}
              <section className="jp-admin-panel jp-inflight-min-panel">
                <div className="jp-panel-header">
                  <div className="jp-history-strip-title">
                    <span className="jp-history-clock-icon">🛩️</span>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Round #{inFlightStats?.roundId || currentCycleState?.currentCycleIndex || '—'}
                        {inFlightStats?.isBettingPhase ? (
                          <span className="jp-status-pill pill-active">⏱ COUNTDOWN</span>
                        ) : inFlightStats?.hasCrashed ? (
                          <span className="jp-status-pill pill-crashed">✕ CRASHED @ {inFlightStats?.crashPoint?.toFixed(2)}x</span>
                        ) : (
                          <span className="jp-status-pill pill-live">● FLYING @ {(inFlightStats?.multiplier || currentCycleState?.currentMultiplier || 1.0).toFixed(2)}x</span>
                        )}
                      </h3>
                    </div>
                  </div>

                  {/* Midway: Instant Crash Button */}
                  <div className="jp-instant-crash-midway">
                    <button
                      className="jp-btn-instant-crash"
                      disabled={inFlightStats?.hasCrashed || instantCrashing}
                      onClick={handleInstantCrash}
                      title="Immediately crash active flight round"
                    >
                      {instantCrashing ? 'CRASHING...' : inFlightStats?.hasCrashed ? '✕ CRASHED' : '🚨 CRASH NOW'}
                    </button>
                  </div>

                  <span className="jp-tag-natural" style={{ fontSize: '8.5px', color: '#38bdf8' }}>
                    Real Pilots
                  </span>
                </div>

                {/* Minimized KPIs: 2x2 grid */}
                <div className="jp-inflight-kpi-grid-min">
                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL PILOTS</span>
                    <div className="jp-kpi-val text-white" style={{ fontSize: '15px' }}>
                      {inFlightStats?.totalPilots || 0}
                    </div>
                    <small>{inFlightStats?.activePilots || 0} flying • {inFlightStats?.cashedOutPilots || 0} won</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL WAGERED</span>
                    <div className="jp-kpi-val text-amber" style={{ fontSize: '15px' }}>
                      KES {(inFlightStats?.totalStaked || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>Active: KES {(inFlightStats?.activeStaked || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL PAYOUTS WON</span>
                    <div className="jp-kpi-val text-green" style={{ fontSize: '15px' }}>
                      KES {(inFlightStats?.totalWon || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>{inFlightStats?.cashedOutPilots || 0} cashed out</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">HOUSE NET ROUND</span>
                    <div className={`jp-kpi-val ${(inFlightStats?.netHouseMargin || 0) >= 0 ? 'text-cyan' : 'text-rose'}`} style={{ fontSize: '15px' }}>
                      {(inFlightStats?.netHouseMargin || 0) >= 0 ? '+' : ''}KES {(inFlightStats?.netHouseMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>{(inFlightStats?.netHouseMargin || 0) >= 0 ? 'House Profit' : 'House Deficit'}</small>
                  </div>
                </div>

                {/* Real Pilots Scrollable Stream */}
                {(!inFlightStats?.bets || inFlightStats.bets.length === 0) ? (
                  <div className="jp-inflight-empty-min">
                    <span>📡 Listening for real pilot wagers in Round #{inFlightStats?.roundId || currentCycleState?.currentCycleIndex}...</span>
                  </div>
                ) : (
                  <div className="jp-table-wrap jp-inflight-scroll">
                    <table className="jp-admin-table">
                      <thead>
                        <tr>
                          <th>Pilot</th>
                          <th>Deck</th>
                          <th>Stake</th>
                          <th>Multiplier</th>
                          <th>Status</th>
                          <th>Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inFlightStats.bets.map((bet) => {
                          const isFlying = bet.status === 'ACTIVE' && !inFlightStats.hasCrashed && !inFlightStats.isBettingPhase;
                          const curValue = isFlying ? (bet.stake * (inFlightStats.multiplier || 1.0)) : bet.winAmount;
                          return (
                            <tr key={bet.id}>
                              <td><strong>{bet.userPhone || bet.userName}</strong></td>
                              <td><span className="jp-deck-pill">D-{bet.deck}</span></td>
                              <td>KES {bet.stake.toFixed(2)}</td>
                              <td>
                                {bet.multiplier ? (
                                  <span className="jp-table-mult text-green">{bet.multiplier.toFixed(2)}x</span>
                                ) : isFlying ? (
                                  <span className="jp-table-mult text-amber">{(inFlightStats.multiplier || 1.0).toFixed(2)}x</span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>—</span>
                                )}
                              </td>
                              <td>
                                {bet.status === 'WON' ? (
                                  <span className="jp-status-pill pill-won">CASHED</span>
                                ) : bet.status === 'CRASHED' || bet.status === 'LOST' ? (
                                  <span className="jp-status-pill pill-crashed">CRASHED</span>
                                ) : isFlying ? (
                                  <span className="jp-status-pill pill-live">FLYING</span>
                                ) : (
                                  <span className="jp-status-pill pill-active">WAIT</span>
                                )}
                              </td>
                              <td>
                                {bet.status === 'WON' ? (
                                  <span style={{ color: '#22c55e', fontWeight: 900 }}>+{bet.winAmount.toFixed(2)}</span>
                                ) : isFlying ? (
                                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>Est. {curValue.toFixed(2)}</span>
                                ) : (
                                  <span style={{ color: '#f43f5e' }}>-{bet.stake.toFixed(2)}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* RIGHT: Daily Statistics & Real Pay-Ins / Payouts */}
              <section className="jp-admin-panel jp-daily-panel">
                <div className="jp-panel-header">
                  <div className="jp-history-strip-title">
                    <span className="jp-history-clock-icon">💳</span>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Daily Performance & Real M-Pesa Flow
                      </h3>
                    </div>
                  </div>

                  {/* Date Selector & Today Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setSelectedDate(newDate);
                        loadRoundsRadar(newDate);
                      }}
                      className="jp-date-picker-input"
                    />
                    {!dailyStats?.isToday && (
                      <button
                        className="jp-sm-btn"
                        style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8', color: '#38bdf8' }}
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setSelectedDate(today);
                          loadRoundsRadar(today);
                        }}
                      >
                        Today ↩
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Financial KPIs in 2x2 Grid */}
                <div className="jp-inflight-kpi-grid-min">
                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #22c55e' }}>
                    <span className="jp-kpi-sublabel">REAL PAY-INS (DEPOSITS)</span>
                    <div className="jp-kpi-val text-green" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.depositsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{dailyStats?.depositsCount || 0} M-Pesa payments</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #f43f5e' }}>
                    <span className="jp-kpi-sublabel">REAL PAYOUTS (WITHDRAWALS)</span>
                    <div className="jp-kpi-val text-rose" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.withdrawalsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{dailyStats?.withdrawalsCount || 0} completed payouts</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: `3px solid ${(dailyStats?.netCashflow || 0) >= 0 ? '#38bdf8' : '#f43f5e'}` }}>
                    <span className="jp-kpi-sublabel">NET CASHFLOW (IN - OUT)</span>
                    <div className={`jp-kpi-val ${(dailyStats?.netCashflow || 0) >= 0 ? 'text-cyan' : 'text-rose'}`} style={{ fontSize: '15px' }}>
                      {(dailyStats?.netCashflow || 0) >= 0 ? '+' : ''}KES {(dailyStats?.netCashflow || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{(dailyStats?.netCashflow || 0) >= 0 ? 'Net Inflow Surplus' : 'Net Outflow Deficit'}</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #fbbf24' }}>
                    <span className="jp-kpi-sublabel">GAMING GROSS REVENUE (GGR)</span>
                    <div className="jp-kpi-val text-amber" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.grossGamingRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>Wagered: KES {(dailyStats?.wageredTotal || 0).toFixed(0)} • Won: KES {(dailyStats?.wonTotal || 0).toFixed(0)}</small>
                  </div>
                </div>

                {/* Sub-tabs / Mini transactions stream */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'summary' ? 'active' : ''}`}
                      onClick={() => setDailyTab('summary')}
                    >
                      Summary View
                    </button>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'payins' ? 'active' : ''}`}
                      onClick={() => setDailyTab('payins')}
                    >
                      Pay-Ins ({dailyStats?.recentPayIns?.length || 0})
                    </button>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'payouts' ? 'active' : ''}`}
                      onClick={() => setDailyTab('payouts')}
                    >
                      Payouts ({dailyStats?.recentPayouts?.length || 0})
                    </button>
                  </div>

                  {dailyTab === 'summary' && (
                    <div className="jp-daily-summary-box">
                      <div className="jp-summary-line">
                        <span>Active Betting Rounds:</span>
                        <strong>{dailyStats?.betsCount || 0} real wagers recorded</strong>
                      </div>
                      <div className="jp-summary-line">
                        <span>Total Real Money Cycled:</span>
                        <strong>KES {((dailyStats?.depositsTotal || 0) + (dailyStats?.withdrawalsTotal || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="jp-summary-line">
                        <span>Date Query:</span>
                        <code style={{ color: '#38bdf8' }}>{dailyStats?.date || selectedDate} {dailyStats?.isToday ? '(Today)' : ''}</code>
                      </div>
                    </div>
                  )}

                  {dailyTab === 'payins' && (
                    (!dailyStats?.recentPayIns || dailyStats.recentPayIns.length === 0) ? (
                      <div className="jp-inflight-empty-min">No M-Pesa pay-ins found for {selectedDate}.</div>
                    ) : (
                      <div className="jp-table-wrap jp-inflight-scroll">
                        <table className="jp-admin-table">
                          <thead>
                            <tr>
                              <th>Receipt</th>
                              <th>User</th>
                              <th>Amount</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyStats.recentPayIns.map((p) => (
                              <tr key={p.id}>
                                <td><code style={{ color: '#a7f3d0' }}>{p.receipt || p.id.slice(0, 8)}</code></td>
                                <td>{p.phone}</td>
                                <td><strong className="text-green">+KES {p.amount.toFixed(2)}</strong></td>
                                <td><span className="jp-history-ago">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {dailyTab === 'payouts' && (
                    (!dailyStats?.recentPayouts || dailyStats.recentPayouts.length === 0) ? (
                      <div className="jp-inflight-empty-min">No M-Pesa payouts found for {selectedDate}.</div>
                    ) : (
                      <div className="jp-table-wrap jp-inflight-scroll">
                        <table className="jp-admin-table">
                          <thead>
                            <tr>
                              <th>Receipt / ID</th>
                              <th>Recipient</th>
                              <th>Amount</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyStats.recentPayouts.map((w) => (
                              <tr key={w.id}>
                                <td><code style={{ color: '#fecdd3' }}>{w.receipt || w.id.slice(0, 8)}</code></td>
                                <td>{w.phone}</td>
                                <td><strong className="text-rose">-KES {w.amount.toFixed(2)}</strong></td>
                                <td><span className="jp-history-ago">{new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>

            {/* Flight Departure Schedule (Next 6 Rounds) */}
            <section className="jp-admin-history-strip">
              <div className="jp-history-strip-header">
                <div className="jp-history-strip-title">
                  <span className="jp-history-clock-icon">🚀</span>
                  <h3>Flight Departure Schedule (Next 6 Rounds)</h3>
                </div>
                <span className="jp-panel-note">Live updating every 2.5s</span>
              </div>

              {roundsData.length === 0 ? (
                <div className="jp-history-empty">
                  <span>Calculating upcoming departure sequence...</span>
                </div>
              ) : (
                <div className="jp-history-cards-grid">
                  {roundsData.slice(0, 6).map((r) => (
                    <div
                      key={r.cycleIndex}
                      className={`jp-history-card border-${r.category.toLowerCase()} ${r.isCurrent ? 'jp-card-live' : ''}`}
                    >
                      <div className="jp-history-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span className="jp-history-round-label">Round #{r.cycleIndex}</span>
                          {r.isCurrent ? (
                            <span className="jp-status-pill pill-live">● LIVE</span>
                          ) : (
                            <span className="jp-status-pill pill-queued">⏱ ~{r.secondsUntilDeparture}s</span>
                          )}
                        </div>
                        <span className={`jp-cat-badge badge-${r.category.toLowerCase()}`}>
                          {r.category}
                        </span>
                      </div>
                      <div className="jp-history-card-body">
                        <span className={`jp-history-mult-num mult-${r.category.toLowerCase()}`}>
                          {r.crashPoint.toFixed(2)}x
                        </span>
                      </div>
                      <div className="jp-history-card-footer">
                        {r.isOverridden ? (
                          <span className="jp-tag-override-sm">Overridden</span>
                        ) : (
                          <span className="jp-tag-natural-sm">Provably Fair</span>
                        )}
                        <button
                          className="jp-sm-btn"
                          onClick={() => setOverrideModal({
                            open: true,
                            cycleIndex: r.cycleIndex,
                            currentPoint: r.crashPoint,
                            newPoint: r.crashPoint.toString(),
                          })}
                        >
                          Set Multiplier
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: TREASURY & PLATFORM HEALTH                                 */}
        {/* ================================================================= */}
        {activeTab === 'overview' && overviewData && (
          <div className="jp-admin-overview-view">
            {/* KPI Cards */}
            <div className="jp-kpi-grid">
              <div className="jp-kpi-card">
                <label>PRINT-PAY B2C FLOAT (M-PESA)</label>
                <div className="jp-kpi-val text-cyan">
                  {overviewData.stats.printPayBalance !== null
                    ? `KES ${overviewData.stats.printPayBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : 'Connecting...'}
                </div>
                <small>Ready for instant player cashout withdrawals</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL PLAYER LIABILITIES</label>
                <div className="jp-kpi-val text-amber">
                  KES {overviewData.stats.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>Sum of active balances in public.users</small>
              </div>

              <div className="jp-kpi-card">
                <label>GROSS GAMING REVENUE (GGR)</label>
                <div className={`jp-kpi-val ${overviewData.stats.grossGamingRevenue >= 0 ? 'text-green' : 'text-rose'}`}>
                  KES {overviewData.stats.grossGamingRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>Total Staked ({overviewData.stats.totalWagered.toLocaleString()}) minus Total Won ({overviewData.stats.totalWon.toLocaleString()})</small>
              </div>

              <div className="jp-kpi-card">
                <label>REGISTERED PLAYERS</label>
                <div className="jp-kpi-val text-white">
                  {overviewData.stats.totalUsers.toLocaleString()}
                </div>
                <small>Verified M-Pesa accounts in database</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL COMPLETED DEPOSITS</label>
                <div className="jp-kpi-val text-green">
                  KES {overviewData.stats.totalDepositsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>{overviewData.stats.totalDepositsCount} M-Pesa transactions credited</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL COMPLETED WITHDRAWALS</label>
                <div className="jp-kpi-val text-rose">
                  KES {overviewData.stats.totalWithdrawalsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>{overviewData.stats.totalWithdrawalsCount} successful B2C payouts</small>
              </div>
            </div>

            {/* Provably Fair Parameters Card */}
            <section className="jp-admin-panel" style={{ marginTop: 24 }}>
              <div className="jp-panel-header">
                <h3>Cryptographic Engine Parameters</h3>
              </div>
              <div className="jp-crypto-params">
                <div className="jp-param-line">
                  <strong>Server Seed SHA-256 Hash:</strong>
                  <code>{overviewData.game.serverSeedHash}</code>
                </div>
                <div className="jp-param-line">
                  <strong>Client Seed Anchor:</strong>
                  <code>{overviewData.game.clientSeed}</code>
                </div>
                <div className="jp-param-line">
                  <strong>House Edge:</strong>
                  <code>3.00% (Instant 1.00x crash allocation on h % 33 == 0)</code>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PLAYERS & WALLETS                                          */}
        {/* ================================================================= */}
        {activeTab === 'users' && (
          <div className="jp-admin-users-view">
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Player Directory & Wallet Management</h3>
                <div className="jp-search-box">
                  <input
                    type="text"
                    placeholder="Search phone, name, email..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      loadUsers(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Phone / ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Wallet Balance</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No players found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      usersData.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.phone || u.id.slice(0, 8)}</strong>
                          </td>
                          <td>{u.displayName || '—'}</td>
                          <td>{u.email || '—'}</td>
                          <td>
                            <strong style={{ color: '#22c55e' }}>
                              KES {u.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                          </td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="jp-sm-btn"
                              onClick={() => setAdjustModal({ open: true, user: u, amount: '', reason: '' })}
                            >
                              Adjust Balance ±
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: LIVE BETS LOG                                              */}
        {/* ================================================================= */}
        {activeTab === 'bets' && (
          <div className="jp-admin-bets-view">
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Recent Live Wagers (All Players)</h3>
                <button className="jp-sm-btn" onClick={loadBets}>Refresh Feed</button>
              </div>

              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Round #</th>
                      <th>Player</th>
                      <th>Deck</th>
                      <th>Stake</th>
                      <th>Auto Cashout</th>
                      <th>Cashout Mult</th>
                      <th>Payout</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {betsData.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No wagers recorded yet.
                        </td>
                      </tr>
                    ) : (
                      betsData.map((b) => (
                        <tr key={b.id}>
                          <td><strong>#{b.roundId}</strong></td>
                          <td>{b.userPhone || b.userName}</td>
                          <td><span className="jp-deck-pill">Deck {b.deck}</span></td>
                          <td>KES {b.stake.toLocaleString()}</td>
                          <td>{b.autoCashout ? `${b.autoCashout.toFixed(2)}x` : '—'}</td>
                          <td>{b.multiplier ? `${b.multiplier.toFixed(2)}x` : '—'}</td>
                          <td>
                            {b.winAmount > 0 ? (
                              <strong style={{ color: '#22c55e' }}>+KES {b.winAmount.toLocaleString()}</strong>
                            ) : (
                              '0 KES'
                            )}
                          </td>
                          <td>
                            <span className={`jp-status-pill pill-${b.status.toLowerCase()}`}>
                              {b.status}
                            </span>
                          </td>
                          <td>{new Date(b.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: M-PESA IN/OUT LEDGER                                       */}
        {/* ================================================================= */}
        {activeTab === 'ledger' && (
          <div className="jp-admin-ledger-view">
            {/* Deposits Table */}
            <section className="jp-admin-panel" style={{ marginBottom: 24 }}>
              <div className="jp-panel-header">
                <h3>Recent M-Pesa Deposits (C2B / STK Push)</h3>
              </div>
              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Phone</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Credited</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.deposits.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No deposits recorded.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.deposits.map((d) => (
                        <tr key={d.id}>
                          <td><strong>{d.receipt || 'PENDING'}</strong></td>
                          <td>{d.phone}</td>
                          <td><strong style={{ color: '#22c55e' }}>KES {d.amount.toLocaleString()}</strong></td>
                          <td><span className={`jp-status-pill pill-${d.status.toLowerCase()}`}>{d.status}</span></td>
                          <td>{d.credited ? '✓ YES' : '✗ NO'}</td>
                          <td>{new Date(d.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Withdrawals Table */}
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Recent M-Pesa Withdrawals (B2C Automated Payouts)</h3>
              </div>
              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Phone</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Failure Reason</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No withdrawals recorded.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.withdrawals.map((w) => (
                        <tr key={w.id}>
                          <td><strong>{w.receipt || 'PROCESSING'}</strong></td>
                          <td>{w.phone}</td>
                          <td><strong style={{ color: '#f43f5e' }}>KES {w.amount.toLocaleString()}</strong></td>
                          <td><span className={`jp-status-pill pill-${w.status.toLowerCase()}`}>{w.status}</span></td>
                          <td>{w.failureReason || '—'}</td>
                          <td>{new Date(w.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* MODAL: OVERRIDE ROUND MULTIPLIER                                  */}
      {/* ================================================================= */}
      {overrideModal.open && (
        <div className="jp-modal-overlay">
          <div className="jp-modal-box">
            <div className="jp-modal-head">
              <h3>Override Crash Point for Round #{overrideModal.cycleIndex}</h3>
              <button onClick={() => setOverrideModal({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' })}>✕</button>
            </div>

            <div className="jp-modal-content">
              <p>
                Set a specific crash multiplier for this upcoming flight. The game engine and all connected clients will honor this exact target.
              </p>

              <label>CUSTOM CRASH MULTIPLIER (1.00x - 10,000.00x):</label>
              <input
                type="number"
                step="0.01"
                min="1.00"
                max="10000.00"
                placeholder="e.g. 250.00, 1000.00, or 1.00"
                value={overrideModal.newPoint}
                onChange={(e) => setOverrideModal({ ...overrideModal, newPoint: e.target.value })}
              />

              <div className="jp-quick-mults">
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '1.00' })}>Instant 1.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '2.50' })}>2.50x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '10.00' })}>10.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '50.00' })}>50.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '100.00' })}>100.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '250.00' })}>250.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '500.00' })}>500.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '1000.00' })}>1,000.00x</button>
              </div>

              <div className="jp-modal-actions">
                <button
                  className="jp-btn-revert"
                  onClick={() => {
                    setOverrideModal({ ...overrideModal, newPoint: 'reset' });
                    submitRoundOverride();
                  }}
                >
                  Revert to Provably Fair Seed
                </button>
                <button className="jp-btn-save" onClick={submitRoundOverride}>
                  Confirm Override →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ADJUST USER WALLET BALANCE                                 */}
      {/* ================================================================= */}
      {adjustModal.open && adjustModal.user && (
        <div className="jp-modal-overlay">
          <div className="jp-modal-box">
            <div className="jp-modal-head">
              <h3>Adjust Balance: {adjustModal.user.phone || adjustModal.user.displayName}</h3>
              <button onClick={() => setAdjustModal({ open: false, user: null, amount: '', reason: '' })}>✕</button>
            </div>

            <div className="jp-modal-content">
              <p>
                Current Balance: <strong>KES {adjustModal.user.walletBalance.toFixed(2)}</strong>
              </p>

              <label>AMOUNT TO CREDIT (+) OR DEBIT (-) IN KES:</label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 500 or -200"
                value={adjustModal.amount}
                onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })}
              />

              <label style={{ marginTop: 12 }}>REASON / AUDIT NOTE:</label>
              <input
                type="text"
                placeholder="e.g. Manual M-Pesa verification bonus"
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
              />

              <div className="jp-modal-actions">
                <button className="jp-btn-save" onClick={submitBalanceAdjustment}>
                  Apply Adjustment →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Admin Panel */}
      <style dangerouslySetInnerHTML={{
        __html: `
        body { margin: 0; background: #030712; color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 11.5px; }
        .jp-admin-app { min-height: 100vh; background: #030712; display: flex; flex-direction: column; font-size: 11.5px; }
        
        /* Header */
        .jp-admin-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px); flex-wrap: wrap; gap: 10px; }
        .jp-admin-brand { display: flex; align-items: center; gap: 8px; }
        .jp-admin-brand h1 { margin: 0; font-size: 13px; font-weight: 900; letter-spacing: 0.05em; color: #fff; }
        .jp-admin-pill { background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; font-size: 8.5px; font-weight: 900; padding: 2px 6px; border-radius: 999px; }
        
        .jp-admin-telemetry { display: flex; align-items: center; }
        .jp-admin-live-badge { display: flex; align-items: center; gap: 6px; background: #090d16; border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 800; }
        .jp-pulse-dot { width: 7px; height: 7px; border-radius: 999px; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: jpBlink 1.2s infinite; }
        .jp-tele-divider { color: #475569; }

        .jp-admin-head-actions { display: flex; align-items: center; gap: 8px; }
        .jp-admin-dash-link { color: #38bdf8; text-decoration: none; font-size: 10.5px; font-weight: 800; padding: 5px 10px; border-radius: 6px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); }
        .jp-admin-logout-btn { background: #1f2937; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1); padding: 5px 11px; border-radius: 6px; font-size: 10.5px; font-weight: 800; cursor: pointer; }

        /* Tabs */
        .jp-admin-tabs { display: flex; gap: 5px; padding: 8px 20px; background: #080d1a; border-bottom: 1px solid rgba(255,255,255,0.05); overflow-x: auto; }
        .jp-admin-tab-btn { background: transparent; border: none; color: #94a3b8; font-size: 11.5px; font-weight: 800; padding: 7px 14px; border-radius: 8px; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .jp-admin-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.04); }
        .jp-admin-tab-btn.active { color: #fff; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }

        /* Body */
        .jp-admin-body { padding: 18px 20px; max-width: 1400px; width: 100%; margin: 0 auto; box-sizing: border-box; }

        /* Spotlight Card */
        .jp-admin-spotlight-card { display: flex; align-items: center; justify-content: space-between; background: radial-gradient(circle at top left, #1e1b4b 0%, #0f172a 60%, #070a14 100%); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 14px; padding: 18px 24px; margin-bottom: 18px; box-shadow: 0 16px 36px rgba(0,0,0,0.55); flex-wrap: wrap; gap: 16px; }
        .jp-spotlight-left { max-width: 420px; }
        .jp-spotlight-tag { font-size: 9px; font-weight: 900; color: #818cf8; letter-spacing: 0.1em; display: block; margin-bottom: 4px; }
        .jp-spotlight-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
        .jp-spotlight-title h2 { margin: 0; font-size: 20px; font-weight: 900; color: #fff; }
        .jp-spotlight-timer { font-size: 11px; font-weight: 800; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 999px; }
        .jp-spotlight-desc { margin: 0; font-size: 10.5px; color: #94a3b8; line-height: 1.4; }

        .jp-spotlight-mult-box { text-align: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 22px; min-width: 160px; }
        .jp-spotlight-label { font-size: 9px; font-weight: 900; color: #64748b; letter-spacing: 0.08em; display: block; margin-bottom: 3px; }
        .jp-spotlight-mult-val { font-size: 32px; font-weight: 950; display: block; line-height: 1; margin-bottom: 6px; font-family: system-ui, sans-serif; }
        
        .jp-cat-badge { display: inline-block; font-size: 8.5px; font-weight: 900; padding: 2px 7px; border-radius: 999px; }
        .badge-instant { background: #374151; color: #9ca3af; }
        .badge-low { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
        .badge-high { background: rgba(168, 85, 247, 0.18); color: #c084fc; }
        .badge-mega { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

        .mult-instant { color: #9ca3af; }
        .mult-low { color: #60a5fa; }
        .mult-high { color: #c084fc; }
        .mult-mega { color: #fbbf24; text-shadow: 0 0 16px rgba(245,158,11,0.5); }

        .jp-spotlight-right { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .jp-override-active-badge { text-align: right; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); padding: 6px 11px; border-radius: 8px; color: #fda4af; font-size: 10.5px; font-weight: 800; }
        .jp-override-active-badge small { display: block; font-size: 9px; color: #f43f5e; margin-top: 2px; }
        .jp-override-natural-badge { text-align: right; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); padding: 6px 11px; border-radius: 8px; color: #86efac; font-size: 10.5px; font-weight: 800; }
        .jp-override-natural-badge small { display: block; font-size: 9px; color: #4ade80; margin-top: 2px; }
        .jp-override-trigger-btn { background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; border: none; padding: 7px 14px; border-radius: 8px; font-size: 11.5px; font-weight: 800; cursor: pointer; transition: transform .15s; }
        .jp-override-trigger-btn:hover { transform: translateY(-1px); }

        /* History Strip (Last 5 Crash Points) */
        .jp-admin-history-strip { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 14px 18px; margin-bottom: 18px; backdrop-filter: blur(10px); }
        .jp-history-strip-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
        .jp-history-strip-title { display: flex; align-items: center; gap: 6px; }
        .jp-history-strip-title h3 { margin: 0; font-size: 12.5px; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
        .jp-history-clock-icon { font-size: 13px; }
        .jp-history-cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .jp-history-card { background: rgba(4, 7, 15, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; transition: transform 0.15s, border-color 0.15s; }
        .jp-history-card:hover { transform: translateY(-1px); border-color: rgba(255, 255, 255, 0.2); }
        .jp-history-card.border-instant { border-left: 3px solid #6b7280; }
        .jp-history-card.border-low { border-left: 3px solid #60a5fa; }
        .jp-history-card.border-high { border-left: 3px solid #c084fc; }
        .jp-history-card.border-mega { border-left: 3px solid #fbbf24; }
        .jp-history-card.jp-card-live { background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.4); box-shadow: 0 0 16px rgba(34, 197, 94, 0.12); }
        .jp-history-card-top { display: flex; align-items: center; justify-content: space-between; }
        .jp-history-round-label { font-size: 9.5px; font-weight: 800; color: #94a3b8; }
        .jp-history-card-body { margin: 2px 0; }
        .jp-history-mult-num { font-size: 20px; font-weight: 950; font-family: system-ui, sans-serif; line-height: 1; }
        .jp-history-card-footer { display: flex; align-items: center; justify-content: space-between; font-size: 9px; color: #64748b; font-weight: 700; margin-top: 2px; }
        .jp-history-ago { color: #64748b; font-size: 8.5px; }
        .jp-tag-override-sm { background: rgba(244, 63, 94, 0.15); color: #fda4af; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 800; }
        .jp-tag-natural-sm { background: rgba(255,255,255,0.06); color: #94a3b8; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 700; }
        .jp-history-empty { text-align: center; padding: 14px; color: #64748b; font-size: 11px; }

        /* Middle Row: Side-by-side split (In-Flight Minimized + Daily Financials) */
        .jp-middle-split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; align-items: stretch; }
        @media (max-width: 980px) {
          .jp-middle-split-row { grid-template-columns: 1fr; }
        }
        .jp-inflight-min-panel { display: flex; flex-direction: column; border: 1px solid rgba(56, 189, 248, 0.2); background: radial-gradient(circle at top left, rgba(14, 165, 233, 0.04) 0%, rgba(15, 23, 42, 0.75) 100%); }
        .jp-daily-panel { display: flex; flex-direction: column; border: 1px solid rgba(168, 85, 247, 0.2); background: radial-gradient(circle at top right, rgba(168, 85, 247, 0.04) 0%, rgba(15, 23, 42, 0.75) 100%); }
        .jp-inflight-kpi-grid-min { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
        .jp-inflight-kpi-card { background: rgba(4, 7, 15, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 14px; }
        .jp-kpi-sublabel { font-size: 8.5px; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em; display: block; margin-bottom: 4px; }
        .jp-inflight-empty-min { text-align: center; padding: 16px 12px; background: rgba(4, 7, 15, 0.4); border: 1px dashed rgba(255, 255, 255, 0.08); border-radius: 8px; font-size: 10px; color: #64748b; margin-top: 8px; }
        .jp-inflight-scroll { max-height: 140px; overflow-y: auto; margin-top: 8px; }
        .jp-instant-crash-midway { display: flex; align-items: center; justify-content: center; }
        .jp-btn-instant-crash {
          background: linear-gradient(135deg, #e11d48, #9f1239);
          color: #fff;
          border: 1px solid rgba(244, 63, 94, 0.5);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.04em;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 0 10px rgba(225, 29, 72, 0.4);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .jp-btn-instant-crash:hover:not(:disabled) {
          background: linear-gradient(135deg, #f43f5e, #be123c);
          box-shadow: 0 0 16px rgba(244, 63, 94, 0.7);
          transform: translateY(-1px);
        }
        .jp-btn-instant-crash:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
          background: #1f2937;
          border-color: rgba(255, 255, 255, 0.1);
          color: #94a3b8;
        }
        .jp-date-picker-input { background: #090d16; border: 1px solid rgba(255, 255, 255, 0.12); color: #cbd5e1; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; outline: none; }
        .jp-mini-tab-btn { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 9.5px; font-weight: 800; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
        .jp-mini-tab-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
        .jp-mini-tab-btn.active { background: #1e293b; color: #fff; border-color: rgba(255, 255, 255, 0.2); }
        .jp-daily-summary-box { background: rgba(4, 7, 15, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 10.5px; }
        .jp-summary-line { display: flex; justify-content: space-between; align-items: center; }
        .jp-summary-line span { color: #94a3b8; }
        .jp-summary-line strong { color: #f8fafc; font-weight: 800; }

        /* Panels & Tables */
        .jp-admin-panel { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 16px 18px; backdrop-filter: blur(10px); }
        .jp-panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
        .jp-panel-header h3 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; }
        .jp-panel-note { font-size: 10px; color: #64748b; }

        .jp-table-wrap { overflow-x: auto; }
        .jp-admin-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
        .jp-admin-table th { padding: 9px 11px; background: rgba(0,0,0,0.3); color: #94a3b8; font-weight: 800; font-size: 9.5px; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .jp-admin-table td { padding: 9px 11px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #cbd5e1; }
        .jp-admin-table tr:hover { background: rgba(255,255,255,0.02); }
        .jp-admin-table tr.row-current { background: rgba(34, 197, 94, 0.06); border-left: 3px solid #22c55e; }

        .jp-table-mult { font-weight: 900; font-size: 12px; }
        .jp-tag-override { background: rgba(244, 63, 94, 0.15); color: #fda4af; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 800; }
        .jp-tag-natural { background: rgba(255,255,255,0.06); color: #94a3b8; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; }

        .jp-status-pill { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 900; }
        .pill-live { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .pill-queued { background: rgba(255,255,255,0.08); color: #94a3b8; }
        .pill-completed, .pill-won { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .pill-crashed, .pill-failed { background: rgba(244, 63, 94, 0.2); color: #fb7185; }
        .pill-active, .pill-pending { background: rgba(251, 191, 36, 0.2); color: #fde047; }
        .jp-deck-pill { background: #1e293b; color: #cbd5e1; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 800; }

        .jp-sm-btn { background: #1f2937; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; transition: background .15s; }
        .jp-sm-btn:hover { background: #374151; }

        /* KPI Grid */
        .jp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
        .jp-kpi-card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.3); }
        .jp-kpi-card label { display: block; font-size: 9px; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em; margin-bottom: 5px; }
        .jp-kpi-val { font-size: 18px; font-weight: 950; margin-bottom: 4px; }
        .jp-kpi-card small { display: block; font-size: 9.5px; color: #64748b; }
        .text-cyan { color: #38bdf8; }
        .text-amber { color: #fbbf24; }
        .text-green { color: #22c55e; }
        .text-rose { color: #f43f5e; }
        .text-white { color: #fff; }

        .jp-crypto-params { display: flex; flex-direction: column; gap: 8px; }
        .jp-param-line { font-size: 11px; display: flex; flex-direction: column; gap: 3px; }
        .jp-param-line code { background: #090d16; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 10.5px; color: #cbd5e1; word-break: break-all; }

        .jp-search-box input { background: #090d16; border: 1px solid rgba(255,255,255,0.12); padding: 6px 11px; border-radius: 8px; color: #fff; font-size: 11px; outline: none; width: 220px; }

        /* Modals */
        .jp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 99999; backdrop-filter: blur(8px); }
        .jp-modal-box { width: 100%; max-width: 440px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow: hidden; }
        .jp-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #131d35; }
        .jp-modal-head h3 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; }
        .jp-modal-head button { background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; }
        .jp-modal-content { padding: 18px; }
        .jp-modal-content p { margin: 0 0 12px; font-size: 11px; color: #94a3b8; line-height: 1.4; }
        .jp-modal-content label { display: block; font-size: 10px; font-weight: 800; color: #cbd5e1; margin-bottom: 5px; letter-spacing: 0.05em; }
        .jp-modal-content input { width: 100%; padding: 9px 11px; background: #090d16; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #fff; font-size: 12px; box-sizing: border-box; outline: none; }
        .jp-quick-mults { display: flex; gap: 5px; margin: 10px 0 16px; flex-wrap: wrap; }
        .jp-quick-mults button { background: #1e293b; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; }
        .jp-modal-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; }
        .jp-btn-revert { background: #1f2937; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 7px 12px; border-radius: 8px; font-size: 10.5px; font-weight: 800; cursor: pointer; }
        .jp-btn-save { background: linear-gradient(135deg, #e11d48, #be123c); border: none; color: #fff; padding: 7px 14px; border-radius: 8px; font-size: 10.5px; font-weight: 800; cursor: pointer; }

        /* Toast */
        .jp-admin-toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 16px; border-radius: 10px; font-size: 11.5px; font-weight: 800; z-index: 100000; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .jp-admin-toast-success { background: #065f46; color: #a7f3d0; border: 1px solid #10b981; }
        .jp-admin-toast-error { background: #881337; color: #fecdd3; border: 1px solid #f43f5e; }

        @keyframes jpBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      ` }} />
    </div>
  );
}
