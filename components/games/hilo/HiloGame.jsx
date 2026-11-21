'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { HILO_CONFIG, calculateHiloOdds } from '../../../lib/games/hiloEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Sound Synthesizer (Card Deal, Flip Snap, Win, Cashout)      */
/* -------------------------------------------------------------------------- */
function playCardSound(type) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'deal') {
      // Felt card slide swoosh
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, ctx.currentTime);
      filter.Q.setValueAtTime(3.0, ctx.currentTime);
      noise.connect(filter);
      filter.connect(ctx.destination);
      noise.start();
    } else if (type === 'flip') {
      // Crisp playing card snap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'win') {
      // Ascending chime
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + idx * 0.06 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.28);
      });
    } else if (type === 'loss') {
      // Low buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'cashout') {
      // Golden cashout fanfare
      [587.33, 739.99, 880, 1174.66, 1479.98].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.07);
        osc.stop(ctx.currentTime + idx * 0.07 + 0.45);
      });
    }
  } catch {
    // Audio context may be restricted by autoplay policy
  }
}

/* -------------------------------------------------------------------------- */
/*  Card Display Component                                                    */
/* -------------------------------------------------------------------------- */
function PlayingCard({ card, isFlipping = false, isPlaceholder = false }) {
  if (isPlaceholder || !card) {
    return (
      <div className="jp-hilo-card jp-card-placeholder">
        <div className="jp-card-back-pattern">
          <div className="jp-pattern-ring" />
          <span className="jp-pattern-logo">JP</span>
        </div>
      </div>
    );
  }

  const isRed = card.color === 'red' || card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className={`jp-hilo-card-container ${isFlipping ? 'jp-card-flip-anim' : ''}`}>
      <div className={`jp-hilo-card jp-card-front ${isRed ? 'jp-card-red' : 'jp-card-black'}`}>
        {/* Top-left corner */}
        <div className="jp-card-corner jp-corner-top">
          <span className="jp-corner-rank">{card.rankDisplay}</span>
          <span className="jp-corner-suit">{card.suitSymbol}</span>
        </div>

        {/* Center art */}
        <div className="jp-card-center-pip">
          <span className="jp-pip-suit">{card.suitSymbol}</span>
          {['J', 'Q', 'K', 'A'].includes(card.rankDisplay) && (
            <span className="jp-pip-face-badge">{card.rankDisplay}</span>
          )}
        </div>

        {/* Bottom-right corner (inverted) */}
        <div className="jp-card-corner jp-corner-bottom">
          <span className="jp-corner-rank">{card.rankDisplay}</span>
          <span className="jp-corner-suit">{card.suitSymbol}</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Hi-Lo Game Component                                                 */
/* -------------------------------------------------------------------------- */
export default function HiloGame({
  balance = 0,
  onBalanceChange = () => {},
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Game State
  const [stake, setStake] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);

  // Active round data
  const [roundId, setRoundId] = useState(null);
  const [currentCard, setCurrentCard] = useState(null);
  const [cardHistory, setCardHistory] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [skipsLeft, setSkipsLeft] = useState(3);
  const [odds, setOdds] = useState({
    high: { multiplier: 1.38, chance: 71, canBet: true },
    low: { multiplier: 1.38, chance: 71, canBet: true },
    same: { multiplier: 12.61, chance: 8, canBet: true },
  });

  // Verification & outcome
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null); // { type: 'win'|'bust'|'cashout', message: '' }

  // Modals
  const [showProvablyModal, setShowProvablyModal] = useState(false);
  const historyRef = useRef(null);

  // Quick chips
  const QUICK_CHIPS = [10, 20, 50, 100, 500, 1000, 5000];

  // 1. Restore active game state on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreState() {
      try {
        const res = await fetch('/api/games/hilo/state');
        const data = await res.json();
        if (!isMounted || !data.success) return;

        if (data.active && data.round) {
          const r = data.round;
          setRoundId(r.id);
          setStake(r.stake);
          setCurrentCard(r.currentCard);
          setCardHistory(r.cardHistory || []);
          setCurrentStep(r.currentStep || 0);
          setCurrentMultiplier(r.currentMultiplier || 1.0);
          setSkipsLeft(r.skipsLeft ?? 3);
          setOdds(r.odds || calculateHiloOdds(r.currentCard.rank));
          setServerSeedHash(r.serverSeedHash);
          setClientSeed(r.clientSeed);
          setIsPlaying(true);
        }
      } catch (err) {
        console.error('Failed to restore Hi-Lo state:', err);
      }
    }
    restoreState();
    return () => { isMounted = false; };
  }, []);

  // Scroll history strip on update
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollLeft = historyRef.current.scrollWidth;
    }
  }, [cardHistory]);

  // 2. Start / Deal New Duel Round
  const handleStartGame = async () => {
    if (isDealing) return;
    if (stake < HILO_CONFIG.minBet) {
      triggerToast(`Minimum stake is KES ${HILO_CONFIG.minBet}`, 'error');
      return;
    }
    if (stake > balance) {
      triggerToast('Insufficient balance. Please deposit to play.', 'error');
      if (onOpenDeposit) onOpenDeposit();
      return;
    }

    setIsDealing(true);
    setLastOutcome(null);
    setRevealedServerSeed(null);
    playCardSound('deal');

    try {
      const res = await fetch('/api/games/hilo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake }),
      });

      const data = await res.json();
      if (!data.success) {
        triggerToast(data.message || 'Failed to start Hi-Lo duel', 'error');
        setIsDealing(false);
        return;
      }

      onBalanceChange(data.updatedBalance);
      const r = data.round;
      setRoundId(r.id);
      setCurrentCard(r.currentCard);
      setCardHistory(r.cardHistory || [r.currentCard]);
      setCurrentStep(0);
      setCurrentMultiplier(1.0);
      setSkipsLeft(r.skipsLeft ?? 3);
      setOdds(r.odds);
      setServerSeedHash(r.serverSeedHash);
      setClientSeed(r.clientSeed);
      setIsPlaying(true);
      playCardSound('flip');
    } catch (err) {
      triggerToast(err.message || 'Network error starting duel', 'error');
    } finally {
      setIsDealing(false);
    }
  };

  // 3. Make a Card Guess (HIGHER, LOWER, SAME)
  const handleGuess = async (choice) => {
    if (!isPlaying || isFlipping) return;

    setIsFlipping(true);
    playCardSound('deal');

    try {
      const res = await fetch('/api/games/hilo/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });

      const data = await res.json();
      if (!data.success) {
        triggerToast(data.message || 'Error processing guess', 'error');
        setIsFlipping(false);
        return;
      }

      // Flip card sound and update
      setTimeout(() => {
        playCardSound('flip');
        setCurrentCard(data.card);
        setCardHistory(data.cardHistory);

        if (data.isWin) {
          playCardSound('win');
          setCurrentMultiplier(data.currentMultiplier);
          setCurrentStep(data.currentStep);
          setOdds(data.odds);
          triggerToast(`Correct guess! Next multiplier: ${data.currentMultiplier}x`, 'success');
        } else {
          // Busted
          playCardSound('loss');
          setIsPlaying(false);
          setRevealedServerSeed(data.serverSeed);
          setLastOutcome({
            type: 'bust',
            message: `BUSTED! The card was ${data.card.display}`,
          });
          triggerToast(`Busted! The card was ${data.card.display}`, 'error');
        }
        setIsFlipping(false);
      }, 250);
    } catch (err) {
      triggerToast(err.message || 'Network error on guess', 'error');
      setIsFlipping(false);
    }
  };

  // 4. Skip Current Card
  const handleSkip = async () => {
    if (!isPlaying || isFlipping || skipsLeft <= 0) return;

    setIsFlipping(true);
    playCardSound('deal');

    try {
      const res = await fetch('/api/games/hilo/skip', {
        method: 'POST',
      });

      const data = await res.json();
      if (!data.success) {
        triggerToast(data.message || 'Failed to skip card', 'error');
        setIsFlipping(false);
        return;
      }

      setTimeout(() => {
        playCardSound('flip');
        setCurrentCard(data.card);
        setSkipsLeft(data.skipsLeft);
        setOdds(data.odds);
        setCardHistory(data.cardHistory);
        triggerToast(`Card skipped! ${data.skipsLeft} skips remaining.`, 'info');
        setIsFlipping(false);
      }, 250);
    } catch (err) {
      triggerToast(err.message || 'Network error on card skip', 'error');
      setIsFlipping(false);
    }
  };

  // 5. Cashout Active Winnings
  const handleCashout = async () => {
    if (!isPlaying || currentStep < 1 || currentMultiplier <= 1.0) return;

    try {
      const res = await fetch('/api/games/hilo/cashout', {
        method: 'POST',
      });

      const data = await res.json();
      if (!data.success) {
        triggerToast(data.message || 'Cashout failed', 'error');
        return;
      }

      onBalanceChange(data.updatedBalance);
      setIsPlaying(false);
      setRevealedServerSeed(data.serverSeed);
      setLastOutcome({
        type: 'cashout',
        message: `CASHOUT SUCCESS! +KES ${data.payout.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${data.multiplier}x)`,
      });

      playCardSound('cashout');
      confetti({
        particleCount: 80,
        spread: 65,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#f59e0b', '#38bdf8', '#ec4899'],
      });

      triggerToast(`Cashed out KES ${data.payout.toFixed(2)} at ${data.multiplier}x!`, 'success');
    } catch (err) {
      triggerToast(err.message || 'Network error on cashout', 'error');
    }
  };

  // Quick chip helper
  const adjustStake = (val) => {
    if (isPlaying) return;
    setStake((prev) => Math.max(HILO_CONFIG.minBet, Math.min(HILO_CONFIG.maxBet, Math.floor(val))));
  };

  const currentPayoutAmount = Math.floor(stake * currentMultiplier * 100) / 100;

  return (
    <div className="jp-hilo-wrapper">
      {/* Provably Fair Badge & Rules Header */}
      <div className="jp-hilo-topbar">
        <div className="jp-hilo-title-tag">
          <span className="jp-hilo-badge">TABLE CASINO</span>
          <h2 className="jp-hilo-title">Hi-Lo Card Duel</h2>
        </div>
        <div className="jp-hilo-actions">
          <button
            type="button"
            className="jp-hilo-audit-btn"
            onClick={() => setShowProvablyModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            PROVABLY FAIR
          </button>
        </div>
      </div>

      {/* Main Casino Felt Arena */}
      <div className="jp-hilo-arena">
        {/* Felt Glow & Table Decals */}
        <div className="jp-felt-glow" />
        <div className="jp-felt-border-ring" />

        {/* Live Multiplier & Streak Tracker */}
        <div className="jp-hilo-status-bar">
          <div className="jp-status-pill">
            <span className="jp-status-label">CURRENT MULTIPLIER</span>
            <span className={`jp-status-value ${currentMultiplier > 1 ? 'jp-glow-green' : ''}`}>
              {currentMultiplier.toFixed(2)}x
            </span>
          </div>

          <div className="jp-status-pill">
            <span className="jp-status-label">WINNING STREAK</span>
            <span className="jp-status-value jp-glow-gold">
              {currentStep} {currentStep === 1 ? 'GUESS' : 'GUESSES'}
            </span>
          </div>

          <div className="jp-status-pill">
            <span className="jp-status-label">POTENTIAL CASHOUT</span>
            <span className="jp-status-value jp-glow-cyan">
              KES {isPlaying ? currentPayoutAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>
        </div>

        {/* Center Card Stage */}
        <div className="jp-card-stage">
          {/* Deck Pile on the Left */}
          <div className="jp-deck-pile" title="52-Card Provably Fair Deck">
            <div className="jp-deck-layer jp-deck-layer-3" />
            <div className="jp-deck-layer jp-deck-layer-2" />
            <div className="jp-deck-layer jp-deck-layer-1">
              <span className="jp-deck-label">DECK</span>
            </div>
          </div>

          {/* Active Face-Up Card */}
          <div className="jp-active-card-box">
            <PlayingCard
              card={currentCard}
              isFlipping={isFlipping}
              isPlaceholder={!isPlaying && !currentCard}
            />
          </div>

          {/* Skip Card Quick Action */}
          <div className="jp-skip-box">
            <button
              type="button"
              className="jp-skip-btn"
              onClick={handleSkip}
              disabled={!isPlaying || isFlipping || skipsLeft <= 0}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m13 17 5-5-5-5" />
                <path d="m6 17 5-5-5-5" />
              </svg>
              <span>SKIP CARD</span>
              <span className="jp-skip-badge">{skipsLeft} left</span>
            </button>
          </div>
        </div>

        {/* Banner Outcome Notification */}
        {lastOutcome && (
          <div className={`jp-hilo-outcome-banner jp-outcome-${lastOutcome.type}`}>
            <span>{lastOutcome.message}</span>
          </div>
        )}

        {/* Action Decision Row (HIGHER / LOWER / SAME) */}
        {isPlaying ? (
          <div className="jp-hilo-choices-row">
            {/* HIGHER OR EQUAL */}
            <button
              type="button"
              className="jp-choice-btn jp-choice-high"
              disabled={isFlipping || !odds.high.canBet}
              onClick={() => handleGuess('HIGHER')}
            >
              <div className="jp-choice-arrow">▲</div>
              <div className="jp-choice-text">
                <div className="jp-choice-name">HIGHER OR EQUAL</div>
                <div className="jp-choice-odds">
                  <span className="jp-choice-mult">{odds.high.multiplier}x</span>
                  <span className="jp-choice-prob">{odds.high.chance}% CHANCE</span>
                </div>
              </div>
            </button>

            {/* SAME RANK BONUS */}
            <button
              type="button"
              className="jp-choice-btn jp-choice-same"
              disabled={isFlipping}
              onClick={() => handleGuess('SAME')}
              title="Predict the next card will match the exact same rank"
            >
              <div className="jp-choice-arrow">●</div>
              <div className="jp-choice-text">
                <div className="jp-choice-name">SAME RANK</div>
                <div className="jp-choice-odds">
                  <span className="jp-choice-mult jp-text-purple">{odds.same.multiplier}x</span>
                  <span className="jp-choice-prob">{odds.same.chance}%</span>
                </div>
              </div>
            </button>

            {/* LOWER OR EQUAL */}
            <button
              type="button"
              className="jp-choice-btn jp-choice-low"
              disabled={isFlipping || !odds.low.canBet}
              onClick={() => handleGuess('LOWER')}
            >
              <div className="jp-choice-arrow">▼</div>
              <div className="jp-choice-text">
                <div className="jp-choice-name">LOWER OR EQUAL</div>
                <div className="jp-choice-odds">
                  <span className="jp-choice-mult">{odds.low.multiplier}x</span>
                  <span className="jp-choice-prob">{odds.low.chance}% CHANCE</span>
                </div>
              </div>
            </button>
          </div>
        ) : null}

        {/* Card Duel History Strip */}
        {cardHistory.length > 0 && (
          <div className="jp-history-container">
            <span className="jp-history-label">CARD HISTORY:</span>
            <div className="jp-history-strip" ref={historyRef}>
              {cardHistory.map((h, i) => (
                <div
                  key={i}
                  className={`jp-mini-card ${h.color === 'red' ? 'jp-mini-red' : 'jp-mini-black'} ${
                    h.isWin ? 'jp-mini-win' : h.isSkip ? 'jp-mini-skip' : h.isStart ? 'jp-mini-start' : 'jp-mini-bust'
                  }`}
                  title={`${h.rankDisplay}${h.suitSymbol} ${h.guess ? `(Bet: ${h.guess})` : ''}`}
                >
                  <span className="jp-mini-rank">{h.rankDisplay}</span>
                  <span className="jp-mini-suit">{h.suitSymbol}</span>
                  {h.guess && (
                    <span className="jp-mini-tag">
                      {h.isWin ? '✓' : '✗'}
                    </span>
                  )}
                  {h.isSkip && <span className="jp-mini-tag jp-tag-skip">S</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Betting Control Dock */}
      <div className="jp-hilo-dock">
        {/* Stake Controls */}
        <div className="jp-stake-box">
          <div className="jp-stake-header">
            <label className="jp-stake-label">WAGER STAKE (KES)</label>
            <div className="jp-quick-chips">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={isPlaying}
                  className={`jp-chip-btn ${stake === chip ? 'jp-chip-active' : ''}`}
                  onClick={() => adjustStake(chip)}
                >
                  +{chip}
                </button>
              ))}
            </div>
          </div>

          <div className="jp-stake-input-row">
            <span className="jp-currency-tag">KES</span>
            <input
              type="number"
              min={HILO_CONFIG.minBet}
              max={HILO_CONFIG.maxBet}
              disabled={isPlaying}
              value={stake}
              onChange={(e) => adjustStake(Number(e.target.value))}
              className="jp-stake-input"
            />
            <div className="jp-stake-modifiers">
              <button
                type="button"
                disabled={isPlaying}
                className="jp-mod-btn"
                onClick={() => adjustStake(stake / 2)}
              >
                ½
              </button>
              <button
                type="button"
                disabled={isPlaying}
                className="jp-mod-btn"
                onClick={() => adjustStake(stake * 2)}
              >
                2×
              </button>
              <button
                type="button"
                disabled={isPlaying}
                className="jp-mod-btn"
                onClick={() => adjustStake(HILO_CONFIG.maxBet)}
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Primary Action Button: DEAL or CASHOUT */}
        <div className="jp-primary-action">
          {!isPlaying ? (
            <button
              type="button"
              className="jp-deal-btn"
              disabled={isDealing}
              onClick={handleStartGame}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5" />
                <path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5" />
              </svg>
              <span>{isDealing ? 'DEALING CARDS...' : `DEAL CARDS (KES ${stake.toLocaleString()})`}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`jp-cashout-btn ${currentStep >= 1 ? 'jp-cashout-active' : 'jp-cashout-disabled'}`}
              disabled={currentStep < 1 || isFlipping}
              onClick={handleCashout}
            >
              <div className="jp-cashout-left">
                <span className="jp-cashout-title">
                  {currentStep >= 1 ? 'LOCK IN WINNINGS' : 'MAKE A GUESS FIRST'}
                </span>
                <span className="jp-cashout-sub">
                  {currentMultiplier.toFixed(2)}x MULTIPLIER
                </span>
              </div>
              <div className="jp-cashout-amount">
                KES {currentPayoutAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </button>
          )}
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
              Hi-Lo Card Duel card outcomes are strictly deterministic. Each card is generated from the SHA-256 HMAC of your Client Seed and the Server Seed before dealing.
            </p>

            <div className="jp-field-group">
              <label className="jp-field-label">SERVER SEED (SHA-256 HASH)</label>
              <input
                type="text"
                readOnly
                value={serverSeedHash || 'Generated upon placing bet'}
                className="jp-modal-input"
              />
            </div>

            <div className="jp-field-group">
              <label className="jp-field-label">CLIENT SEED</label>
              <input
                type="text"
                readOnly
                value={clientSeed || 'Generated upon placing bet'}
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

      {/* Inline Styles for Hi-Lo Card Duel */}
      <style jsx>{`
        .jp-hilo-wrapper {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          color: #f8fafc;
          font-family: inherit;
        }

        .jp-hilo-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }

        .jp-hilo-title-tag {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .jp-hilo-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          background: rgba(236, 72, 153, 0.2);
          color: #ec4899;
          border: 1px solid rgba(236, 72, 153, 0.4);
          border-radius: 6px;
        }

        .jp-hilo-title {
          font-size: 15px;
          font-weight: 700;
          margin: 0;
          color: #f1f5f9;
        }

        .jp-hilo-audit-btn {
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
          transition: all 0.15s ease;
        }

        .jp-hilo-audit-btn:hover {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.4);
        }

        /* Felt Arena */
        .jp-hilo-arena {
          position: relative;
          background: radial-gradient(ellipse at center, #064e3b 0%, #062e24 55%, #021a14 100%);
          border: 2px solid #047857;
          box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.8), 0 12px 30px rgba(0, 0, 0, 0.5);
          border-radius: 20px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow: hidden;
        }

        .jp-felt-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 40%, rgba(52, 211, 153, 0.12) 0%, transparent 65%);
          pointer-events: none;
        }

        .jp-felt-border-ring {
          position: absolute;
          inset: 10px;
          border: 1px dashed rgba(245, 158, 11, 0.25);
          border-radius: 14px;
          pointer-events: none;
        }

        /* Status Bar */
        .jp-hilo-status-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          position: relative;
          z-index: 1;
        }

        .jp-status-pill {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .jp-status-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .jp-status-value {
          font-size: 18px;
          font-weight: 800;
          font-family: monospace;
          color: #f8fafc;
        }

        .jp-glow-green {
          color: #22c55e;
          text-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
        }

        .jp-glow-gold {
          color: #f59e0b;
        }

        .jp-glow-cyan {
          color: #38bdf8;
        }

        /* Center Card Stage */
        .jp-card-stage {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 32px;
          position: relative;
          z-index: 1;
          min-height: 220px;
        }

        /* Deck Pile */
        .jp-deck-pile {
          position: relative;
          width: 90px;
          height: 130px;
        }

        .jp-deck-layer {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #1e293b, #0f172a);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
        }

        .jp-deck-layer-3 {
          transform: translate(-4px, 4px);
        }

        .jp-deck-layer-2 {
          transform: translate(-2px, 2px);
        }

        .jp-deck-layer-1 {
          display: flex;
          align-items: center;
          justify-content: center;
          background: repeating-linear-gradient(45deg, #0f172a, #0f172a 6px, #1e293b 6px, #1e293b 12px);
          border: 1px solid rgba(245, 158, 11, 0.4);
        }

        .jp-deck-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: #f59e0b;
          padding: 4px 8px;
          background: rgba(15, 23, 42, 0.9);
          border-radius: 4px;
        }

        /* Active Card Box */
        .jp-active-card-box {
          perspective: 1000px;
        }

        .jp-hilo-card-container {
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .jp-card-flip-anim {
          animation: cardFlip 0.25s ease-in-out;
        }

        @keyframes cardFlip {
          0% { transform: scale(1) rotateY(0deg); }
          50% { transform: scale(1.1) rotateY(90deg); }
          100% { transform: scale(1) rotateY(0deg); }
        }

        .jp-hilo-card {
          width: 140px;
          height: 200px;
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 12px;
          position: relative;
          user-select: none;
        }

        .jp-card-placeholder {
          background: rgba(15, 23, 42, 0.6);
          border: 2px dashed rgba(255, 255, 255, 0.2);
          box-shadow: none;
          align-items: center;
          justify-content: center;
        }

        .jp-card-back-pattern {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .jp-pattern-ring {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 2px dashed rgba(245, 158, 11, 0.4);
        }

        .jp-pattern-logo {
          font-size: 16px;
          font-weight: 900;
          color: #f59e0b;
        }

        .jp-card-red {
          color: #dc2626;
        }

        .jp-card-black {
          color: #0f172a;
        }

        .jp-card-corner {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1;
        }

        .jp-corner-top {
          align-self: flex-start;
        }

        .jp-corner-bottom {
          align-self: flex-end;
          transform: rotate(180deg);
        }

        .jp-corner-rank {
          font-size: 20px;
          font-weight: 900;
        }

        .jp-corner-suit {
          font-size: 16px;
        }

        .jp-card-center-pip {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .jp-pip-suit {
          font-size: 54px;
          opacity: 0.9;
        }

        .jp-pip-face-badge {
          font-size: 26px;
          font-weight: 900;
          margin-top: -8px;
        }

        /* Skip Button */
        .jp-skip-box {
          display: flex;
          align-items: center;
        }

        .jp-skip-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #f59e0b;
          border-radius: 12px;
          padding: 12px 14px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
          transition: all 0.15s ease;
        }

        .jp-skip-btn:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.15);
          transform: translateY(-2px);
        }

        .jp-skip-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .jp-skip-badge {
          font-size: 10px;
          background: rgba(245, 158, 11, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
        }

        /* Outcome Banner */
        .jp-hilo-outcome-banner {
          position: relative;
          z-index: 1;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          animation: popBanner 0.25s ease-out;
        }

        @keyframes popBanner {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .jp-outcome-bust {
          background: rgba(220, 38, 38, 0.25);
          border: 1px solid rgba(220, 38, 38, 0.6);
          color: #f87171;
        }

        .jp-outcome-cashout {
          background: rgba(34, 197, 94, 0.25);
          border: 1px solid rgba(34, 197, 94, 0.6);
          color: #4ade80;
        }

        /* Choice Action Row */
        .jp-hilo-choices-row {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .jp-choice-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
          color: #ffffff;
        }

        .jp-choice-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          filter: brightness(1.1);
        }

        .jp-choice-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          filter: grayscale(0.5);
        }

        .jp-choice-high {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35);
        }

        .jp-choice-low {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
          box-shadow: 0 6px 18px rgba(245, 158, 11, 0.35);
        }

        .jp-choice-same {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          box-shadow: 0 6px 18px rgba(168, 85, 247, 0.35);
          padding: 14px 14px;
        }

        .jp-choice-arrow {
          font-size: 20px;
          font-weight: 900;
        }

        .jp-choice-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .jp-choice-name {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .jp-choice-odds {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-choice-mult {
          font-size: 15px;
          font-weight: 900;
          font-family: monospace;
        }

        .jp-choice-prob {
          font-size: 10px;
          font-weight: 700;
          opacity: 0.85;
        }

        /* History Ribbon */
        .jp-history-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
          z-index: 1;
        }

        .jp-history-label {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          white-space: nowrap;
        }

        .jp-history-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .jp-mini-card {
          width: 38px;
          height: 52px;
          background: #ffffff;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 12px;
          position: relative;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }

        .jp-mini-red {
          color: #dc2626;
        }

        .jp-mini-black {
          color: #0f172a;
        }

        .jp-mini-suit {
          font-size: 14px;
          margin-top: -3px;
        }

        .jp-mini-tag {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          font-size: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
        }

        .jp-mini-win .jp-mini-tag {
          background: #22c55e;
        }

        .jp-mini-bust .jp-mini-tag {
          background: #ef4444;
        }

        .jp-mini-skip .jp-mini-tag {
          background: #f59e0b;
        }

        .jp-mini-start {
          border: 1px solid #38bdf8;
        }

        /* Betting Control Dock */
        .jp-hilo-dock {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: center;
        }

        .jp-stake-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .jp-stake-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-stake-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #94a3b8;
        }

        .jp-quick-chips {
          display: flex;
          gap: 4px;
          overflow-x: auto;
        }

        .jp-chip-btn {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
        }

        .jp-chip-btn:hover:not(:disabled) {
          background: rgba(236, 72, 153, 0.2);
          border-color: #ec4899;
          color: #fff;
        }

        .jp-chip-active {
          background: rgba(236, 72, 153, 0.3);
          border-color: #ec4899;
          color: #fff;
        }

        .jp-stake-input-row {
          display: flex;
          align-items: center;
          background: #020617;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 4px 8px;
        }

        .jp-currency-tag {
          font-size: 12px;
          font-weight: 800;
          color: #64748b;
          padding: 0 4px;
        }

        .jp-stake-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #f8fafc;
          font-size: 16px;
          font-weight: 800;
          padding: 6px 8px;
          outline: none;
          font-family: monospace;
        }

        .jp-stake-modifiers {
          display: flex;
          gap: 4px;
        }

        .jp-mod-btn {
          font-size: 11px;
          font-weight: 800;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
        }

        .jp-mod-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
        }

        /* Primary Action Buttons */
        .jp-primary-action {
          display: flex;
          height: 100%;
          min-height: 56px;
        }

        .jp-deal-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: linear-gradient(135deg, #db2777 0%, #ec4899 100%);
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.04em;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(236, 72, 153, 0.4);
          transition: all 0.15s ease;
        }

        .jp-deal-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }

        .jp-deal-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .jp-cashout-btn {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 18px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-cashout-active {
          background: linear-gradient(135deg, #15803d 0%, #22c55e 100%);
          box-shadow: 0 8px 24px rgba(34, 197, 94, 0.45);
          color: #ffffff;
          animation: pulseCashout 1.8s infinite;
        }

        @keyframes pulseCashout {
          0%, 100% { box-shadow: 0 8px 24px rgba(34, 197, 94, 0.45); }
          50% { box-shadow: 0 8px 34px rgba(34, 197, 94, 0.8); }
        }

        .jp-cashout-disabled {
          background: rgba(255, 255, 255, 0.08);
          color: #64748b;
          cursor: not-allowed;
        }

        .jp-cashout-left {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }

        .jp-cashout-title {
          font-size: 13px;
          font-weight: 900;
        }

        .jp-cashout-sub {
          font-size: 11px;
          font-weight: 700;
          opacity: 0.85;
        }

        .jp-cashout-amount {
          font-size: 18px;
          font-weight: 900;
          font-family: monospace;
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

        @media (max-width: 640px) {
          .jp-hilo-dock {
            grid-template-columns: 1fr;
          }
          .jp-hilo-choices-row {
            grid-template-columns: 1fr;
          }
          .jp-hilo-status-bar {
            grid-template-columns: 1fr;
          }
          .jp-card-stage {
            gap: 16px;
          }
          .jp-deck-pile {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
