'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  COIN_SIDES,
  COINFLIP_CONFIG,
  getCoinflipMultiplier,
} from '../../../lib/games/coinflipEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Synthesizer (Metallic Coin Flick, Spin Ring & Land Slap)    */
/* -------------------------------------------------------------------------- */
function playCoinSound(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'flick') {
      // Metallic thumb flick + high pitch ringing spin
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'land') {
      // Solid coin clink & table slap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(950, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'win') {
      [659.25, 880, 1046.5, 1318.51].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + i * 0.05 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + 0.28);
      });
    } else if (type === 'loss') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'cashout') {
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
        gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + i * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.06);
        osc.stop(ctx.currentTime + i * 0.06 + 0.35);
      });
    }
  } catch {}
}

export default function CoinflipGame({
  balance = 0,
  onBalanceChange,
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Config & Betting
  const [stake, setStake] = useState(50);
  const [selectedSide, setSelectedSide] = useState('HEADS'); // 'HEADS' | 'TAILS'
  const [isStarting, setIsStarting] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);

  // Active Round State
  const [roundId, setRoundId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [flipsHistory, setFlipsHistory] = useState([]);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [serverSeed, setServerSeed] = useState('');

  // 3D Visual & Coin Animation State
  const [coinRotation, setCoinRotation] = useState(0); // degrees
  const [displayedFace, setDisplayedFace] = useState('HEADS');
  const [outcomeBanner, setOutcomeBanner] = useState(null);
  const [showProvablyModal, setShowProvablyModal] = useState(false);

  // Restore any active coinflip session on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreActiveRound() {
      try {
        const res = await fetch('/api/games/coinflip/state');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.round && isMounted) {
            const r = data.round;
            setRoundId(r.id);
            setStake(r.stake);
            setCurrentStreak(r.currentStreak);
            setCurrentMultiplier(r.currentMultiplier);
            setFlipsHistory(r.flipsHistory || []);
            setServerSeedHash(r.serverSeedHash || '');
            setIsPlaying(true);
            const lastFlip = r.flipsHistory?.[r.flipsHistory.length - 1];
            if (lastFlip?.outcome) {
              setDisplayedFace(lastFlip.outcome);
            }
          }
        }
      } catch (err) {
        console.warn('Could not restore active Coinflip round:', err);
      }
    }
    restoreActiveRound();
    return () => { isMounted = false; };
  }, []);

  // Prospective payouts
  const currentPayout = useMemo(() => {
    if (!isPlaying || currentStreak === 0) return 0;
    return Math.floor(stake * currentMultiplier * 100) / 100;
  }, [isPlaying, currentStreak, stake, currentMultiplier]);

  const nextMultiplier = useMemo(() => {
    return getCoinflipMultiplier(currentStreak + 1);
  }, [currentStreak]);

  const nextPayout = useMemo(() => {
    return Math.floor(stake * nextMultiplier * 100) / 100;
  }, [stake, nextMultiplier]);

  // Start a new Coinflip game session
  const handleStartCoinflip = async (chosenSide = selectedSide) => {
    if (balance < stake) {
      triggerToast('Insufficient funds. Top up via M-Pesa to play.', 'warning');
      onOpenDeposit();
      return;
    }

    setIsStarting(true);
    setOutcomeBanner(null);

    try {
      const res = await fetch('/api/games/coinflip/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Error starting coinflip.', 'error');
        setIsStarting(false);
        return;
      }

      setRoundId(data.roundId);
      setCurrentStreak(0);
      setCurrentMultiplier(1.0);
      setFlipsHistory([]);
      setServerSeedHash(data.serverSeedHash || '');
      setServerSeed('');
      setIsPlaying(true);
      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }

      // Immediately execute the first flip with selected side
      await executeFlip(chosenSide);
    } catch (err) {
      console.error('Coinflip start error:', err);
      triggerToast('Network error starting coinflip.', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  // Flip Coin
  const executeFlip = async (chosenSide) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setSelectedSide(chosenSide);
    playCoinSound('flick');

    // Trigger 3D spinning revolutions
    const extraSpins = 5 + Math.floor(Math.random() * 3); // 5 to 7 full 360 spins
    const targetDeg = coinRotation + extraSpins * 360 + (chosenSide === 'TAILS' ? 180 : 0);
    setCoinRotation(targetDeg);

    try {
      const res = await fetch('/api/games/coinflip/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: chosenSide }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Error executing coin flip.', 'error');
        setIsFlipping(false);
        return;
      }

      // Align coin rotation to actual outcome (HEADS = even 360, TAILS = odd 180)
      const isLandedHeads = data.outcome === 'HEADS';
      const finalAngle = Math.round(targetDeg / 360) * 360 + (isLandedHeads ? 0 : 180);
      setCoinRotation(finalAngle);

      // 950ms flight animation time before settling
      setTimeout(() => {
        setDisplayedFace(data.outcome);
        playCoinSound('land');

        if (data.won) {
          playCoinSound('win');
          setCurrentStreak(data.streak);
          setCurrentMultiplier(data.multiplier);
          setFlipsHistory(data.flipsHistory || []);
          setOutcomeBanner({ type: 'win', text: `LANDED ON ${data.outcome}! +${data.multiplier}x` });

          if (data.streak >= 3) {
            confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.65 },
              colors: ['#eab308', '#22c55e', '#ffffff'],
            });
          }
          triggerToast(data.message, 'success');
        } else {
          playCoinSound('loss');
          setOutcomeBanner({ type: 'loss', text: `LANDED ON ${data.outcome}! BUSTED` });
          setIsPlaying(false);
          setFlipsHistory(data.flipsHistory || []);
          if (data.serverSeed) setServerSeed(data.serverSeed);
          triggerToast(data.message, 'error');
        }

        setIsFlipping(false);
      }, 950);
    } catch (err) {
      console.error('Coinflip flip error:', err);
      triggerToast('Network error processing coin flip.', 'error');
      setIsFlipping(false);
    }
  };

  // Cash out
  const handleCashout = async () => {
    if (!isPlaying || currentStreak === 0 || isCashingOut) return;

    setIsCashingOut(true);
    playCoinSound('cashout');

    try {
      const res = await fetch('/api/games/coinflip/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Cashout failed.', 'error');
        setIsCashingOut(false);
        return;
      }

      setIsPlaying(false);
      if (data.serverSeed) setServerSeed(data.serverSeed);
      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }

      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#eab308', '#22c55e', '#3b82f6', '#ffffff'],
      });

      triggerToast(data.message, 'success');
    } catch (err) {
      console.error('Coinflip cashout error:', err);
      triggerToast('Network error during cashout.', 'error');
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <div className="jp-coinflip-container">
      {/* ---------------- TOP HEADER BAR ---------------- */}
      <div className="jp-coinflip-header">
        <div className="jp-coinflip-title-wrap">
          <div className="jp-coinflip-badge">INSTANT WIN 98.0% RTP</div>
          <h2 className="jp-coinflip-title">
            <span className="jp-coinflip-icon">🪙</span> TURBO COINFLIP KES
          </h2>
        </div>

        <div className="jp-coinflip-header-actions">
          <button
            onClick={() => setShowProvablyModal(true)}
            className="jp-coinflip-seed-btn"
            title="Inspect Provably Fair Hash"
          >
            🛡️ Verify Hash
          </button>
        </div>
      </div>

      {/* ---------------- STREAK & FLIP HISTORY STRIP ---------------- */}
      <div className="jp-coinflip-history-strip">
        <span className="jp-history-label">FLIPS:</span>
        <div className="jp-history-pills">
          {flipsHistory.length === 0 ? (
            <span className="jp-history-empty">Choose Heads or Tails to spin the golden shilling</span>
          ) : (
            flipsHistory.map((f, i) => (
              <span
                key={i}
                className={`jp-flip-pill ${f.won ? 'pill-won' : 'pill-lost'}`}
                title={`Flip #${f.flip}: Picked ${f.choice}, Landed ${f.outcome}`}
              >
                {f.outcome === 'HEADS' ? '🦁 H' : '🛡️ T'}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ---------------- MAIN ARENA (3D COIN + DISPLAY) ---------------- */}
      <div className="jp-coinflip-arena">
        {/* Streak Ladder Display */}
        <div className="jp-streak-ladder">
          {[1, 2, 3, 4, 5].map((step) => {
            const mult = getCoinflipMultiplier(step);
            const isCompleted = currentStreak >= step;
            const isTarget = isPlaying && currentStreak === step - 1;

            return (
              <div
                key={step}
                className={`jp-ladder-badge ${isCompleted ? 'badge-won' : isTarget ? 'badge-target' : ''}`}
              >
                <span className="jp-badge-streak">{step}x Streak</span>
                <span className="jp-badge-mult">{mult}x</span>
              </div>
            );
          })}
        </div>

        {/* 3D Coin Stage */}
        <div className="jp-coin-stage">
          <div
            className={`jp-coin-3d ${isFlipping ? 'coin-spinning' : ''}`}
            style={{ transform: `rotateY(${coinRotation}deg)` }}
          >
            {/* Front Face: HEADS (Kenyan Lion Crest) */}
            <div className="jp-coin-face jp-coin-heads">
              <div className="jp-coin-inner">
                <div className="jp-coin-rim-ridges" />
                <div className="jp-coin-art">
                  <div className="jp-lion-symbol">🦁</div>
                  <span className="jp-coin-text">KENYA</span>
                  <span className="jp-coin-face-title">HEADS</span>
                </div>
              </div>
            </div>

            {/* Back Face: TAILS (Kenyan Coat of Arms / 20 KES) */}
            <div className="jp-coin-face jp-coin-tails">
              <div className="jp-coin-inner">
                <div className="jp-coin-rim-ridges" />
                <div className="jp-coin-art">
                  <div className="jp-shield-symbol">🛡️</div>
                  <span className="jp-coin-text">20 KES</span>
                  <span className="jp-coin-face-title">TAILS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Outcome Banner Overlay */}
          {outcomeBanner && (
            <div
              className={`jp-outcome-banner ${
                outcomeBanner.type === 'win' ? 'banner-win' : 'banner-loss'
              }`}
            >
              <span>{outcomeBanner.text}</span>
            </div>
          )}
        </div>

        {/* Live Multiplier & Value Badge */}
        {isPlaying && currentStreak > 0 && (
          <div className="jp-streak-status-card">
            <div className="jp-status-col">
              <span className="jp-status-label">CURRENT STREAK</span>
              <strong className="text-amber">{currentStreak} Wins ({currentMultiplier}x)</strong>
            </div>
            <div className="jp-status-col text-right">
              <span className="jp-status-label">CURRENT VALUE</span>
              <strong className="text-green">KES {currentPayout.toLocaleString()}</strong>
            </div>
          </div>
        )}

        {/* Side Selection Buttons */}
        <div className="jp-sides-grid">
          <button
            onClick={() => {
              setSelectedSide('HEADS');
              if (isPlaying) executeFlip('HEADS');
            }}
            disabled={isFlipping || isStarting}
            className={`jp-side-btn btn-heads ${selectedSide === 'HEADS' ? 'side-active' : ''}`}
          >
            <div className="jp-side-btn-content">
              <span className="jp-side-icon">🦁</span>
              <div className="jp-side-info">
                <span className="jp-side-name">HEADS</span>
                <span className="jp-side-mult">1.96x Multiplier</span>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedSide('TAILS');
              if (isPlaying) executeFlip('TAILS');
            }}
            disabled={isFlipping || isStarting}
            className={`jp-side-btn btn-tails ${selectedSide === 'TAILS' ? 'side-active' : ''}`}
          >
            <div className="jp-side-btn-content">
              <span className="jp-side-icon">🛡️</span>
              <div className="jp-side-info">
                <span className="jp-side-name">TAILS</span>
                <span className="jp-side-mult">1.96x Multiplier</span>
              </div>
            </div>
          </button>
        </div>

        {/* Bottom Betting & Action Controls */}
        <div className="jp-coinflip-controls">
          {/* Stake Box */}
          <div className="jp-control-card">
            <div className="jp-card-label-row">
              <span className="jp-card-title">BET AMOUNT (KES)</span>
              <span className="jp-card-limits">Min: 10 • Max: 50,000</span>
            </div>

            <div className="jp-stepper">
              <button
                onClick={() => setStake((p) => Math.max(10, p - 10))}
                disabled={isPlaying || isStarting || isFlipping}
                className="jp-step-btn"
              >
                −
              </button>
              <input
                type="number"
                value={stake}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) setStake(Math.max(10, Math.min(50000, val)));
                }}
                disabled={isPlaying || isStarting || isFlipping}
                className="jp-stake-input"
              />
              <button
                onClick={() => setStake((p) => Math.min(50000, p + 10))}
                disabled={isPlaying || isStarting || isFlipping}
                className="jp-step-btn"
              >
                +
              </button>
            </div>

            <div className="jp-quick-chips">
              {[50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  disabled={isPlaying || isStarting || isFlipping}
                  className={`jp-chip-btn ${stake === v ? 'chip-active' : ''}`}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => setStake((p) => Math.max(10, Math.floor(p / 2)))}
                disabled={isPlaying || isStarting || isFlipping}
                className="jp-chip-btn"
              >
                ½
              </button>
              <button
                onClick={() => setStake((p) => Math.min(50000, p * 2))}
                disabled={isPlaying || isStarting || isFlipping}
                className="jp-chip-btn"
              >
                2x
              </button>
            </div>
          </div>

          {/* Action Center */}
          <div className="jp-control-card">
            {!isPlaying ? (
              <button
                onClick={() => handleStartCoinflip(selectedSide)}
                disabled={isStarting || isFlipping}
                className="jp-flip-primary-btn"
              >
                <span>{isStarting ? 'PREPARING FLIP...' : `FLIP ${selectedSide} (KES ${stake.toLocaleString()})`}</span>
              </button>
            ) : (
              <div className="jp-active-actions">
                <button
                  onClick={() => executeFlip(selectedSide)}
                  disabled={isFlipping}
                  className="jp-flip-again-btn"
                >
                  <span>FLIP {selectedSide} AGAIN</span>
                </button>

                <button
                  onClick={handleCashout}
                  disabled={currentStreak === 0 || isCashingOut || isFlipping}
                  className={`jp-cashout-btn ${currentStreak > 0 ? 'cashout-ready' : ''}`}
                >
                  {isCashingOut ? (
                    <span>CREDITING WALLET...</span>
                  ) : currentStreak > 0 ? (
                    <div className="jp-cashout-content">
                      <span className="jp-cashout-lead">CASHOUT</span>
                      <span className="jp-cashout-amt">
                        KES {currentPayout.toLocaleString()} ({currentMultiplier}x)
                      </span>
                    </div>
                  ) : (
                    <span>WIN FLIP TO CASHOUT</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- PROVABLY FAIR MODAL ---------------- */}
      {showProvablyModal && (
        <div className="jp-modal-overlay" onClick={() => setShowProvablyModal(false)}>
          <div className="jp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="jp-modal-header">
              <h3 className="jp-modal-title">🛡️ Provably Fair Coinflip Engine</h3>
              <button onClick={() => setShowProvablyModal(false)} className="jp-modal-close">✕</button>
            </div>
            <div className="jp-modal-body">
              <p className="jp-pf-desc">
                JetPesa Turbo Coinflip uses cryptographic HMAC-SHA256 to ensure each flip is 100% fair and
                predetermined before the coin leaves your thumb.
              </p>

              <div className="jp-pf-field">
                <label>Round ID:</label>
                <input readOnly value={roundId || 'No active round'} />
              </div>

              <div className="jp-pf-field">
                <label>Server Seed Hash (SHA-256):</label>
                <input readOnly value={serverSeedHash || 'Generated on flip start'} />
              </div>

              {serverSeed && (
                <div className="jp-pf-field">
                  <label>Revealed Server Seed (Plaintext):</label>
                  <input readOnly value={serverSeed} />
                </div>
              )}

              <div className="jp-pf-math-box">
                <div className="jp-math-row">
                  <span>Theoretical RTP:</span> <strong>98.0%</strong>
                </div>
                <div className="jp-math-row">
                  <span>Single Flip Multiplier:</span> <strong>1.96x</strong>
                </div>
                <div className="jp-math-row">
                  <span>Streak Multiplier Formula:</span> <strong>1.96^Streak</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STYLES ---------------- */}
      <style jsx>{`
        .jp-coinflip-container {
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

        .jp-coinflip-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .jp-coinflip-badge {
          font-size: 10px;
          font-weight: 800;
          color: #eab308;
          letter-spacing: 1px;
        }

        .jp-coinflip-title {
          font-size: 18px;
          font-weight: 800;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-coinflip-icon {
          font-size: 18px;
        }

        .jp-coinflip-seed-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }
        .jp-coinflip-seed-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        /* History Strip */
        .jp-coinflip-history-strip {
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

        .jp-flip-pill {
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

        /* Arena */
        .jp-coinflip-arena {
          display: flex;
          flex-direction: column;
          gap: 18px;
          background: radial-gradient(circle at 50% 30%, #1e293b 0%, #090d16 85%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 24px;
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.7);
        }

        /* Streak Ladder */
        .jp-streak-ladder {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .jp-ladder-badge {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 6px 4px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2px;
          transition: all 0.2s;
        }

        .jp-badge-streak {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 700;
        }

        .jp-badge-mult {
          font-size: 12px;
          font-weight: 900;
          color: #cbd5e1;
        }

        .badge-won {
          background: rgba(34, 197, 94, 0.15);
          border-color: #22c55e;
        }
        .badge-won .jp-badge-mult {
          color: #22c55e;
        }

        .badge-target {
          background: rgba(234, 179, 8, 0.18);
          border-color: #eab308;
          box-shadow: 0 0 12px rgba(234, 179, 8, 0.3);
          transform: translateY(-2px);
        }
        .badge-target .jp-badge-mult {
          color: #eab308;
        }

        /* 3D Coin Stage */
        .jp-coin-stage {
          position: relative;
          width: 100%;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 1000px;
        }

        .jp-coin-3d {
          position: relative;
          width: 130px;
          height: 130px;
          transform-style: preserve-3d;
          transition: transform 0.95s cubic-bezier(0.18, 0.89, 0.32, 1.15);
        }

        .jp-coin-face {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          backface-visibility: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), inset 0 0 15px rgba(255, 255, 255, 0.4);
        }

        .jp-coin-heads {
          background: radial-gradient(circle at 35% 35%, #fef08a 0%, #eab308 55%, #a16207 100%);
          border: 4px solid #fef08a;
          transform: rotateY(0deg);
        }

        .jp-coin-tails {
          background: radial-gradient(circle at 35% 35%, #fde047 0%, #ca8a04 55%, #854d0e 100%);
          border: 4px solid #fde047;
          transform: rotateY(180deg);
        }

        .jp-coin-inner {
          position: relative;
          width: 90%;
          height: 90%;
          border: 2px dashed rgba(161, 98, 7, 0.6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-coin-art {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.1;
        }

        .jp-lion-symbol,
        .jp-shield-symbol {
          font-size: 38px;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
        }

        .jp-coin-text {
          font-size: 10px;
          font-weight: 900;
          color: #713f12;
          letter-spacing: 1px;
          margin-top: 2px;
        }

        .jp-coin-face-title {
          font-size: 12px;
          font-weight: 950;
          color: #422006;
          letter-spacing: 1.5px;
        }

        /* Outcome Banner */
        .jp-outcome-banner {
          position: absolute;
          bottom: 10px;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.5px;
          animation: popBanner 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }

        .banner-win {
          background: linear-gradient(135deg, #15803d, #22c55e);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
        }

        .banner-loss {
          background: linear-gradient(135deg, #b91c1c, #ef4444);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
        }

        @keyframes popBanner {
          0% { transform: translateY(10px) scale(0.8); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }

        /* Streak Status */
        .jp-streak-status-card {
          display: flex;
          justify-content: space-between;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px 14px;
        }

        .jp-status-col {
          display: flex;
          flex-direction: column;
        }
        .text-right { text-align: right; }

        .jp-status-label {
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
        }

        .text-amber { color: #f59e0b; }
        .text-green { color: #22c55e; }

        /* Sides Selection */
        .jp-sides-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .jp-side-btn {
          background: #0f172a;
          border: 2px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-side-btn:hover:not(:disabled) {
          border-color: rgba(234, 179, 8, 0.5);
          background: rgba(15, 23, 42, 0.9);
        }

        .side-active {
          border-color: #eab308;
          background: rgba(234, 179, 8, 0.12);
          box-shadow: 0 0 16px rgba(234, 179, 8, 0.3);
        }

        .jp-side-btn-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .jp-side-icon {
          font-size: 28px;
        }

        .jp-side-info {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .jp-side-name {
          font-size: 15px;
          font-weight: 900;
          color: #ffffff;
        }

        .jp-side-mult {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 700;
        }

        /* Controls */
        .jp-coinflip-controls {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .jp-coinflip-controls {
            grid-template-columns: 1fr;
          }
        }

        .jp-control-card {
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

        .jp-card-limits {
          font-size: 10px;
          color: #64748b;
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
          background: rgba(234, 179, 8, 0.2);
          border-color: #eab308;
          color: #eab308;
        }

        .jp-flip-primary-btn {
          width: 100%;
          height: 100%;
          min-height: 80px;
          background: linear-gradient(135deg, #ca8a04, #eab308);
          border: none;
          border-radius: 10px;
          color: #422006;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(234, 179, 8, 0.4);
          transition: all 0.2s;
        }
        .jp-flip-primary-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(234, 179, 8, 0.6);
        }

        .jp-active-actions {
          display: grid;
          grid-template-columns: 1fr 1.5fr;
          gap: 8px;
          height: 100%;
          min-height: 70px;
        }

        .jp-flip-again-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .jp-flip-again-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }

        .jp-cashout-btn {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          cursor: not-allowed;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cashout-ready {
          background: linear-gradient(135deg, #15803d, #22c55e);
          border-color: #22c55e;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
        }
        .cashout-ready:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
        }

        .jp-cashout-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.2;
        }

        .jp-cashout-lead {
          font-size: 10px;
          letter-spacing: 1px;
        }

        .jp-cashout-amt {
          font-size: 14px;
          font-weight: 900;
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

        .jp-modal-content {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          width: 100%;
          max-width: 480px;
          padding: 20px;
          color: #f1f5f9;
        }

        .jp-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .jp-modal-title {
          font-size: 16px;
          font-weight: 800;
          margin: 0;
        }

        .jp-modal-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 18px;
          cursor: pointer;
        }

        .jp-pf-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .jp-pf-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }

        .jp-pf-field label {
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
        }

        .jp-pf-field input {
          background: #090d16;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #f1f5f9;
          font-family: monospace;
          font-size: 11px;
          padding: 8px 10px;
        }

        .jp-pf-math-box {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        }

        .jp-math-row {
          display: flex;
          justify-content: space-between;
        }
        .jp-math-row span { color: #94a3b8; }
        .jp-math-row strong { color: #22c55e; }
      `}</style>
    </div>
  );
}
