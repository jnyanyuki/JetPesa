'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  TOTAL_TILES,
  MIN_MINES,
  MAX_MINES,
  calculateMinesMultiplier,
  getMinesMultiplierLadder,
} from '../../../lib/games/minesEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Sound Synthesizer (Zero External Audio File Dependencies)    */
/* -------------------------------------------------------------------------- */
function playSynthSound(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'gem') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.18); // D6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'cashout') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.07 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.3);
      });
    } else if (type === 'boom') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    }
  } catch {
    // Audio context may be blocked by browser policy until gesture
  }
}

export default function MinesGame({
  balance = 0,
  onBalanceChange,
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Game Configuration State
  const [stake, setStake] = useState(10);
  const [minesCount, setMinesCount] = useState(3);

  // Active Round State
  const [roundId, setRoundId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedTiles, setRevealedTiles] = useState([]); // indices: [2, 5, 11]
  const [minePositions, setMinePositions] = useState([]); // revealed when game over
  const [lastBustedTile, setLastBustedTile] = useState(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [serverSeed, setServerSeed] = useState('');
  const [gameResult, setGameResult] = useState(null); // 'WON', 'BUSTED', null

  // Fetch or restore any active session on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreActiveRound() {
      try {
        const res = await fetch('/api/games/mines/state');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.round && isMounted) {
            const r = data.round;
            setRoundId(r.id);
            setStake(r.stake);
            setMinesCount(r.minesCount);
            setRevealedTiles(r.revealedTiles || []);
            setCurrentMultiplier(r.currentMultiplier || 1.0);
            setServerSeedHash(r.serverSeedHash || '');
            setIsPlaying(true);
            setGameResult(null);
          }
        }
      } catch (err) {
        console.warn('Could not restore active Mines session:', err);
      }
    }
    restoreActiveRound();
    return () => { isMounted = false; };
  }, []);

  // Multiplier Ladder for currently selected mines count
  const ladder = useMemo(() => getMinesMultiplierLadder(minesCount), [minesCount]);

  // Current prospective payout
  const currentPayout = useMemo(() => {
    if (!isPlaying || revealedTiles.length === 0) return 0;
    return Math.floor(stake * currentMultiplier * 100) / 100;
  }, [isPlaying, revealedTiles.length, stake, currentMultiplier]);

  // Next prospective multiplier if another safe gem is picked
  const nextMultiplier = useMemo(() => {
    return calculateMinesMultiplier(minesCount, revealedTiles.length + 1);
  }, [minesCount, revealedTiles.length]);

  // Start New Round
  const handleStartGame = async () => {
    if (isPlaying) return;
    if (balance < stake) {
      triggerToast(`Insufficient funds. Your wallet balance is KES ${balance.toFixed(2)}.`, 'info');
      onOpenDeposit();
      return;
    }

    playSynthSound('click');
    setIsRevealing(true);
    setGameResult(null);
    setMinePositions([]);
    setLastBustedTile(null);
    setServerSeed('');

    try {
      const res = await fetch('/api/games/mines/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wager: stake, minesCount }),
      });
      const data = await res.json();

      if (data.success) {
        setRoundId(data.roundId);
        setIsPlaying(true);
        setRevealedTiles([]);
        setCurrentMultiplier(1.0);
        setServerSeedHash(data.serverSeedHash);
        if (data.newBalance !== undefined && onBalanceChange) {
          onBalanceChange(data.newBalance);
        }
        triggerToast(`Mines active with ${minesCount} mines! Pick a tile.`, 'success');
      } else {
        triggerToast(data.message || 'Could not start Mines round.', 'error');
      }
    } catch (err) {
      triggerToast('Network error while starting round.', 'error');
    } finally {
      setIsRevealing(false);
    }
  };

  // Reveal Tile
  const handleTileClick = async (index) => {
    if (!isPlaying || isRevealing || revealedTiles.includes(index) || minePositions.length > 0) return;

    setIsRevealing(true);
    playSynthSound('click');

    try {
      const res = await fetch('/api/games/mines/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileIndex: index }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.hit === 'gem') {
          playSynthSound('gem');
          setRevealedTiles(data.revealedTiles);
          setCurrentMultiplier(data.currentMultiplier || data.multiplier);

          if (data.status === 'WON' && data.isBoardCleared) {
            // Full Board Cleared!
            playSynthSound('cashout');
            confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
            setIsPlaying(false);
            setGameResult('WON');
            setMinePositions(data.minePositions || []);
            setServerSeed(data.serverSeed || '');
            if (data.newBalance !== undefined && onBalanceChange) {
              onBalanceChange(data.newBalance);
            }
            triggerToast(data.message || 'ALL GEMS CLEARED! MAX WIN!', 'success');
          }
        } else if (data.hit === 'mine') {
          // Hit Mine / Boom!
          playSynthSound('boom');
          setLastBustedTile(index);
          setMinePositions(data.minePositions || []);
          setServerSeed(data.serverSeed || '');
          setIsPlaying(false);
          setGameResult('BUSTED');
          triggerToast('BOOM! You uncovered a mine.', 'error');
        }
      } else {
        triggerToast(data.message || 'Could not reveal tile.', 'error');
      }
    } catch (err) {
      triggerToast('Connection error while revealing tile.', 'error');
    } finally {
      setIsRevealing(false);
    }
  };

  // Pick Random Tile
  const handleRandomPick = () => {
    if (!isPlaying || isRevealing) return;
    const unrevealed = Array.from({ length: TOTAL_TILES }, (_, i) => i).filter(
      (idx) => !revealedTiles.includes(idx)
    );
    if (unrevealed.length === 0) return;
    const randomTile = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    handleTileClick(randomTile);
  };

  // Cashout
  const handleCashout = async () => {
    if (!isPlaying || revealedTiles.length === 0 || isRevealing) return;

    setIsRevealing(true);
    try {
      const res = await fetch('/api/games/mines/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.success) {
        playSynthSound('cashout');
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        setIsPlaying(false);
        setGameResult('WON');
        setMinePositions(data.minePositions || []);
        setServerSeed(data.serverSeed || '');
        if (data.newBalance !== undefined && onBalanceChange) {
          onBalanceChange(data.newBalance);
        }
        triggerToast(`CASHOUT: Won KES ${Number(data.payout).toLocaleString()} (${data.multiplier}x)!`, 'success');
      } else {
        triggerToast(data.message || 'Cashout failed.', 'error');
      }
    } catch (err) {
      triggerToast('Connection error during cashout.', 'error');
    } finally {
      setIsRevealing(false);
    }
  };

  // Stepper helper
  const handleStepStake = (delta) => {
    if (isPlaying) return;
    setStake((prev) => Math.max(10, Math.min(100000, prev + delta)));
    playSynthSound('click');
  };

  return (
    <div className="jp-mines-cockpit">
      {/* =================================================================== */}
      {/* TOP STATUS BAR: Current Multiplier & Next Step Banner              */}
      {/* =================================================================== */}
      <div className="jp-mines-hud-bar">
        <div className="jp-mines-hud-left">
          <div className="jp-mines-title-pill">
            <span className="jp-mines-logo-icon">💣</span>
            <span className="jp-mines-logo-text">JETPESA MINES</span>
            <span className="jp-mines-rtp-badge">97.5% RTP</span>
          </div>
          {serverSeedHash && (
            <span className="jp-mines-hash-pill" title={`SHA-256 Seed Hash: ${serverSeedHash}`}>
              🛡️ FAIR #{serverSeedHash.substring(0, 10)}...
            </span>
          )}
        </div>

        <div className="jp-mines-hud-right">
          <div className="jp-hud-stat-cell">
            <span className="jp-hud-stat-label">MINES</span>
            <strong className="jp-hud-stat-val jp-rose-text">{minesCount}</strong>
          </div>
          <div className="jp-hud-stat-cell">
            <span className="jp-hud-stat-label">GEMS REMAINING</span>
            <strong className="jp-hud-stat-val jp-green-text">
              {TOTAL_TILES - minesCount - revealedTiles.length}
            </strong>
          </div>
          <div className="jp-hud-stat-cell">
            <span className="jp-hud-stat-label">CURRENT MULTIPLIER</span>
            <strong className="jp-hud-stat-val jp-amber-text">
              {isPlaying && revealedTiles.length > 0 ? `${currentMultiplier.toFixed(2)}x` : '1.00x'}
            </strong>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MAIN STAGE: 5x5 Grid & Left Control Deck                            */}
      {/* =================================================================== */}
      <div className="jp-mines-stage-layout">
        {/* ----------------------------------------------------------------- */}
        {/* LEFT DECK: Controls (Mines Count, Stake, Cashout/Bet)              */}
        {/* ----------------------------------------------------------------- */}
        <div className="jp-mines-control-deck">
          {/* Mine Count Selection */}
          <div className="jp-mines-section">
            <div className="jp-section-label-row">
              <span className="jp-section-title">NUMBER OF MINES</span>
              <span className="jp-section-sub">1 to 24 Mines</span>
            </div>

            {/* Presets */}
            <div className="jp-mines-presets-row">
              {[1, 3, 5, 10, 20].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isPlaying}
                  onClick={() => {
                    setMinesCount(count);
                    playSynthSound('click');
                  }}
                  className={`jp-preset-btn ${minesCount === count ? 'active' : ''}`}
                >
                  {count}
                </button>
              ))}
            </div>

            {/* Dropdown Stepper */}
            <div className="jp-mines-selector-wrap">
              <select
                disabled={isPlaying}
                value={minesCount}
                onChange={(e) => {
                  setMinesCount(Number(e.target.value));
                  playSynthSound('click');
                }}
                className="jp-mines-select-input"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'Mine' : 'Mines'} ({TOTAL_TILES - m} Diamonds)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stake Stepper */}
          <div className="jp-mines-section">
            <div className="jp-section-label-row">
              <span className="jp-section-title">BET AMOUNT (KES)</span>
              <span className="jp-section-sub">Min 10 KES</span>
            </div>

            <div className="jp-mines-stepper-box">
              <button
                type="button"
                disabled={isPlaying}
                onClick={() => handleStepStake(-10)}
                className="jp-mines-step-btn"
                aria-label="Decrease bet"
              >
                −
              </button>
              <input
                type="number"
                disabled={isPlaying}
                value={stake}
                onChange={(e) => setStake(Math.max(10, Number(e.target.value) || 10))}
                className="jp-mines-stake-input"
              />
              <button
                type="button"
                disabled={isPlaying}
                onClick={() => handleStepStake(10)}
                className="jp-mines-step-btn"
                aria-label="Increase bet"
              >
                +
              </button>
            </div>

            {/* Quick Stake Grid */}
            <div className="jp-mines-quick-grid">
              {[50, 100, 250, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={isPlaying}
                  onClick={() => {
                    setStake(amt);
                    playSynthSound('click');
                  }}
                  className={`jp-quick-chip ${stake === amt ? 'active' : ''}`}
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Big Action Button: BET or CASHOUT */}
          <div className="jp-mines-action-wrap">
            {!isPlaying ? (
              <button
                type="button"
                disabled={isRevealing}
                onClick={handleStartGame}
                className="jp-mines-btn jp-btn-start"
              >
                <span className="jp-action-headline">START GAME</span>
                <span className="jp-action-wager-pill">KES {stake.toFixed(2)}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={revealedTiles.length === 0 || isRevealing}
                onClick={handleCashout}
                className={`jp-mines-btn jp-btn-cashout ${revealedTiles.length === 0 ? 'disabled' : ''}`}
              >
                <span className="jp-action-headline">
                  {revealedTiles.length === 0 ? 'PICK A TILE' : 'CASH OUT'}
                </span>
                {revealedTiles.length > 0 && (
                  <span className="jp-action-payout-pill">
                    KES {currentPayout.toFixed(2)} ({currentMultiplier.toFixed(2)}x)
                  </span>
                )}
              </button>
            )}

            {/* Random Pick (Active Game Only) */}
            {isPlaying && (
              <button
                type="button"
                disabled={isRevealing}
                onClick={handleRandomPick}
                className="jp-mines-random-btn"
              >
                🎲 RANDOM PICK
              </button>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* RIGHT STAGE: 5x5 Grid Board & Multiplier Ladder                     */}
        {/* ----------------------------------------------------------------- */}
        <div className="jp-mines-board-stage">
          {/* Result Banner Over Grid */}
          {gameResult && (
            <div className={`jp-result-banner ${gameResult === 'WON' ? 'won' : 'busted'}`}>
              {gameResult === 'WON' ? (
                <>
                  <span className="jp-result-title">🎉 WINNER!</span>
                  <span className="jp-result-sub">
                    Cashed out at <strong>{currentMultiplier.toFixed(2)}x</strong> · Won{' '}
                    <strong>KES {currentPayout.toFixed(2)}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span className="jp-result-title">💥 BUSTED!</span>
                  <span className="jp-result-sub">You hit a hidden landmine! Better luck on the next flight.</span>
                </>
              )}
            </div>
          )}

          {/* 5x5 Responsive Grid */}
          <div className="jp-mines-grid-wrapper">
            <div className="jp-mines-grid-5x5">
              {Array.from({ length: TOTAL_TILES }, (_, index) => {
                const isRevealedGem = revealedTiles.includes(index);
                const isMineHit = minePositions.includes(index);
                const isBustedTile = lastBustedTile === index;
                const isFinished = !isPlaying && minePositions.length > 0;

                let tileClass = 'jp-tile-unrevealed';
                if (isRevealedGem) tileClass = 'jp-tile-gem';
                else if (isBustedTile) tileClass = 'jp-tile-busted';
                else if (isMineHit && isFinished) tileClass = 'jp-tile-mine-revealed';
                else if (isFinished) tileClass = 'jp-tile-safe-dimmed';

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!isPlaying || isRevealing || isRevealedGem || isFinished}
                    onClick={() => handleTileClick(index)}
                    className={`jp-mine-tile ${tileClass}`}
                    aria-label={`Tile ${index + 1}`}
                  >
                    {isRevealedGem && (
                      <div className="jp-tile-content jp-gem-content">
                        <span className="jp-gem-emoji">💎</span>
                      </div>
                    )}

                    {(isBustedTile || (isMineHit && isFinished)) && (
                      <div className="jp-tile-content jp-mine-content">
                        <span className="jp-mine-emoji">💣</span>
                      </div>
                    )}

                    {!isRevealedGem && !isMineHit && isFinished && (
                      <div className="jp-tile-content jp-dim-content">
                        <span className="jp-dim-gem">💎</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upcoming Multiplier Progression Strip */}
          <div className="jp-mines-ladder-strip">
            <span className="jp-ladder-title">STREAK MULTIPLIERS:</span>
            <div className="jp-ladder-scroll">
              {ladder.slice(0, 10).map((item) => {
                const isPassed = revealedTiles.length >= item.step;
                const isCurrent = revealedTiles.length === item.step;
                const isNext = revealedTiles.length + 1 === item.step;

                return (
                  <div
                    key={item.step}
                    className={`jp-ladder-step ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''} ${isNext ? 'next' : ''}`}
                  >
                    <span className="jp-step-num">{item.step}💎</span>
                    <strong className="jp-step-mult">{item.multiplier.toFixed(2)}x</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-mines-cockpit {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: #f8fafc;
        }

        /* Top HUD */
        .jp-mines-hud-bar {
          background: #0d1017;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .jp-mines-hud-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .jp-mines-title-pill {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .jp-mines-logo-icon {
          font-size: 18px;
        }

        .jp-mines-logo-text {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.05em;
          color: #ffffff;
        }

        .jp-mines-rtp-badge {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.35);
          color: #4ade80;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 999px;
        }

        .jp-mines-hash-pill {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 3px 8px;
          border-radius: 6px;
          font-family: monospace;
        }

        .jp-mines-hud-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .jp-hud-stat-cell {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 1px;
        }

        .jp-hud-stat-label {
          font-size: 8.5px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
        }

        .jp-hud-stat-val {
          font-size: 13px;
          font-weight: 900;
        }

        .jp-rose-text { color: #f43f5e; }
        .jp-green-text { color: #22c55e; }
        .jp-amber-text { color: #f59e0b; }

        /* Main Stage Layout */
        .jp-mines-stage-layout {
          display: grid;
          grid-template-columns: 290px 1fr;
          gap: 14px;
        }

        /* Left Control Deck */
        .jp-mines-control-deck {
          background: #0d1017;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .jp-mines-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .jp-section-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-section-title {
          font-size: 10px;
          font-weight: 900;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .jp-section-sub {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 700;
        }

        .jp-mines-presets-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }

        .jp-preset-btn {
          background: #141824;
          border: 1px solid #1f2533;
          color: #94a3b8;
          padding: 6px 0;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-preset-btn:hover:not(:disabled) {
          background: #1c2233;
          color: #ffffff;
        }

        .jp-preset-btn.active {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #f87171;
        }

        .jp-preset-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .jp-mines-select-input {
          width: 100%;
          background: #07090e;
          border: 1px solid #1f2533;
          color: #ffffff;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
          outline: none;
          cursor: pointer;
        }

        .jp-mines-select-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Stepper */
        .jp-mines-stepper-box {
          display: flex;
          align-items: center;
          background: #07090e;
          border: 1px solid #1f2533;
          border-radius: 9px;
          overflow: hidden;
        }

        .jp-mines-step-btn {
          width: 38px;
          height: 38px;
          background: #141824;
          border: none;
          color: #94a3b8;
          font-size: 16px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }

        .jp-mines-step-btn:hover:not(:disabled) {
          background: #1f2533;
          color: #ffffff;
        }

        .jp-mines-step-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .jp-mines-stake-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          text-align: center;
          outline: none;
          font-family: ui-monospace, monospace;
        }

        .jp-mines-quick-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 5px;
        }

        .jp-quick-chip {
          background: #141824;
          border: 1px solid #1f2533;
          color: #94a3b8;
          padding: 6px 0;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-quick-chip:hover:not(:disabled) {
          background: #1c2233;
          color: #ffffff;
        }

        .jp-quick-chip.active {
          background: rgba(34, 197, 94, 0.15);
          border-color: #22c55e;
          color: #4ade80;
        }

        .jp-quick-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Action Buttons */
        .jp-mines-action-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 4px;
        }

        .jp-mines-btn {
          width: 100%;
          min-height: 56px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          transition: filter 0.15s ease, transform 0.1s ease;
        }

        .jp-mines-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .jp-btn-start {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          box-shadow: 0 4px 18px rgba(34, 197, 94, 0.35);
          color: #ffffff;
        }

        .jp-btn-start:hover:not(:disabled) {
          filter: brightness(1.15);
        }

        .jp-btn-cashout {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 4px 18px rgba(245, 158, 11, 0.4);
          color: #ffffff;
        }

        .jp-btn-cashout.disabled {
          background: #1f2533;
          box-shadow: none;
          color: #64748b;
          cursor: not-allowed;
        }

        .jp-action-headline {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .jp-action-wager-pill,
        .jp-action-payout-pill {
          font-size: 11px;
          font-weight: 800;
          opacity: 0.9;
        }

        .jp-mines-random-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 8px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-mines-random-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        /* Right Board Stage */
        .jp-mines-board-stage {
          background: #0d1017;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          position: relative;
        }

        .jp-result-banner {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          padding: 8px 18px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: jpFadeIn 0.25s ease-out;
        }

        .jp-result-banner.won {
          background: rgba(34, 197, 94, 0.92);
          color: #ffffff;
          box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
        }

        .jp-result-banner.busted {
          background: rgba(239, 68, 68, 0.92);
          color: #ffffff;
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        }

        .jp-result-title {
          font-size: 13px;
          font-weight: 900;
        }

        .jp-result-sub {
          font-size: 11px;
          font-weight: 700;
        }

        /* Grid */
        .jp-mines-grid-wrapper {
          width: 100%;
          max-width: 440px;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-mines-grid-5x5 {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          grid-template-rows: repeat(5, 1fr);
          gap: 8px;
        }

        .jp-mine-tile {
          background: #141824;
          border: 1px solid #232a3b;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        }

        .jp-mine-tile:hover:not(:disabled) {
          background: #1d2436;
          border-color: #38bdf8;
          transform: translateY(-2px);
          box-shadow: 0 6px 14px rgba(56, 189, 248, 0.25);
        }

        .jp-mine-tile:active:not(:disabled) {
          transform: scale(0.95);
        }

        .jp-tile-gem {
          background: radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, #0d2238 100%) !important;
          border-color: #38bdf8 !important;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.4) !important;
          cursor: default !important;
          animation: jpPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .jp-tile-busted {
          background: radial-gradient(circle, rgba(239, 68, 68, 0.35) 0%, #300c12 100%) !important;
          border-color: #ef4444 !important;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.5) !important;
          animation: jpShake 0.3s ease-in-out;
        }

        .jp-tile-mine-revealed {
          background: rgba(239, 68, 68, 0.12) !important;
          border-color: rgba(239, 68, 68, 0.35) !important;
          opacity: 0.8;
          cursor: default !important;
        }

        .jp-tile-safe-dimmed {
          background: rgba(34, 197, 94, 0.08) !important;
          border-color: rgba(34, 197, 94, 0.2) !important;
          opacity: 0.5;
          cursor: default !important;
        }

        .jp-gem-emoji {
          font-size: 26px;
          filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8));
        }

        .jp-mine-emoji {
          font-size: 26px;
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.9));
        }

        .jp-dim-gem {
          font-size: 20px;
          opacity: 0.6;
        }

        /* Ladder Progression */
        .jp-mines-ladder-strip {
          width: 100%;
          max-width: 440px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #07090e;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .jp-ladder-title {
          font-size: 9px;
          font-weight: 800;
          color: #64748b;
          white-space: nowrap;
        }

        .jp-ladder-scroll {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .jp-ladder-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #11141c;
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 9px;
          white-space: nowrap;
        }

        .jp-ladder-step.current {
          background: rgba(245, 158, 11, 0.2);
          border-color: #f59e0b;
          color: #fbbf24;
        }

        .jp-ladder-step.next {
          border-color: #38bdf8;
          color: #38bdf8;
        }

        .jp-ladder-step.passed {
          background: rgba(34, 197, 94, 0.12);
          border-color: #22c55e;
          color: #4ade80;
        }

        .jp-step-num {
          font-size: 8px;
          color: #64748b;
        }

        .jp-step-mult {
          font-size: 10.5px;
          font-weight: 900;
        }

        @keyframes jpPop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes jpShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        @keyframes jpFadeIn {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        /* Responsive Breakpoints */
        @media (max-width: 860px) {
          .jp-mines-stage-layout {
            grid-template-columns: 1fr;
          }
          .jp-mines-grid-wrapper {
            max-width: 380px;
          }
        }
      `}</style>
    </div>
  );
}
