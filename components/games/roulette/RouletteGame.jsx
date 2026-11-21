'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ROULETTE_CONFIG,
  WHEEL_SEQUENCE,
  RED_NUMBERS,
  BLACK_NUMBERS,
  getPocketColor,
} from '../../../lib/games/rouletteEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Sound Synthesizer (Chip Click, Ball Spin, Fret Ticks, Win)  */
/* -------------------------------------------------------------------------- */
function playRouletteSound(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'chip') {
      // Ceramic poker chip click clack
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === 'spin') {
      // Wheel rim friction & ball whoosh
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, ctx.currentTime);
      noise.connect(filter);
      filter.connect(ctx.destination);
      noise.start();
    } else if (type === 'drop') {
      // Ball dropping into wood/metal pocket
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'win') {
      // Triumphant ascending casino jingle
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + idx * 0.05 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.35);
      });
    } else if (type === 'loss') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Autoplay restrictions
  }
}

const CHIP_DENOMINATIONS = [
  { value: 10, label: '10', color: '#38bdf8' },
  { value: 20, label: '20', color: '#a855f7' },
  { value: 50, label: '50', color: '#ec4899' },
  { value: 100, label: '100', color: '#22c55e' },
  { value: 500, label: '500', color: '#f59e0b' },
  { value: 1000, label: '1K', color: '#ef4444' },
  { value: 5000, label: '5K', color: '#eab308' },
];

