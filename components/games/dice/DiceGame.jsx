'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  DICE_CONFIG,
  calculateWinChance,
  calculateTargetFromWinChance,
  calculateDiceMultiplier,
} from '../../../lib/games/diceEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Synthesizer (Digital Mechanical Clicks & Winning Chimes)     */
/* -------------------------------------------------------------------------- */
function playDiceSound(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'roll') {
      // Crisp mechanical click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'win') {
      // Bright major triad chime
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.04);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + i * 0.04 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.04);
        osc.stop(ctx.currentTime + i * 0.04 + 0.2);
      });
    } else if (type === 'loss') {
      // Soft low thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'jackpot') {
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + i * 0.05 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + 0.3);
      });
    }
  } catch {}
}

export default function DiceGame({
  balance = 0,
  onBalanceChange,
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Config & Betting
  const [stake, setStake] = useState(50);
  const [baseStake, setBaseStake] = useState(50);
  const [mode, setMode] = useState('under'); // 'under' | 'over'
  const [target, setTarget] = useState(50.0);
  const [isRolling, setIsRolling] = useState(false);

  // Active Roll Outcome State
  const [lastRoll, setLastRoll] = useState(null); // e.g. 48.24
  const [lastWon, setLastWon] = useState(null); // boolean
  const [displayRoll, setDisplayRoll] = useState('50.00');
  const [recentRolls, setRecentRolls] = useState([]);
  const [provablyData, setProvablyData] = useState(null);

  // Auto-Bet State
  const [isAutoRolling, setIsAutoRolling] = useState(false);
  const [autoRollCount, setAutoRollCount] = useState(0);
  const [onLossAction, setOnLossAction] = useState('reset'); // 'reset' | 'double'

  const autoRollTimerRef = useRef(null);
  const isRollingRef = useRef(false);

  // Derived Values
  const winChance = useMemo(() => calculateWinChance(mode, target), [mode, target]);
  const multiplier = useMemo(() => calculateDiceMultiplier(winChance), [winChance]);
  const profitOnWin = useMemo(() => Math.floor(stake * multiplier * 100) / 100 - stake, [stake, multiplier]);

  // Load history on mount
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      try {
        const res = await fetch('/api/games/dice/history');
        if (res.ok) {
          const data = await res.json();
          if (data.history && isMounted) {
            setRecentRolls(data.history);
          }
        }
      } catch (err) {
        console.warn('Could not load dice history:', err);
      }
    }
    loadHistory();
    return () => { isMounted = false; };
  }, []);

  // Handle Mode Switch (Flip Under / Over)
  const handleToggleMode = () => {
    const nextMode = mode === 'under' ? 'over' : 'under';
    setMode(nextMode);
    // Keep win chance identical by adjusting target: target = 100 - target
    setTarget((prev) => parseFloat((100 - prev).toFixed(2)));
  };

  // Execute Roll
  const handleRollDice = async () => {
    if (isRollingRef.current) return;
    if (balance < stake) {
      triggerToast('Insufficient funds. Top up via M-Pesa to roll.', 'warning');
      setIsAutoRolling(false);
      onOpenDeposit();
      return;
    }

    isRollingRef.current = true;
    setIsRolling(true);
    playDiceSound('roll');

    // Quick rolling counter animation
    let counterInterval = setInterval(() => {
      setDisplayRoll((Math.random() * 100).toFixed(2));
    }, 30);

    try {
      const res = await fetch('/api/games/dice/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake, mode, target }),
      });

      const data = await res.json();
      clearInterval(counterInterval);

      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Error rolling dice.', 'error');
        setIsRolling(false);
        isRollingRef.current = false;
        setIsAutoRolling(false);
        return;
      }

      const finalRoll = Number(data.roll);
      setDisplayRoll(finalRoll.toFixed(2));
      setLastRoll(finalRoll);
      setLastWon(data.won);

      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }

      // Audio & Visual celebratory triggers
      if (data.won) {
        if (data.multiplier >= 10) {
          playDiceSound('jackpot');
          confetti({
            particleCount: 90,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#22c55e', '#f59e0b', '#3b82f6', '#ffffff'],
          });
        } else {
          playDiceSound('win');
        }
      } else {
        playDiceSound('loss');
      }

      // Prepend to recent rolls strip
      setRecentRolls((prev) => [
        {
          id: data.rollId,
          roll: finalRoll,
          won: data.won,
          multiplier: data.multiplier,
          payout: data.payout,
          mode: data.mode,
          target: data.target,
          createdAt: new Date().toISOString(),
        },
        ...prev.slice(0, 24),
      ]);

      // Provably Fair Modal details
      setProvablyData({
        rollId: data.rollId,
        stake: data.stake,
        mode: data.mode,
        target: data.target,
        winChance: data.winChance,
        roll: finalRoll,
        won: data.won,
        multiplier: data.multiplier,
        payout: data.payout,
        serverSeed: data.serverSeed,
        serverSeedHash: data.serverSeedHash,
        clientSeed: data.clientSeed,
        nonce: data.nonce,
      });

      // Auto-Roll Martingale Handling
      if (isAutoRolling) {
        setAutoRollCount((c) => c + 1);
        if (!data.won && onLossAction === 'double') {
          setStake((s) => Math.min(DICE_CONFIG.maxBet, s * 2));
        } else if (data.won && onLossAction === 'double') {
          setStake(baseStake);
        }
      }
    } catch (err) {
      clearInterval(counterInterval);
      console.error('Dice roll error:', err);
      triggerToast('Network error rolling dice.', 'error');
      setIsAutoRolling(false);
    } finally {
      setIsRolling(false);
      isRollingRef.current = false;
    }
  };

  // Auto-Roll Loop
  useEffect(() => {
    if (isAutoRolling) {
      autoRollTimerRef.current = setInterval(() => {
        handleRollDice();
      }, 550);
    } else {
      if (autoRollTimerRef.current) clearInterval(autoRollTimerRef.current);
    }
    return () => {
      if (autoRollTimerRef.current) clearInterval(autoRollTimerRef.current);
    };
  }, [isAutoRolling, stake, mode, target, balance, baseStake, onLossAction]);

  return (
    <div className="jp-dice-container">
      {/* ---------------- TOP HEADER BAR ---------------- */}
      <div className="jp-dice-header">
        <div className="jp-dice-title-wrap">
          <div className="jp-dice-badge">PROVABLY FAIR 98.5% RTP</div>
          <h2 className="jp-dice-title">
            <span className="jp-dice-icon">🎲</span> CLASSIC DICE OVER / UNDER
          </h2>
        </div>

        <div className="jp-dice-header-actions">
          {provablyData && (
            <button
              onClick={() => onOpenProvably ? onOpenProvably() : null}
              className="jp-dice-seed-btn"
              title="Inspect Provably Fair Hash"
            >
              🛡️ Verify Hash
            </button>
          )}
        </div>
      </div>

      {/* ---------------- RECENT ROLLS STRIP ---------------- */}
      <div className="jp-dice-history-strip">
        <span className="jp-history-label">RECENT:</span>
        <div className="jp-history-pills">
          {recentRolls.length === 0 ? (
            <span className="jp-history-empty">Roll dice to see live results</span>
          ) : (
            recentRolls.map((r) => (
              <span
                key={r.id}
                className={`jp-history-pill ${r.won ? 'pill-won' : 'pill-lost'}`}
                title={`Rolled ${r.roll.toFixed(2)} (${r.mode} ${r.target})`}
              >
                {r.roll.toFixed(2)}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ---------------- MAIN DICE ARENA ---------------- */}
      <div className="jp-dice-arena">
        {/* Giant Numeric Roll Display */}
        <div className="jp-dice-display-box">
          <div className={`jp-dice-number ${lastWon === true ? 'text-win' : lastWon === false ? 'text-loss' : ''}`}>
            {displayRoll}
          </div>
          <div className="jp-dice-mode-sub">
            {mode === 'under' ? `ROLL UNDER ${target.toFixed(2)} TO WIN` : `ROLL OVER ${target.toFixed(2)} TO WIN`}
          </div>
        </div>

        {/* Interactive Dual-Color Slider */}
        <div className="jp-slider-wrapper">
          <div className="jp-slider-track-container">
            {/* Dual color background track */}
            <div
              className="jp-slider-track"
              style={{
                background: mode === 'under'
                  ? `linear-gradient(to right, #22c55e 0%, #22c55e ${target}%, #ef4444 ${target}%, #ef4444 100%)`
                  : `linear-gradient(to right, #ef4444 0%, #ef4444 ${target}%, #22c55e ${target}%, #22c55e 100%)`,
              }}
            />

            {/* Native range slider for smooth touch & mouse dragging */}
            <input
              type="range"
              min="1.00"
              max="98.00"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(parseFloat(Number(e.target.value).toFixed(2)))}
              disabled={isRolling || isAutoRolling}
              className="jp-slider-input"
            />

            {/* Last roll result marker pin */}
            {lastRoll !== null && (
              <div
                className={`jp-roll-marker ${lastWon ? 'marker-win' : 'marker-loss'}`}
                style={{ left: `${Math.min(98, Math.max(2, lastRoll))}%` }}
              >
                <div className="jp-marker-arrow" />
                <span className="jp-marker-val">{lastRoll.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Scale labels */}
          <div className="jp-slider-scale">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>

        {/* Multiplier & Odds Info Cards */}
        <div className="jp-dice-stats-grid">
          <div className="jp-stat-card">
            <span className="jp-stat-label">MULTIPLIER</span>
            <div className="jp-stat-val text-amber">{multiplier.toFixed(4)}x</div>
          </div>

          <div className="jp-stat-card">
            <span className="jp-stat-label">ROLL {mode.toUpperCase()}</span>
            <div className="jp-stat-val text-cyan">{target.toFixed(2)}</div>
            <button
              onClick={handleToggleMode}
              disabled={isRolling || isAutoRolling}
              className="jp-flip-mode-btn"
              title="Flip between Roll Under and Roll Over"
            >
              ⇄ Flip
            </button>
          </div>

          <div className="jp-stat-card">
            <span className="jp-stat-label">WIN CHANCE</span>
            <div className="jp-stat-val text-green">{winChance.toFixed(2)}%</div>
          </div>
        </div>

        {/* Bottom Betting & Auto Controls */}
        <div className="jp-dice-controls">
          {/* Stake Box */}
          <div className="jp-dice-card">
            <div className="jp-card-label-row">
              <span className="jp-card-title">BET AMOUNT (KES)</span>
              <span className="jp-card-profit">Profit on Win: <strong>+KES {profitOnWin.toFixed(2)}</strong></span>
            </div>

            <div className="jp-stepper">
              <button
                onClick={() => {
                  const next = Math.max(10, stake - 10);
                  setStake(next);
                  setBaseStake(next);
                }}
                disabled={isRolling || isAutoRolling}
                className="jp-step-btn"
              >
                −
              </button>
              <input
                type="number"
                value={stake}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) {
                    setStake(Math.max(10, Math.min(100000, val)));
                    setBaseStake(Math.max(10, Math.min(100000, val)));
                  }
                }}
                disabled={isRolling || isAutoRolling}
                className="jp-stake-input"
              />
              <button
                onClick={() => {
                  const next = Math.min(100000, stake + 10);
                  setStake(next);
                  setBaseStake(next);
                }}
                disabled={isRolling || isAutoRolling}
                className="jp-step-btn"
              >
                +
              </button>
            </div>

            <div className="jp-quick-chips">
              {[50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setStake(v);
                    setBaseStake(v);
                  }}
                  disabled={isRolling || isAutoRolling}
                  className={`jp-chip-btn ${stake === v ? 'chip-active' : ''}`}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => {
                  const next = Math.max(10, Math.floor(stake / 2));
                  setStake(next);
                  setBaseStake(next);
                }}
                disabled={isRolling || isAutoRolling}
                className="jp-chip-btn"
              >
                ½
              </button>
              <button
                onClick={() => {
                  const next = Math.min(100000, stake * 2);
                  setStake(next);
                  setBaseStake(next);
                }}
                disabled={isRolling || isAutoRolling}
                className="jp-chip-btn"
              >
                2x
              </button>
            </div>
          </div>

          {/* Action Center */}
          <div className="jp-dice-card">
            <button
              onClick={handleRollDice}
              disabled={isRolling || isAutoRolling}
              className="jp-roll-btn"
            >
              <span>{isRolling ? 'ROLLING...' : `ROLL DICE (KES ${stake.toLocaleString()})`}</span>
            </button>

            {/* Auto Roll / Martingale Row */}
            <div className="jp-autoroll-bar">
              <button
                onClick={() => {
                  if (!isAutoRolling) {
                    setBaseStake(stake);
                    setIsAutoRolling(true);
                  } else {
                    setIsAutoRolling(false);
                  }
                }}
                className={`jp-auto-btn ${isAutoRolling ? 'auto-active' : ''}`}
              >
                {isAutoRolling ? '⏹ STOP AUTO' : '⚡ AUTO ROLL'}
              </button>

              <div className="jp-martingale-selector">
                <span className="jp-martin-label">On Loss:</span>
                <button
                  onClick={() => setOnLossAction('reset')}
                  disabled={isAutoRolling}
                  className={`jp-martin-btn ${onLossAction === 'reset' ? 'martin-active' : ''}`}
                >
                  Reset
                </button>
                <button
                  onClick={() => setOnLossAction('double')}
                  disabled={isAutoRolling}
                  className={`jp-martin-btn ${onLossAction === 'double' ? 'martin-active' : ''}`}
                  title="Martingale 2x multiplier on loss"
                >
                  2x Martingale
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- STYLES ---------------- */}
      <style jsx>{`
        .jp-dice-container {
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: #090d16;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px;
          color: #f1f5f9;
          font-family: inherit;
        }

        .jp-dice-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .jp-dice-badge {
          font-size: 10px;
          font-weight: 800;
          color: #a855f7;
          letter-spacing: 1px;
        }

        .jp-dice-title {
          font-size: 18px;
          font-weight: 800;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-dice-icon {
          font-size: 18px;
        }

        .jp-dice-seed-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }
        .jp-dice-seed-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        /* History Strip */
        .jp-dice-history-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 6px 10px;
          overflow: hidden;
        }

        .jp-history-label {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
        }

        .jp-history-pills {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          white-space: nowrap;
          scrollbar-width: none;
        }

        .jp-history-pill {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 800;
          font-family: monospace;
          animation: popIn 0.25s ease-out;
        }

        .pill-won {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid #22c55e;
          color: #22c55e;
        }

        .pill-lost {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #f87171;
        }

        .jp-history-empty {
          font-size: 11px;
          color: #64748b;
        }

        @keyframes popIn {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Main Arena */
        .jp-dice-arena {
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: radial-gradient(circle at 50% 30%, #1e293b 0%, #090d16 85%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 24px;
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.7);
        }

        /* Number readout */
        .jp-dice-display-box {
          text-align: center;
          padding: 10px 0;
        }

        .jp-dice-number {
          font-size: 72px;
          font-weight: 900;
          font-family: monospace;
          letter-spacing: -1px;
          color: #ffffff;
          line-height: 1;
          transition: color 0.2s;
        }

        .text-win {
          color: #22c55e;
          text-shadow: 0 0 25px rgba(34, 197, 94, 0.6);
        }

        .text-loss {
          color: #ef4444;
          text-shadow: 0 0 25px rgba(239, 68, 68, 0.5);
        }

        .jp-dice-mode-sub {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 1px;
          margin-top: 6px;
        }

        /* Dual Track Slider */
        .jp-slider-wrapper {
          position: relative;
          padding: 10px 0;
        }

        .jp-slider-track-container {
          position: relative;
          height: 18px;
          border-radius: 9px;
        }

        .jp-slider-track {
          position: absolute;
          inset: 0;
          border-radius: 9px;
          box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7);
        }

        .jp-slider-input {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 5;
          margin: 0;
        }

        .jp-roll-marker {
          position: absolute;
          top: -28px;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 4;
          animation: dropMarker 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }

        .marker-win .jp-marker-val {
          background: #22c55e;
          color: #052e16;
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.8);
        }
        .marker-win .jp-marker-arrow {
          border-top-color: #22c55e;
        }

        .marker-loss .jp-marker-val {
          background: #ef4444;
          color: #ffffff;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.8);
        }
        .marker-loss .jp-marker-arrow {
          border-top-color: #ef4444;
        }

        .jp-marker-val {
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 900;
          font-family: monospace;
        }

        .jp-marker-arrow {
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid #22c55e;
        }

        @keyframes dropMarker {
          0% { transform: translateX(-50%) translateY(-10px); opacity: 0; }
          100% { transform: translateX(-50%) translateY(0); opacity: 1; }
        }

        .jp-slider-scale {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
          margin-top: 8px;
          padding: 0 4px;
        }

        /* Stats Cards */
        .jp-dice-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .jp-stat-card {
          position: relative;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px;
          text-align: center;
        }

        .jp-stat-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }

        .jp-stat-val {
          font-size: 20px;
          font-weight: 900;
          font-family: monospace;
          margin-top: 4px;
        }

        .text-amber { color: #f59e0b; }
        .text-cyan { color: #38bdf8; }
        .text-green { color: #22c55e; }

        .jp-flip-mode-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }
        .jp-flip-mode-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.15);
        }

        /* Bottom Controls */
        .jp-dice-controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .jp-dice-controls {
            grid-template-columns: 1fr;
          }
        }

        .jp-dice-card {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .jp-card-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-card-title {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
        }

        .jp-card-profit {
          font-size: 11px;
          color: #94a3b8;
        }
        .jp-card-profit strong {
          color: #22c55e;
        }

        .jp-stepper {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-step-btn {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .jp-step-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
        }

        .jp-stake-input {
          flex: 1;
          height: 36px;
          background: #090d16;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          text-align: center;
        }

        .jp-quick-chips {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
        }

        .jp-chip-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          padding: 6px 0;
          cursor: pointer;
        }
        .jp-chip-btn:hover:not(:disabled) {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }
        .chip-active {
          background: rgba(168, 85, 247, 0.2);
          border-color: #a855f7;
          color: #a855f7;
        }

        .jp-roll-btn {
          width: 100%;
          height: 52px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          border: none;
          border-radius: 10px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
          transition: all 0.2s;
        }
        .jp-roll-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
        }

        .jp-autoroll-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 4px;
        }

        .jp-auto-btn {
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .auto-active {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ef4444;
        }

        .jp-martingale-selector {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-martin-label {
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
        }

        .jp-martin-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 8px;
          cursor: pointer;
        }
        .martin-active {
          background: rgba(168, 85, 247, 0.2);
          border-color: #a855f7;
          color: #a855f7;
        }
      `}</style>
    </div>
  );
}
