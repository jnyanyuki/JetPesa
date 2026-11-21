'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  PENALTY_SPOTS,
  SPOT_LABELS,
  PENALTY_MULTIPLIERS,
  MAX_SHOTS,
  getPenaltyMultiplier,
} from '../../../lib/games/penaltyEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Synthesizer (Realistic Turf Sounds without External Assets) */
/* -------------------------------------------------------------------------- */
function playAudioFX(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'kick') {
      // Deep bass kick thud + turf scuff
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'goal') {
      // Crowd cheer & triumphant chord
      [392.0, 523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.05 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.4);
      });
    } else if (type === 'whistle') {
      // Referee whistle double burst
      [0, 0.12].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2400, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.09);
      });
    } else if (type === 'save') {
      // Glove slap & dull thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'cashout') {
      // Coin cascade fanfare
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.06);
        osc.stop(ctx.currentTime + i * 0.06 + 0.35);
      });
    } else if (type === 'aim') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }
}

export default function PenaltyGame({
  balance = 0,
  onBalanceChange,
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Config & Betting
  const [stake, setStake] = useState(50);
  const [isStarting, setIsStarting] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);

  // Active Shootout State
  const [roundId, setRoundId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0); // 0 to 5
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [shotsHistory, setShotsHistory] = useState([]); // [{ shot, spot, keeperDive, result, multiplier }]
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [serverSeed, setServerSeed] = useState('');
  const [gameResult, setGameResult] = useState(null); // 'WON', 'SAVED', null

  // Animation & Visual State
  const [selectedSpot, setSelectedSpot] = useState(null); // hovered or currently targeted spot
  const [animatingKick, setAnimatingKick] = useState(null); // { spot, keeperDive, isGoal }
  const [goalBannerText, setGoalBannerText] = useState(null); // "GOAL!" or "SAVED!"
  const [showProvablyModal, setShowProvablyModal] = useState(false);

  // Restore any active penalty round on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreActiveRound() {
      try {
        const res = await fetch('/api/games/penalty/state');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.round && isMounted) {
            const r = data.round;
            setRoundId(r.id);
            setStake(r.stake);
            setCurrentStreak(r.currentStreak);
            setCurrentMultiplier(r.currentMultiplier);
            setShotsHistory(r.shotsHistory || []);
            setServerSeedHash(r.serverSeedHash || '');
            setIsPlaying(true);
            setGameResult(null);
          }
        }
      } catch (err) {
        console.warn('Could not restore active Penalty shootout:', err);
      }
    }
    restoreActiveRound();
    return () => { isMounted = false; };
  }, []);

  // Prospective values
  const currentPayout = useMemo(() => {
    if (!isPlaying || currentStreak === 0) return 0;
    return Math.floor(stake * currentMultiplier * 100) / 100;
  }, [isPlaying, currentStreak, stake, currentMultiplier]);

  const nextMultiplier = useMemo(() => {
    return getPenaltyMultiplier(currentStreak + 1);
  }, [currentStreak]);

  const nextPayout = useMemo(() => {
    return Math.floor(stake * nextMultiplier * 100) / 100;
  }, [stake, nextMultiplier]);

  // Start new shootout
  const handleStartShootout = async () => {
    if (balance < stake) {
      triggerToast('Insufficient funds. Top up via M-Pesa to play.', 'warning');
      onOpenDeposit();
      return;
    }

    setIsStarting(true);
    setGameResult(null);
    setGoalBannerText(null);
    setAnimatingKick(null);
    setSelectedSpot(null);
    playAudioFX('whistle');

    try {
      const res = await fetch('/api/games/penalty/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Failed to start penalty shootout.', 'error');
        setIsStarting(false);
        return;
      }

      setRoundId(data.roundId);
      setCurrentStreak(0);
      setCurrentMultiplier(1.0);
      setShotsHistory([]);
      setServerSeedHash(data.serverSeedHash || '');
      setServerSeed('');
      setIsPlaying(true);
      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }
      triggerToast('Shootout started! Pick a corner to kick.', 'info');
    } catch (err) {
      console.error('Penalty start error:', err);
      triggerToast('Network error starting shootout.', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  // Execute kick towards a chosen target spot
  const handleTakeKick = async (spot) => {
    if (!isPlaying || isShooting || animatingKick) return;

    setIsShooting(true);
    setSelectedSpot(spot);
    playAudioFX('kick');

    try {
      const res = await fetch('/api/games/penalty/shoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Failed to take penalty kick.', 'error');
        setIsShooting(false);
        return;
      }

      // Begin in-flight and keeper animation
      setAnimatingKick({
        spot,
        keeperDive: data.keeperDive,
        isGoal: data.isGoal,
      });

      // 650ms animation flight before result resolves
      setTimeout(() => {
        if (data.isGoal) {
          playAudioFX('goal');
          setGoalBannerText('GOAL! ⚽');
          setCurrentStreak(data.currentStreak);
          setCurrentMultiplier(data.currentMultiplier);
          setShotsHistory(data.shotsHistory || []);

          if (data.isCleared || data.status === 'WON') {
            // Full 5/5 cleared!
            setGameResult('WON');
            setIsPlaying(false);
            if (data.serverSeed) setServerSeed(data.serverSeed);
            if (typeof data.newBalance === 'number') onBalanceChange(data.newBalance);

            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#ffffff'],
            });
            triggerToast(data.message, 'success');
          } else {
            triggerToast(data.message, 'success');
          }
        } else {
          // Saved!
          playAudioFX('save');
          setGoalBannerText('SAVED! 🧤');
          setGameResult('SAVED');
          setIsPlaying(false);
          setShotsHistory(data.shotsHistory || []);
          if (data.serverSeed) setServerSeed(data.serverSeed);
          triggerToast(data.message, 'error');
        }

        setIsShooting(false);
        // Clear banner after 1.8 seconds
        setTimeout(() => {
          setAnimatingKick(null);
          setGoalBannerText(null);
        }, 1800);
      }, 700);
    } catch (err) {
      console.error('Penalty shoot error:', err);
      triggerToast('Error processing penalty kick.', 'error');
      setIsShooting(false);
      setAnimatingKick(null);
    }
  };

  // Cash out early with current multiplier
  const handleCashout = async () => {
    if (!isPlaying || currentStreak === 0 || isCashingOut) return;

    setIsCashingOut(true);
    playAudioFX('cashout');

    try {
      const res = await fetch('/api/games/penalty/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Cashout failed.', 'error');
        setIsCashingOut(false);
        return;
      }

      setGameResult('WON');
      setIsPlaying(false);
      if (data.serverSeed) setServerSeed(data.serverSeed);
      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }

      confetti({
        particleCount: 90,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#22c55e', '#f59e0b', '#ffffff'],
      });

      triggerToast(data.message, 'success');
    } catch (err) {
      console.error('Penalty cashout error:', err);
      triggerToast('Network error during cashout.', 'error');
    } finally {
      setIsCashingOut(false);
    }
  };

  // Quick random kick
  const handleRandomKick = () => {
    if (!isPlaying || isShooting || animatingKick) return;
    const randomSpot = PENALTY_SPOTS[Math.floor(Math.random() * PENALTY_SPOTS.length)];
    handleTakeKick(randomSpot);
  };

  // Helper for coordinates inside the goal SVG / net
  const getSpotCoordinates = (spot) => {
    switch (spot) {
      case 'TL': return { x: '18%', y: '24%' };
      case 'TR': return { x: '82%', y: '24%' };
      case 'MID': return { x: '50%', y: '32%' };
      case 'BL': return { x: '18%', y: '72%' };
      case 'BR': return { x: '82%', y: '72%' };
      default: return { x: '50%', y: '50%' };
    }
  };

  // Helper for Keeper translation during dive
  const getKeeperTransform = () => {
    if (!animatingKick) return 'translate(-50%, 0)';
    const dive = animatingKick.keeperDive;
    switch (dive) {
      case 'TL': return 'translate(-140%, -60%) rotate(-35deg)';
      case 'TR': return 'translate(40%, -60%) rotate(35deg)';
      case 'MID': return 'translate(-50%, -40%) scale(1.1)';
      case 'BL': return 'translate(-150%, 20%) rotate(-55deg)';
      case 'BR': return 'translate(50%, 20%) rotate(55deg)';
      default: return 'translate(-50%, 0)';
    }
  };

  // Helper for Ball translation during shot flight
  const getBallFlightStyle = () => {
    if (!animatingKick) return { bottom: '22px', left: '50%', transform: 'translate(-50%, 0) scale(1)' };
    const targetCoords = getSpotCoordinates(animatingKick.spot);
    return {
      left: targetCoords.x,
      top: targetCoords.y,
      transform: 'translate(-50%, -50%) scale(0.55)',
      transition: 'all 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
    };
  };

  return (
    <div className="jp-penalty-container">
      {/* ---------------- TOP HEADER BAR ---------------- */}
      <div className="jp-penalty-header">
        <div className="jp-penalty-title-wrap">
          <div className="jp-penalty-badge">SPORTS ARCADE</div>
          <h2 className="jp-penalty-title">
            <span className="jp-penalty-ball-icon">⚽</span> JETPESA PENALTY SHOOTOUT
          </h2>
        </div>

        <div className="jp-penalty-header-actions">
          <div className="jp-penalty-rtp-badge">
            <span className="jp-rtp-dot" /> 96.5% RTP • PROVABLY FAIR
          </div>
          <button
            onClick={() => setShowProvablyModal(true)}
            className="jp-penalty-seed-btn"
            title="Inspect Provably Fair Hash"
          >
            🛡️ Verify Seed
          </button>
        </div>
      </div>

      {/* ---------------- 5-SHOT MULTIPLIER LADDER ---------------- */}
      <div className="jp-penalty-ladder">
        {PENALTY_MULTIPLIERS.map((mult, index) => {
          const shotNum = index + 1;
          const isScored = shotsHistory[index]?.result === 'GOAL';
          const isSaved = shotsHistory[index]?.result === 'SAVED';
          const isCurrentTarget = isPlaying && currentStreak === index;

          let badgeClass = 'jp-ladder-step';
          if (isScored) badgeClass += ' jp-step-scored';
          else if (isSaved) badgeClass += ' jp-step-saved';
          else if (isCurrentTarget) badgeClass += ' jp-step-current';

          return (
            <div key={shotNum} className={badgeClass}>
              <div className="jp-step-shot-label">Shot {shotNum}</div>
              <div className="jp-step-icon">
                {isScored ? '⚽' : isSaved ? '🧤' : isCurrentTarget ? '🎯' : '⚪'}
              </div>
              <div className="jp-step-mult">{mult}x</div>
            </div>
          );
        })}
      </div>

      {/* ---------------- MAIN STADIUM & GOAL ARENA ---------------- */}
      <div className="jp-penalty-stadium">
        {/* Stadium Floodlights & Crowd Background Pattern */}
        <div className="jp-stadium-lights" />
        <div className="jp-pitch-grass" />

        {/* Goal Post Frame & Net */}
        <div className="jp-goal-arena">
          <div className="jp-crossbar" />
          <div className="jp-post-left" />
          <div className="jp-post-right" />
          <div className="jp-goal-net" />

          {/* 5 Interactive Target Hotspots */}
          {PENALTY_SPOTS.map((spot) => {
            const coords = getSpotCoordinates(spot);
            const isTargeted = selectedSpot === spot;
            const isDisabled = !isPlaying || isShooting || Boolean(animatingKick);

            return (
              <button
                key={spot}
                onClick={() => handleTakeKick(spot)}
                onMouseEnter={() => {
                  if (!isDisabled) {
                    setSelectedSpot(spot);
                    playAudioFX('aim');
                  }
                }}
                disabled={isDisabled}
                style={{ left: coords.x, top: coords.y }}
                className={`jp-target-hotspot jp-target-${spot.toLowerCase()} ${
                  isTargeted ? 'jp-target-active' : ''
                } ${isDisabled ? 'jp-target-disabled' : ''}`}
                title={SPOT_LABELS[spot]}
              >
                <div className="jp-target-reticle">
                  <span className="jp-reticle-ring" />
                  <span className="jp-reticle-cross" />
                  <span className="jp-reticle-label">{spot}</span>
                </div>
              </button>
            );
          })}

          {/* Dynamic Goalkeeper Character */}
          <div
            className={`jp-goalkeeper ${animatingKick ? 'jp-keeper-diving' : 'jp-keeper-idle'}`}
            style={{ transform: getKeeperTransform() }}
          >
            <div className="jp-keeper-svg-wrap">
              {/* Goalkeeper Silhouette Vector */}
              <svg viewBox="0 0 100 120" className="jp-keeper-svg">
                {/* Body & Jersey */}
                <ellipse cx="50" cy="22" rx="10" ry="11" fill="#facc15" />
                <path d="M50 14 Q58 10 50 8 Q42 10 50 14" fill="#1e293b" />
                <path d="M35 34 Q50 30 65 34 L62 70 Q50 72 38 70 Z" fill="#0284c7" />
                {/* Arms & Big Keeper Gloves */}
                <path d="M36 36 L18 48 L14 42" stroke="#0284c7" strokeWidth="8" strokeLinecap="round" />
                <circle cx="12" cy="42" r="7" fill="#ef4444" />
                <path d="M64 36 L82 48 L86 42" stroke="#0284c7" strokeWidth="8" strokeLinecap="round" />
                <circle cx="88" cy="42" r="7" fill="#ef4444" />
                {/* Shorts & Legs */}
                <path d="M38 70 L34 94 L46 94 L48 72" fill="#0f172a" />
                <path d="M62 70 L66 94 L54 94 L52 72" fill="#0f172a" />
                {/* Boots */}
                <ellipse cx="40" cy="98" rx="8" ry="4" fill="#e2e8f0" />
                <ellipse cx="60" cy="98" rx="8" ry="4" fill="#e2e8f0" />
              </svg>
            </div>
          </div>

          {/* The Football & Penalty Spot */}
          <div className="jp-penalty-spot-mark" />
          <div
            className={`jp-football ${animatingKick ? 'jp-ball-kicked' : ''}`}
            style={getBallFlightStyle()}
          >
            <div className="jp-ball-sphere">⚽</div>
          </div>

          {/* Goal / Saved Banner Overlay */}
          {goalBannerText && (
            <div
              className={`jp-outcome-banner ${
                goalBannerText.includes('GOAL') ? 'jp-banner-goal' : 'jp-banner-saved'
              }`}
            >
              <div className="jp-banner-text">{goalBannerText}</div>
              {goalBannerText.includes('GOAL') && currentMultiplier > 1 && (
                <div className="jp-banner-sub">
                  Payout: KES {currentPayout.toLocaleString()} ({currentMultiplier}x)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- BOTTOM CONTROLS & STAKE PANEL ---------------- */}
      <div className="jp-penalty-controls">
        {/* Stake Configuration */}
        <div className="jp-penalty-stake-box">
          <div className="jp-stake-label-row">
            <span className="jp-stake-title">STAKE (KES)</span>
            <span className="jp-stake-limits">Min: KES 10 • Max: KES 40,000</span>
          </div>

          <div className="jp-stake-stepper">
            <button
              onClick={() => setStake((prev) => Math.max(10, prev - 10))}
              disabled={isPlaying || isStarting}
              className="jp-step-btn"
            >
              −
            </button>
            <input
              type="number"
              value={stake}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val)) setStake(Math.max(10, Math.min(40000, val)));
              }}
              disabled={isPlaying || isStarting}
              className="jp-stake-input"
            />
            <button
              onClick={() => setStake((prev) => Math.min(40000, prev + 10))}
              disabled={isPlaying || isStarting}
              className="jp-step-btn"
            >
              +
            </button>
          </div>

          {/* Quick Stake Chips: 50, 100, 250, 500 */}
          <div className="jp-quick-chips">
            {[50, 100, 250, 500].map((val) => (
              <button
                key={val}
                onClick={() => setStake(val)}
                disabled={isPlaying || isStarting}
                className={`jp-chip-btn ${stake === val ? 'jp-chip-active' : ''}`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Action Center */}
        <div className="jp-penalty-action-box">
          {!isPlaying ? (
            <button
              onClick={handleStartShootout}
              disabled={isStarting}
              className="jp-start-shootout-btn"
            >
              {isStarting ? (
                <span>PREPARING SHOOTOUT...</span>
              ) : (
                <span>START SHOOTOUT (KES {stake.toLocaleString()})</span>
              )}
            </button>
          ) : (
            <div className="jp-active-actions">
              {/* Random Shot */}
              <button
                onClick={handleRandomKick}
                disabled={isShooting || Boolean(animatingKick)}
                className="jp-random-kick-btn"
                title="Shoot randomly at one of 5 spots"
              >
                🎲 RANDOM SHOT
              </button>

              {/* Cashout Button */}
              <button
                onClick={handleCashout}
                disabled={currentStreak === 0 || isCashingOut || isShooting}
                className={`jp-penalty-cashout-btn ${currentStreak > 0 ? 'jp-cashout-ready' : ''}`}
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
                  <span>SCORE 1ST GOAL TO CASHOUT</span>
                )}
              </button>
            </div>
          )}

          {/* In-Play Status Info */}
          {isPlaying && (
            <div className="jp-inplay-info">
              <span>Goal Streak: <strong>{currentStreak} / {MAX_SHOTS}</strong></span>
              <span>Next Goal: <strong>{nextMultiplier}x (KES {nextPayout.toLocaleString()})</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- PROVABLY FAIR MODAL ---------------- */}
      {showProvablyModal && (
        <div className="jp-modal-overlay" onClick={() => setShowProvablyModal(false)}>
          <div className="jp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="jp-modal-header">
              <h3 className="jp-modal-title">🛡️ Provably Fair Shootout Engine</h3>
              <button onClick={() => setShowProvablyModal(false)} className="jp-modal-close">✕</button>
            </div>
            <div className="jp-modal-body">
              <p className="jp-pf-desc">
                JetPesa Penalty Shootout uses cryptographic HMAC-SHA256 hash algorithms to guarantee that every
                goalkeeper dive and goal outcome is predetermined and tamper-proof before your kick is taken.
              </p>

              <div className="jp-pf-field">
                <label>Round ID:</label>
                <input readOnly value={roundId || 'No active round'} />
              </div>

              <div className="jp-pf-field">
                <label>Server Seed Hash (SHA-256):</label>
                <input readOnly value={serverSeedHash || 'Generated upon shootout start'} />
              </div>

              {serverSeed && (
                <div className="jp-pf-field">
                  <label>Revealed Server Seed (Plaintext):</label>
                  <input readOnly value={serverSeed} />
                </div>
              )}

              <div className="jp-pf-math-box">
                <div className="jp-math-row">
                  <span>Theoretical RTP:</span> <strong>96.5%</strong>
                </div>
                <div className="jp-math-row">
                  <span>Goal Success Probability:</span> <strong>80.0% per kick</strong>
                </div>
                <div className="jp-math-row">
                  <span>Max Streak Multiplier:</span> <strong>30.72x (5 Goals)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STYLES ---------------- */}
      <style jsx>{`
        .jp-penalty-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #090d16;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px;
          color: #f1f5f9;
          font-family: inherit;
        }

        .jp-penalty-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .jp-penalty-badge {
          font-size: 10px;
          font-weight: 800;
          color: #f59e0b;
          letter-spacing: 1px;
        }

        .jp-penalty-title {
          font-size: 18px;
          font-weight: 800;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-penalty-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .jp-penalty-rtp-badge {
          font-size: 11px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          padding: 4px 10px;
          border-radius: 20px;
        }

        .jp-rtp-dot {
          width: 7px;
          height: 7px;
          background: #22c55e;
          border-radius: 50%;
        }

        .jp-penalty-seed-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-penalty-seed-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        /* Multiplier Ladder */
        .jp-penalty-ladder {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .jp-ladder-step {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 8px 6px;
          text-align: center;
          transition: all 0.3s;
        }

        .jp-step-shot-label {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
        }

        .jp-step-icon {
          font-size: 18px;
          margin: 4px 0;
        }

        .jp-step-mult {
          font-size: 13px;
          font-weight: 800;
          color: #cbd5e1;
        }

        .jp-step-scored {
          background: rgba(34, 197, 94, 0.15);
          border-color: #22c55e;
        }
        .jp-step-scored .jp-step-mult {
          color: #22c55e;
        }

        .jp-step-saved {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
        }
        .jp-step-saved .jp-step-mult {
          color: #ef4444;
        }

        .jp-step-current {
          background: rgba(245, 158, 11, 0.15);
          border-color: #f59e0b;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
          transform: translateY(-2px);
        }
        .jp-step-current .jp-step-mult {
          color: #f59e0b;
        }

        /* Stadium & Goal Arena */
        .jp-penalty-stadium {
          position: relative;
          width: 100%;
          height: 380px;
          background: radial-gradient(circle at 50% 30%, #1e293b 0%, #090d16 85%);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.8);
        }

        .jp-stadium-lights {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 80px;
          background: radial-gradient(ellipse at 50% -20%, rgba(56, 189, 248, 0.25), transparent 70%);
          pointer-events: none;
        }

        .jp-pitch-grass {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 140px;
          background: linear-gradient(180deg, #14532d 0%, #052e16 100%);
          transform: perspective(300px) rotateX(25deg);
          transform-origin: bottom center;
          border-top: 2px solid rgba(255, 255, 255, 0.2);
        }

        .jp-goal-arena {
          position: absolute;
          top: 30px;
          left: 50%;
          transform: translateX(-50%);
          width: 86%;
          max-width: 580px;
          height: 270px;
        }

        .jp-crossbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 8px;
          background: linear-gradient(180deg, #ffffff, #94a3b8);
          border-radius: 4px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
          z-index: 5;
        }

        .jp-post-left,
        .jp-post-right {
          position: absolute;
          top: 0;
          width: 8px;
          height: 100%;
          background: linear-gradient(90deg, #ffffff, #94a3b8);
          border-radius: 4px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
          z-index: 5;
        }
        .jp-post-left { left: 0; }
        .jp-post-right { right: 0; }

        .jp-goal-net {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          bottom: 0;
          background: 
            linear-gradient(45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
          border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        }

        /* 5 Target Hotspots */
        .jp-target-hotspot {
          position: absolute;
          transform: translate(-50%, -50%);
          width: 64px;
          height: 64px;
          background: transparent;
          border: none;
          cursor: pointer;
          z-index: 10;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }
        .jp-target-hotspot:not(.jp-target-disabled):hover {
          transform: translate(-50%, -50%) scale(1.15);
        }
        .jp-target-disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .jp-target-reticle {
          position: relative;
          width: 48px;
          height: 48px;
          border: 2px dashed rgba(245, 158, 11, 0.7);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(245, 158, 11, 0.1);
          animation: reticlePulse 2s infinite ease-in-out;
        }

        .jp-target-active .jp-target-reticle {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.25);
          box-shadow: 0 0 16px rgba(34, 197, 94, 0.6);
        }

        .jp-reticle-label {
          font-size: 11px;
          font-weight: 800;
          color: #f59e0b;
        }
        .jp-target-active .jp-reticle-label {
          color: #22c55e;
        }

        @keyframes reticlePulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.08); opacity: 1; }
        }

        /* Goalkeeper */
        .jp-goalkeeper {
          position: absolute;
          bottom: 20px;
          left: 50%;
          width: 90px;
          height: 110px;
          z-index: 4;
          transition: transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2);
          pointer-events: none;
        }

        .jp-keeper-svg-wrap {
          width: 100%;
          height: 100%;
        }

        .jp-keeper-svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.7));
        }

        .jp-keeper-idle {
          animation: keeperStance 2.5s infinite ease-in-out;
        }

        @keyframes keeperStance {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -4px); }
        }

        /* Penalty Spot & Ball */
        .jp-penalty-spot-mark {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 14px;
          height: 6px;
          background: #ffffff;
          border-radius: 50%;
          opacity: 0.6;
        }

        .jp-football {
          position: absolute;
          z-index: 8;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          pointer-events: none;
        }

        .jp-ball-sphere {
          line-height: 1;
          filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.8));
        }

        /* Banner Outcome */
        .jp-outcome-banner {
          position: absolute;
          top: 35%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
          padding: 12px 28px;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
          animation: bannerPop 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }

        .jp-banner-goal {
          background: linear-gradient(135deg, #15803d, #22c55e);
          border: 2px solid #86efac;
        }

        .jp-banner-saved {
          background: linear-gradient(135deg, #b91c1c, #ef4444);
          border: 2px solid #fca5a5;
        }

        .jp-banner-text {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #ffffff;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .jp-banner-sub {
          font-size: 13px;
          font-weight: 700;
          color: #dcfce7;
          margin-top: 4px;
        }

        @keyframes bannerPop {
          0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }

        /* Controls Panel */
        .jp-penalty-controls {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .jp-penalty-controls {
            grid-template-columns: 1fr;
          }
        }

        .jp-penalty-stake-box {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .jp-stake-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-stake-title {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
        }

        .jp-stake-limits {
          font-size: 10px;
          color: #64748b;
        }

        .jp-stake-stepper {
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
          color: #f1f5f9;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .jp-step-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.16);
        }

        .jp-stake-input {
          flex: 1;
          height: 36px;
          background: #090d16;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #f1f5f9;
          font-size: 15px;
          font-weight: 800;
          text-align: center;
        }

        .jp-quick-chips {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }

        .jp-chip-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 0;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-chip-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .jp-chip-active {
          background: rgba(245, 158, 11, 0.2);
          border-color: #f59e0b;
          color: #f59e0b;
        }

        /* Action Center */
        .jp-penalty-action-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .jp-start-shootout-btn {
          width: 100%;
          height: 100%;
          min-height: 80px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          border: none;
          border-radius: 10px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.5px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
          transition: all 0.2s;
        }
        .jp-start-shootout-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
        }

        .jp-active-actions {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 8px;
          height: 100%;
          min-height: 70px;
        }

        .jp-random-kick-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-random-kick-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }

        .jp-penalty-cashout-btn {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
          cursor: not-allowed;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .jp-cashout-ready {
          background: linear-gradient(135deg, #ea580c, #f59e0b);
          border-color: #f59e0b;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
        }
        .jp-cashout-ready:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
        }

        .jp-cashout-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.2;
        }

        .jp-cashout-lead {
          font-size: 11px;
          letter-spacing: 1px;
          opacity: 0.9;
        }

        .jp-cashout-amt {
          font-size: 15px;
          font-weight: 900;
        }

        .jp-inplay-info {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #94a3b8;
          padding: 4px 6px;
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