/* -------------------------------------------------------------------------- */
/*  Main Turbo Mini-Roulette Component                                        */
/* -------------------------------------------------------------------------- */
export default function RouletteGame({
  balance = 0,
  onBalanceChange = () => {},
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Betting state: map of betKey -> { type, value?, amount }
  const [placedBets, setPlacedBets] = useState({});
  const [activeChip, setActiveChip] = useState(10);
  const [lastPlacedBets, setLastPlacedBets] = useState(null);
  const [historyStack, setHistoryStack] = useState([]); // for undo

  // Spin & Outcome state
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState(null);
  const [winningColor, setWinningColor] = useState(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastResultBanner, setLastResultBanner] = useState(null);

  // Statistics & History
  const [recentSpins, setRecentSpins] = useState([]);
  const [stats, setStats] = useState({
    redPercent: 48,
    blackPercent: 48,
    greenPercent: 4,
    hotNumbers: [17, 7, 23, 0, 32],
    coldNumbers: [4, 13, 26, 35, 10],
  });

  // Provably Fair Modal
  const [showProvablyModal, setShowProvablyModal] = useState(false);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState(null);

  // 1. Fetch spin history on load
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/games/roulette/history');
      const data = await res.json();
      if (data.success) {
        if (data.recent) setRecentSpins(data.recent);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load roulette history:', err);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Total stake currently placed on table
  const totalStake = Object.values(placedBets).reduce((acc, b) => acc + (b.amount || 0), 0);

  // Add chip to a specific bet spot
  const handlePlaceBet = (betKey, betType, betValue = null) => {
    if (isSpinning) return;
    if (totalStake + activeChip > ROULETTE_CONFIG.maxBet) {
      triggerToast(`Maximum table stake is KES ${ROULETTE_CONFIG.maxBet.toLocaleString()}`, 'error');
      return;
    }

    playRouletteSound('chip');
    setHistoryStack((prev) => [...prev, { ...placedBets }]);

    setPlacedBets((prev) => {
      const existing = prev[betKey];
      const newAmount = (existing ? existing.amount : 0) + activeChip;
      return {
        ...prev,
        [betKey]: {
          key: betKey,
          type: betType,
          value: betValue,
          amount: newAmount,
        },
      };
    });
  };

  // Clear all chips
  const handleClearBets = () => {
    if (isSpinning) return;
    setHistoryStack((prev) => [...prev, { ...placedBets }]);
    setPlacedBets({});
  };

  // Undo last chip placement
  const handleUndo = () => {
    if (isSpinning || historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));
    setPlacedBets(previous);
  };

  // Double all placed bets
  const handleDoubleBets = () => {
    if (isSpinning || totalStake === 0) return;
    if (totalStake * 2 > ROULETTE_CONFIG.maxBet) {
      triggerToast(`Doubling exceeds max stake of KES ${ROULETTE_CONFIG.maxBet.toLocaleString()}`, 'error');
      return;
    }
    setHistoryStack((prev) => [...prev, { ...placedBets }]);
    setPlacedBets((prev) => {
      const updated = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[k] = { ...v, amount: v.amount * 2 };
      }
      return updated;
    });
  };

  // Repeat last spin's bets
  const handleRepeatBets = () => {
    if (isSpinning || !lastPlacedBets || Object.keys(lastPlacedBets).length === 0) return;
    setHistoryStack((prev) => [...prev, { ...placedBets }]);
    setPlacedBets({ ...lastPlacedBets });
  };

  // Execute Spin
  const handleSpin = async () => {
    if (isSpinning) return;
    if (totalStake < ROULETTE_CONFIG.minBet) {
      triggerToast(`Please place at least KES ${ROULETTE_CONFIG.minBet} on the table`, 'error');
      return;
    }
    if (totalStake > balance) {
      triggerToast('Insufficient balance. Please deposit to spin.', 'error');
      if (onOpenDeposit) onOpenDeposit();
      return;
    }

    setIsSpinning(true);
    setLastResultBanner(null);
    setLastPlacedBets({ ...placedBets });
    playRouletteSound('spin');

    const betsArray = Object.values(placedBets);

    try {
      const res = await fetch('/api/games/roulette/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bets: betsArray }),
      });

      const data = await res.json();
      if (!data.success) {
        triggerToast(data.message || 'Spin failed', 'error');
        setIsSpinning(false);
        return;
      }

      onBalanceChange(data.updatedBalance);
      setServerSeedHash(data.serverSeedHash);
      setClientSeed(data.clientSeed);
      setRevealedServerSeed(data.serverSeed);

      // Wheel physics calculation:
      // European wheel: 37 pockets. Each pocket spans (360 / 37) degrees = ~9.7297 deg.
      // Winning pocket angle in WHEEL_SEQUENCE:
      const pocketAngle = data.wheelIndex * (360 / 37);
      // Spin at least 5 full rotations (1800 deg) plus target offset
      const targetRotation = wheelRotation + 1800 + (360 - pocketAngle);
      setWheelRotation(targetRotation);

      // Wait for spin deceleration animation (2.6 seconds)
      setTimeout(() => {
        playRouletteSound('drop');
        setWinningNumber(data.winningNumber);
        setWinningColor(data.winningColor);

        setTimeout(() => {
          if (data.totalPayout > 0) {
            playRouletteSound('win');
            confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.6 },
              colors: ['#f43f5e', '#22c55e', '#eab308', '#38bdf8'],
            });
            setLastResultBanner({
              type: 'win',
              message: `WIN! Number ${data.winningNumber} (${data.winningColor.toUpperCase()}) — Paid KES ${data.totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            });
            triggerToast(`Won KES ${data.totalPayout.toFixed(2)} on number ${data.winningNumber}!`, 'success');
          } else {
            playRouletteSound('loss');
            setLastResultBanner({
              type: 'loss',
              message: `Number ${data.winningNumber} (${data.winningColor.toUpperCase()}) — No win this round`,
            });
          }

          setIsSpinning(false);
          fetchHistory();
        }, 500);
      }, 2600);
    } catch (err) {
      triggerToast(err.message || 'Network error on spin', 'error');
      setIsSpinning(false);
    }
  };

  // Helper to render stacked chip badge on a spot
  const renderChipBadge = (betKey) => {
    const bet = placedBets[betKey];
    if (!bet || bet.amount <= 0) return null;
    return (
      <div className="jp-placed-chip">
        <span className="jp-chip-amt">{bet.amount >= 1000 ? `${(bet.amount / 1000).toFixed(1)}k` : bet.amount}</span>
      </div>
    );
  };

  // 12 Rows of 3 numbers (1 to 36)
  const rows = [];
  for (let r = 0; r < 12; r++) {
    const n1 = r * 3 + 1;
    const n2 = r * 3 + 2;
    const n3 = r * 3 + 3;
    rows.push([n1, n2, n3]);
  }

  return (
    <div className="jp-roulette-wrapper">
      {/* Top Header & Provably Fair Audit Trigger */}
      <div className="jp-roulette-topbar">
        <div className="jp-roulette-title-tag">
          <span className="jp-roulette-badge">EUROPEAN 37</span>
          <h2 className="jp-roulette-title">Turbo Mini-Roulette</h2>
          <span className="jp-edge-tag">97.3% RTP</span>
        </div>
        <div className="jp-roulette-actions">
          <button
            type="button"
            className="jp-audit-btn"
            onClick={() => setShowProvablyModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            PROVABLY FAIR
          </button>
        </div>
      </div>

      {/* Main Wheel & History Stats Arena */}
      <div className="jp-roulette-arena">
        {/* Left: Interactive 3D Roulette Wheel */}
        <div className="jp-wheel-container">
          <div className="jp-wheel-outer-rim">
            <div
              className={`jp-wheel-disc ${isSpinning ? 'jp-wheel-spin-motion' : ''}`}
              style={{ transform: `rotate(${wheelRotation}deg)` }}
            >
              {WHEEL_SEQUENCE.map((num, idx) => {
                const angle = idx * (360 / 37);
                const color = getPocketColor(num);
                return (
                  <div
                    key={num}
                    className={`jp-wheel-pocket jp-pocket-${color}`}
                    style={{ transform: `rotate(${angle}deg)` }}
                  >
                    <span className="jp-pocket-num">{num}</span>
                  </div>
                );
              })}
              {/* Center Chrome Turret */}
              <div className="jp-wheel-center-turret">
                <div className="jp-turret-cap" />
              </div>
            </div>

            {/* Ball Track & Fixed Indicator Needle */}
            <div className="jp-wheel-pointer" />
          </div>

          {/* Winning Pocket Result Badge */}
          <div className="jp-wheel-result-badge">
            {winningNumber !== null ? (
              <div className={`jp-winning-pill jp-pill-${winningColor}`}>
                <span className="jp-win-num">{winningNumber}</span>
                <span className="jp-win-col">{winningColor.toUpperCase()}</span>
              </div>
            ) : (
              <span className="jp-awaiting-spin">PLACE BETS & SPIN</span>
            )}
          </div>
        </div>

        {/* Right: Spin Statistics & Hot/Cold Panel */}
        <div className="jp-stats-panel">
          <div className="jp-stats-header">
            <span className="jp-stats-title">RECENT SPINS</span>
            <div className="jp-color-ratio-bar">
              <div className="jp-ratio-segment jp-bg-red" style={{ width: `${stats.redPercent}%` }} title={`Red ${stats.redPercent}%`} />
              <div className="jp-ratio-segment jp-bg-green" style={{ width: `${stats.greenPercent}%` }} title={`Green ${stats.greenPercent}%`} />
              <div className="jp-ratio-segment jp-bg-black" style={{ width: `${stats.blackPercent}%` }} title={`Black ${stats.blackPercent}%`} />
            </div>
          </div>

          {/* Recent Numbers Strip */}
          <div className="jp-recent-strip">
            {recentSpins.length > 0 ? (
              recentSpins.slice(0, 14).map((s, idx) => (
                <div key={idx} className={`jp-recent-num jp-num-${s.color}`}>
                  {s.number}
                </div>
              ))
            ) : (
              <span className="jp-no-history">No recent spins yet</span>
            )}
          </div>

          {/* Hot & Cold Indicators */}
          <div className="jp-hot-cold-row">
            <div className="jp-hc-box jp-hot-box">
              <span className="jp-hc-label">🔥 HOT</span>
              <div className="jp-hc-list">
                {stats.hotNumbers.map((n) => (
                  <span key={n} className={`jp-hc-item jp-num-${getPocketColor(n)}`}>
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="jp-hc-box jp-cold-box">
              <span className="jp-hc-label">❄️ COLD</span>
              <div className="jp-hc-list">
                {stats.coldNumbers.map((n) => (
                  <span key={n} className={`jp-hc-item jp-num-${getPocketColor(n)}`}>
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Result Outcome Alert Banner */}
      {lastResultBanner && (
        <div className={`jp-result-banner jp-banner-${lastResultBanner.type}`}>
          <span>{lastResultBanner.message}</span>
        </div>
      )}

      {/* European Roulette Table Betting Layout */}
      <div className="jp-table-felt">
        {/* Zero Spot (Spans the width at the top) */}
        <div
          className="jp-table-zero"
          onClick={() => handlePlaceBet('STRAIGHT_0', 'STRAIGHT', 0)}
        >
          <span className="jp-cell-text">0</span>
          {renderChipBadge('STRAIGHT_0')}
        </div>

        {/* 12 Rows of 3 Numbers Grid */}
        <div className="jp-numbers-grid">
          {rows.map(([n1, n2, n3]) => (
            <div key={n1} className="jp-grid-row">
              {[n1, n2, n3].map((num) => {
                const color = getPocketColor(num);
                const key = `STRAIGHT_${num}`;
                return (
                  <div
                    key={num}
                    className={`jp-num-cell jp-cell-${color}`}
                    onClick={() => handlePlaceBet(key, 'STRAIGHT', num)}
                  >
                    <span className="jp-cell-text">{num}</span>
                    {renderChipBadge(key)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Columns 2:1 Bets */}
        <div className="jp-columns-row">
          <div className="jp-col-cell" onClick={() => handlePlaceBet('COL_1', 'COL_1')}>
            <span>2:1</span>
            {renderChipBadge('COL_1')}
          </div>
          <div className="jp-col-cell" onClick={() => handlePlaceBet('COL_2', 'COL_2')}>
            <span>2:1</span>
            {renderChipBadge('COL_2')}
          </div>
          <div className="jp-col-cell" onClick={() => handlePlaceBet('COL_3', 'COL_3')}>
            <span>2:1</span>
            {renderChipBadge('COL_3')}
          </div>
        </div>

        {/* Dozens (1st 12, 2nd 12, 3rd 12) */}
        <div className="jp-dozens-row">
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('DOZEN_1', 'DOZEN_1')}>
            <span>1st 12 (1-12)</span>
            <span className="jp-outside-odds">3x</span>
            {renderChipBadge('DOZEN_1')}
          </div>
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('DOZEN_2', 'DOZEN_2')}>
            <span>2nd 12 (13-24)</span>
            <span className="jp-outside-odds">3x</span>
            {renderChipBadge('DOZEN_2')}
          </div>
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('DOZEN_3', 'DOZEN_3')}>
            <span>3rd 12 (25-36)</span>
            <span className="jp-outside-odds">3x</span>
            {renderChipBadge('DOZEN_3')}
          </div>
        </div>

        {/* Even-Money Outside Bets (Low, Even, Red, Black, Odd, High) */}
        <div className="jp-even-money-row">
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('LOW', 'LOW')}>
            <span>1-18</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('LOW')}
          </div>
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('EVEN', 'EVEN')}>
            <span>EVEN</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('EVEN')}
          </div>
          <div className="jp-outside-cell jp-outside-red" onClick={() => handlePlaceBet('RED', 'RED')}>
            <span className="jp-color-box-red">RED</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('RED')}
          </div>
          <div className="jp-outside-cell jp-outside-black" onClick={() => handlePlaceBet('BLACK', 'BLACK')}>
            <span className="jp-color-box-black">BLACK</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('BLACK')}
          </div>
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('ODD', 'ODD')}>
            <span>ODD</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('ODD')}
          </div>
          <div className="jp-outside-cell" onClick={() => handlePlaceBet('HIGH', 'HIGH')}>
            <span>19-36</span>
            <span className="jp-outside-odds">2x</span>
            {renderChipBadge('HIGH')}
          </div>
        </div>
      </div>

      {/* Betting Control Deck & Chips */}
      <div className="jp-roulette-dock">
        {/* Chip Denominations Selector */}
        <div className="jp-chips-container">
          <span className="jp-chips-label">SELECT CHIP:</span>
          <div className="jp-chips-list">
            {CHIP_DENOMINATIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`jp-poker-chip ${activeChip === c.value ? 'jp-chip-selected' : ''}`}
                style={{ borderColor: c.color }}
                onClick={() => {
                  playRouletteSound('chip');
                  setActiveChip(c.value);
                }}
              >
                <div className="jp-chip-inner" style={{ background: c.color }}>
                  <span>{c.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bet Modifiers (Clear, Undo, 2x, Repeat) */}
        <div className="jp-table-modifiers">
          <button
            type="button"
            className="jp-mod-action-btn"
            disabled={isSpinning || totalStake === 0}
            onClick={handleClearBets}
          >
            CLEAR
          </button>
          <button
            type="button"
            className="jp-mod-action-btn"
            disabled={isSpinning || historyStack.length === 0}
            onClick={handleUndo}
          >
            UNDO
          </button>
          <button
            type="button"
            className="jp-mod-action-btn"
            disabled={isSpinning || totalStake === 0}
            onClick={handleDoubleBets}
          >
            2× DOUBLE
          </button>
          <button
            type="button"
            className="jp-mod-action-btn"
            disabled={isSpinning || !lastPlacedBets}
            onClick={handleRepeatBets}
          >
            REPEAT
          </button>
        </div>

        {/* Spin Trigger Button */}
        <div className="jp-spin-trigger-box">
          <button
            type="button"
            className="jp-spin-btn"
            disabled={isSpinning || totalStake < ROULETTE_CONFIG.minBet}
            onClick={handleSpin}
          >
            <div className="jp-spin-btn-content">
              <span className="jp-spin-btn-title">
                {isSpinning ? 'SPINNING WHEEL...' : 'SPIN ROULETTE'}
              </span>
              <span className="jp-spin-btn-stake">
                TOTAL: KES {totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Provably Fair Modal */}
      {showProvablyModal && (
        <div className="jp-modal-overlay" onClick={() => setShowProvablyModal(false)}>
          <div className="jp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="jp-modal-header">
              <div className="jp-modal-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>PROVABLY FAIR VERIFICATION</span>
              </div>
              <button
                type="button"
                className="jp-modal-close"
                onClick={() => setShowProvablyModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="jp-modal-desc">
              Every spin of Turbo Mini-Roulette is determined cryptographically via HMAC-SHA256. The winning pocket (0 - 36) is computed from the unhashed server seed and your client seed before the ball spins.
            </p>

            <div className="jp-field-group">
              <label className="jp-field-label">SERVER SEED (SHA-256 HASH)</label>
              <input
                type="text"
                readOnly
                value={serverSeedHash || 'Generated upon placing spin'}
                className="jp-modal-input"
              />
            </div>

            <div className="jp-field-group">
              <label className="jp-field-label">CLIENT SEED</label>
              <input
                type="text"
                readOnly
                value={clientSeed || 'Generated upon placing spin'}
                className="jp-modal-input"
              />
            </div>

            {revealedServerSeed && (
              <div className="jp-field-group">
                <label className="jp-field-label jp-text-green">REVEALED SERVER SEED (UNHASHED)</label>
                <input
                  type="text"
                  readOnly
                  value={revealedServerSeed}
                  className="jp-modal-input jp-input-green"
                />
              </div>
            )}

            <div className="jp-modal-footer">
              <button
                type="button"
                className="jp-btn-close-modal"
                onClick={() => setShowProvablyModal(false)}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Component Styles */}
      <style jsx>{`
        .jp-roulette-wrapper {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          color: #f8fafc;
          font-family: inherit;
        }

        .jp-roulette-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }

        .jp-roulette-title-tag {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .jp-roulette-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          background: rgba(244, 63, 94, 0.2);
          color: #f43f5e;
          border: 1px solid rgba(244, 63, 94, 0.4);
          border-radius: 6px;
        }

        .jp-roulette-title {
          font-size: 15px;
          font-weight: 700;
          margin: 0;
          color: #f1f5f9;
        }

        .jp-edge-tag {
          font-size: 11px;
          font-weight: 800;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.15);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .jp-audit-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #94a3b8;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
        }

        .jp-audit-btn:hover {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.4);
        }

        /* Wheel & Stats Arena */
        .jp-roulette-arena {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 20px;
          background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 20px;
          align-items: center;
        }

        /* Wheel Styles */
        .jp-wheel-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .jp-wheel-outer-rim {
          position: relative;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: #3e2723;
          border: 6px solid #8d6e63;
          box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8), 0 10px 25px rgba(0, 0, 0, 0.6);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-wheel-disc {
          position: absolute;
          width: 196px;
          height: 196px;
          border-radius: 50%;
          background: #0f172a;
          transition: transform 2.6s cubic-bezier(0.15, 0.85, 0.35, 1);
        }

        .jp-wheel-pocket {
          position: absolute;
          top: 0;
          left: 50%;
          width: 14px;
          height: 98px;
          margin-left: -7px;
          transform-origin: 50% 98px;
          display: flex;
          justify-content: center;
        }

        .jp-pocket-num {
          font-size: 8px;
          font-weight: 900;
          color: #ffffff;
          padding-top: 2px;
        }

        .jp-pocket-red .jp-pocket-num {
          color: #ef4444;
        }

        .jp-pocket-black .jp-pocket-num {
          color: #cbd5e1;
        }

        .jp-pocket-green .jp-pocket-num {
          color: #22c55e;
        }

        .jp-wheel-center-turret {
          position: absolute;
          inset: 48px;
          border-radius: 50%;
          background: radial-gradient(circle, #f59e0b 0%, #b45309 60%, #78350f 100%);
          border: 3px solid #d97706;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-turret-cap {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #fbbf24;
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.4);
        }

        .jp-wheel-pointer {
          position: absolute;
          top: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 10px solid #f59e0b;
          z-index: 10;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
        }

        .jp-wheel-result-badge {
          min-height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-winning-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 20px;
          font-weight: 900;
          animation: popPill 0.3s ease-out;
        }

        @keyframes popPill {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .jp-pill-red {
          background: #ef4444;
          color: #fff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
        }

        .jp-pill-black {
          background: #020617;
          border: 1px solid #475569;
          color: #f8fafc;
          box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
        }

        .jp-pill-green {
          background: #22c55e;
          color: #000;
          box-shadow: 0 0 15px rgba(34, 197, 94, 0.5);
        }

        .jp-win-num {
          font-size: 18px;
          font-family: monospace;
        }

        .jp-win-col {
          font-size: 11px;
          letter-spacing: 0.05em;
        }

        .jp-awaiting-spin {
          font-size: 12px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.05em;
        }

        /* Stats Panel */
        .jp-stats-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .jp-stats-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-stats-title {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .jp-color-ratio-bar {
          display: flex;
          width: 140px;
          height: 10px;
          border-radius: 5px;
          overflow: hidden;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .jp-ratio-segment {
          height: 100%;
          transition: width 0.3s ease;
        }

        .jp-bg-red { background: #ef4444; }
        .jp-bg-green { background: #22c55e; }
        .jp-bg-black { background: #020617; }

        .jp-recent-strip {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .jp-recent-num {
          min-width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 900;
          font-family: monospace;
        }

        .jp-num-red { background: #ef4444; color: #fff; }
        .jp-num-black { background: #1e293b; color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); }
        .jp-num-green { background: #22c55e; color: #000; }

        .jp-no-history {
          font-size: 11px;
          color: #64748b;
        }

        .jp-hot-cold-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .jp-hc-box {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .jp-hc-label {
          font-size: 10px;
          font-weight: 900;
          color: #94a3b8;
        }

        .jp-hc-list {
          display: flex;
          gap: 6px;
        }

        .jp-hc-item {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
        }

        /* Outcome Banner */
        .jp-result-banner {
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
        }

        .jp-banner-win {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(34, 197, 94, 0.5);
          color: #4ade80;
        }

        .jp-banner-loss {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
        }

        /* Betting Table Felt Layout */
        .jp-table-felt {
          background: #064e3b;
          border: 2px solid #047857;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          user-select: none;
        }

        .jp-table-zero {
          background: #059669;
          border: 1px solid #10b981;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
          position: relative;
          transition: background 0.15s ease;
        }

        .jp-table-zero:hover {
          background: #10b981;
        }

        .jp-numbers-grid {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .jp-grid-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
        }

        .jp-num-cell {
          height: 42px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          position: relative;
          transition: transform 0.1s ease, filter 0.1s ease;
        }

        .jp-num-cell:hover {
          transform: translateY(-1px);
          filter: brightness(1.2);
        }

        .jp-cell-red {
          background: #dc2626;
          color: #ffffff;
        }

        .jp-cell-black {
          background: #0f172a;
          color: #f8fafc;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .jp-columns-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
        }

        .jp-col-cell {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          padding: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 900;
          color: #cbd5e1;
          cursor: pointer;
          position: relative;
        }

        .jp-col-cell:hover {
          background: rgba(15, 23, 42, 0.9);
          border-color: #22c55e;
        }

        .jp-dozens-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-top: 4px;
        }

        .jp-even-money-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
        }

        .jp-outside-cell {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 10px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          cursor: pointer;
          position: relative;
          font-size: 11px;
          font-weight: 800;
          color: #f1f5f9;
          transition: background 0.15s ease;
        }

        .jp-outside-cell:hover {
          background: rgba(15, 23, 42, 0.95);
          border-color: #38bdf8;
        }

        .jp-outside-odds {
          font-size: 9px;
          color: #94a3b8;
          font-weight: 700;
        }

        .jp-outside-red {
          background: rgba(220, 38, 38, 0.35);
          border-color: rgba(220, 38, 38, 0.6);
        }

        .jp-outside-black {
          background: rgba(15, 23, 42, 0.9);
          border-color: rgba(255, 255, 255, 0.3);
        }

        /* Stacked Chip Badge on Spot */
        .jp-placed-chip {
          position: absolute;
          top: 2px;
          right: 2px;
          background: #eab308;
          color: #000;
          border: 1px solid #ffffff;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.7);
          border-radius: 12px;
          padding: 1px 5px;
          font-size: 9px;
          font-weight: 900;
          pointer-events: none;
          z-index: 5;
        }

        /* Betting Control Dock */
        .jp-roulette-dock {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .jp-chips-container {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .jp-chips-label {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          white-space: nowrap;
        }

        .jp-chips-list {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 4px 0;
        }

        .jp-poker-chip {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px dashed #38bdf8;
          background: #0f172a;
          padding: 2px;
          cursor: pointer;
          transition: transform 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-poker-chip:hover {
          transform: translateY(-3px) scale(1.05);
        }

        .jp-chip-selected {
          transform: translateY(-4px) scale(1.1);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
        }

        .jp-chip-inner {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 900;
          color: #000;
        }

        .jp-table-modifiers {
          display: flex;
          gap: 8px;
        }

        .jp-mod-action-btn {
          flex: 1;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-mod-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        .jp-mod-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .jp-spin-trigger-box {
          width: 100%;
        }

        .jp-spin-btn {
          width: 100%;
          padding: 14px 20px;
          background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(244, 63, 94, 0.45);
          transition: all 0.15s ease;
        }

        .jp-spin-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }

        .jp-spin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .jp-spin-btn-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-spin-btn-title {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .jp-spin-btn-stake {
          font-size: 14px;
          font-weight: 800;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.25);
          padding: 4px 10px;
          border-radius: 6px;
        }

        /* Modal */
        .jp-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .jp-modal-card {
          width: 100%;
          max-width: 520px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .jp-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-modal-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 800;
          color: #f8fafc;
        }

        .jp-modal-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 18px;
          cursor: pointer;
        }

        .jp-modal-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
        }

        .jp-field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .jp-field-label {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .jp-modal-input {
          background: #020617;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 12px;
          font-family: monospace;
          color: #cbd5e1;
          outline: none;
        }

        .jp-input-green {
          border-color: rgba(34, 197, 94, 0.5);
          color: #4ade80;
        }

        .jp-modal-footer {
          display: flex;
          justify-content: flex-end;
        }

        .jp-btn-close-modal {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #f8fafc;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 680px) {
          .jp-roulette-arena {
            grid-template-columns: 1fr;
          }
          .jp-even-money-row {
            grid-template-columns: repeat(3, 1fr);
          }
          .jp-table-modifiers {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
