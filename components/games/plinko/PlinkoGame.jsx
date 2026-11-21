'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  PLINKO_ROWS,
  PLINKO_RISKS,
  PLINKO_MULTIPLIERS,
  DEFAULT_PLINKO_CONFIG,
  getPlinkoMultipliers,
} from '../../../lib/games/plinkoEngine';

/* -------------------------------------------------------------------------- */
/*  Web Audio API Synthesizer (Crisp Pin Tinks & Bin Landing Chimes)          */
/* -------------------------------------------------------------------------- */
function playPlinkoSound(type, param = 0) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'pin') {
      // Crisp metallic/glass pin collision with rising pitch down the board
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const baseFreq = 440 + Math.min(param * 35, 600);
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'bin_win') {
      [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.04);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + i * 0.04 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.04);
        osc.stop(ctx.currentTime + i * 0.04 + 0.25);
      });
    } else if (type === 'bin_low') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'jackpot') {
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.06);
        osc.stop(ctx.currentTime + i * 0.06 + 0.35);
      });
    }
  } catch {}
}

export default function PlinkoGame({
  balance = 0,
  onBalanceChange,
  triggerToast = () => {},
  onOpenDeposit = () => {},
  onOpenProvably = () => {},
}) {
  // Game Setup
  const [stake, setStake] = useState(50);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState('medium');
  const [isDropping, setIsDropping] = useState(false);
  const [autoDropActive, setAutoDropActive] = useState(false);

  // Stats & History
  const [recentDrops, setRecentDrops] = useState([]);
  const [totalDropsCount, setTotalDropsCount] = useState(0);
  const [activeBallsCount, setActiveBallsCount] = useState(0);

  // Provably Fair Modal
  const [provablyModalData, setProvablyModalData] = useState(null);

  // Canvas & Physics Refs
  const canvasRef = useRef(null);
  const ballsRef = useRef([]); // Active falling balls
  const pinsRef = useRef([]); // Pin grid coordinates
  const pinHitTimesRef = useRef(new Map()); // Pin glow flash timestamps
  const binBounceRef = useRef(new Map()); // Bin landing animations
  const animFrameRef = useRef(null);
  const autoDropIntervalRef = useRef(null);

  // Active Multipliers for current rows + risk
  const multipliers = useMemo(() => getPlinkoMultipliers(rows, risk), [rows, risk]);

  // Color coding for bins
  const getBinColor = useCallback((mult, index, total) => {
    const center = Math.floor(total / 2);
    const distFromCenter = Math.abs(index - center);
    const maxDist = center;
    const ratio = distFromCenter / (maxDist || 1);

    if (mult >= 50) return '#ec4899'; // Neon Pink / Grand Jackpot
    if (mult >= 10) return '#ef4444'; // Bright Red
    if (mult >= 3) return '#f59e0b'; // Amber Gold
    if (mult >= 1.2) return '#22c55e'; // Emerald
    if (mult >= 1.0) return '#06b6d4'; // Cyan
    return '#3b82f6'; // Blue
  }, []);

  // Compute Pin Positions on Canvas resize or row change
  const computePinLayout = useCallback((width, height, rowCount) => {
    const pins = [];
    const topMargin = 50;
    const bottomMargin = 70;
    const availableHeight = height - topMargin - bottomMargin;
    const rowSpacing = availableHeight / rowCount;

    for (let r = 0; r < rowCount; r++) {
      const pinCount = r + 3;
      const pinSpacing = Math.min(rowSpacing * 1.15, (width * 0.88) / (rowCount + 3));
      const rowWidth = (pinCount - 1) * pinSpacing;
      const startX = (width - rowWidth) / 2;
      const y = topMargin + r * rowSpacing;

      for (let c = 0; c < pinCount; c++) {
        pins.push({
          row: r,
          col: c,
          x: startX + c * pinSpacing,
          y,
          radius: 3.5,
        });
      }
    }
    return pins;
  }, []);

  // Draw Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const now = performance.now();

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Pins
    const pins = pinsRef.current;
    pins.forEach((pin, idx) => {
      const hitTime = pinHitTimesRef.current.get(idx) || 0;
      const timeSinceHit = now - hitTime;
      const isLit = timeSinceHit < 250;

      ctx.beginPath();
      ctx.arc(pin.x, pin.y, isLit ? pin.radius * 1.5 : pin.radius, 0, Math.PI * 2);

      if (isLit) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // 2. Draw Multiplier Bins at Bottom
    const binCount = rows + 1;
    const bottomMargin = 70;
    const binHeight = 32;
    const binY = height - bottomMargin + 20;
    const pinsLastRow = pins.filter((p) => p.row === rows - 1);

    if (pinsLastRow.length >= 2) {
      const startX = pinsLastRow[0].x;
      const endX = pinsLastRow[pinsLastRow.length - 1].x;
      const totalBinWidth = endX - startX;
      const binWidth = totalBinWidth / (binCount - 1);

      multipliers.forEach((mult, i) => {
        const binX = startX + i * binWidth - binWidth / 2;
        const bounceTime = binBounceRef.current.get(i) || 0;
        const timeSinceBounce = now - bounceTime;
        const isBouncing = timeSinceBounce < 300;
        const offsetY = isBouncing ? Math.sin((timeSinceBounce / 300) * Math.PI) * 6 : 0;

        const binColor = getBinColor(mult, i, binCount);

        ctx.save();
        ctx.translate(0, offsetY);

        // Bin background
        ctx.fillStyle = isBouncing ? '#ffffff' : binColor;
        ctx.beginPath();
        const r = 4;
        const bx = binX + 2;
        const by = binY;
        const bw = binWidth - 4;
        const bh = binHeight;
        ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, r) : ctx.rect(bx, by, bw, bh);
        ctx.fill();

        // Multiplier Text
        ctx.fillStyle = isBouncing ? '#090d16' : '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${mult}x`, bx + bw / 2, by + bh / 2);

        ctx.restore();
      });
    }

    // 3. Update & Draw Balls
    const activeBalls = ballsRef.current;
    const remainingBalls = [];

    for (let i = 0; i < activeBalls.length; i++) {
      const ball = activeBalls[i];

      // Physics interpolation along provably fair path
      ball.progress += 0.022; // speed factor
      const currentRow = Math.floor(ball.progress);
      const frac = ball.progress - currentRow;

      if (currentRow < rows) {
        // Find pins surrounding this step
        const stepDir = ball.path[currentRow] || 0;
        const rowPins = pins.filter((p) => p.row === currentRow);
        const nextRowPins = pins.filter((p) => p.row === currentRow + 1);

        const currentPinIdx = ball.currentCol;
        const fromPin = rowPins[currentPinIdx] || rowPins[0];

        // Next pin target based on binary deflection
        const nextCol = currentPinIdx + stepDir;
        const toPin = nextRowPins[nextCol] || {
          x: fromPin.x + (stepDir === 1 ? 14 : -14),
          y: fromPin.y + 24,
        };

        // Hermite / Bezier trajectory with deflection arc
        const midX = (fromPin.x + toPin.x) / 2 + (stepDir === 1 ? 4 : -4);
        const midY = (fromPin.y + toPin.y) / 2 - 4;

        ball.x = (1 - frac) * (1 - frac) * fromPin.x + 2 * (1 - frac) * frac * midX + frac * frac * toPin.x;
        ball.y = (1 - frac) * (1 - frac) * fromPin.y + 2 * (1 - frac) * frac * midY + frac * frac * toPin.y;

        // Hit pin trigger
        if (frac > 0.85 && !ball.hitPins.has(currentRow)) {
          ball.hitPins.add(currentRow);
          ball.currentCol = nextCol;
          const pinIdx = pins.findIndex((p) => p.row === currentRow && p.col === currentPinIdx);
          if (pinIdx !== -1) {
            pinHitTimesRef.current.set(pinIdx, now);
            playPlinkoSound('pin', currentRow);
          }
        }

        // Draw glowing ball
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.shadowColor = ball.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();

        remainingBalls.push(ball);
      } else {
        // Ball reached landing bin!
        binBounceRef.current.set(ball.binIndex, now);

        if (ball.multiplier >= 10) {
          playPlinkoSound('jackpot');
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.85 },
            colors: ['#ef4444', '#f59e0b', '#ec4899', '#ffffff'],
          });
        } else if (ball.multiplier >= 1.2) {
          playPlinkoSound('bin_win');
        } else {
          playPlinkoSound('bin_low');
        }

        // Add to recent drops strip
        setRecentDrops((prev) => [
          {
            id: ball.id,
            multiplier: ball.multiplier,
            payout: ball.payout,
            binIndex: ball.binIndex,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 19),
        ]);
      }
    }

    ballsRef.current = remainingBalls;
    setActiveBallsCount(remainingBalls.length);

    animFrameRef.current = requestAnimationFrame(renderCanvas);
  }, [rows, multipliers, getBinColor]);

  // Resize canvas & rebuild pin layout
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      pinsRef.current = computePinLayout(rect.width, rect.height, rows);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    animFrameRef.current = requestAnimationFrame(renderCanvas);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [rows, computePinLayout, renderCanvas]);

  // Drop Disc Action
  const handleDropDisc = async () => {
    if (balance < stake) {
      triggerToast('Insufficient funds. Top up via M-Pesa to drop discs.', 'warning');
      onOpenDeposit();
      return;
    }

    try {
      setIsDropping(true);
      const res = await fetch('/api/games/plinko/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake, rows, risk }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.message || 'Error dropping disc.', 'error');
        setIsDropping(false);
        return;
      }

      if (typeof data.newBalance === 'number') {
        onBalanceChange(data.newBalance);
      }

      // Spawn ball on canvas
      const canvas = canvasRef.current;
      const rect = canvas ? canvas.getBoundingClientRect() : { width: 500 };
      const topPin = pinsRef.current[0] || { x: rect.width / 2, y: 50 };

      const newBall = {
        id: data.dropId,
        x: topPin.x,
        y: 20,
        radius: 6,
        color: data.multiplier >= 10 ? '#ec4899' : data.multiplier >= 2 ? '#f59e0b' : '#38bdf8',
        progress: 0,
        currentCol: 0,
        path: data.path,
        binIndex: data.binIndex,
        multiplier: data.multiplier,
        payout: data.payout,
        hitPins: new Set(),
      };

      ballsRef.current.push(newBall);
      setTotalDropsCount((prev) => prev + 1);

      // Save provably fair data for verification inspection
      setProvablyModalData({
        dropId: data.dropId,
        stake: data.stake,
        rows: data.rows,
        risk: data.risk,
        binIndex: data.binIndex,
        multiplier: data.multiplier,
        payout: data.payout,
        serverSeed: data.serverSeed,
        serverSeedHash: data.serverSeedHash,
        clientSeed: data.clientSeed,
        nonce: data.nonce,
        path: data.path,
      });
    } catch (err) {
      console.error('Plinko drop error:', err);
      triggerToast('Network error dropping disc.', 'error');
    } finally {
      setIsDropping(false);
    }
  };

  // Auto Drop Handling
  useEffect(() => {
    if (autoDropActive) {
      autoDropIntervalRef.current = setInterval(() => {
        handleDropDisc();
      }, 350);
    } else {
      if (autoDropIntervalRef.current) clearInterval(autoDropIntervalRef.current);
    }
    return () => {
      if (autoDropIntervalRef.current) clearInterval(autoDropIntervalRef.current);
    };
  }, [autoDropActive, stake, rows, risk, balance]);

  return (
    <div className="jp-plinko-container">
      {/* ---------------- TOP HEADER BAR ---------------- */}
      <div className="jp-plinko-header">
        <div className="jp-plinko-title-wrap">
          <div className="jp-plinko-badge">PHYSICS ARCADE</div>
          <h2 className="jp-plinko-title">
            <span className="jp-plinko-icon">▲</span> JETPESA PLINKO 99% RTP
          </h2>
        </div>

        <div className="jp-plinko-header-actions">
          {provablyModalData && (
            <button
              onClick={() => onOpenProvably ? onOpenProvably() : null}
              className="jp-plinko-seed-btn"
              title="Verify Provably Fair Drop"
            >
              🛡️ Verify Hash
            </button>
          )}
        </div>
      </div>

      {/* ---------------- RECENT MULTIPLIERS STRIP ---------------- */}
      <div className="jp-plinko-history-strip">
        <span className="jp-history-label">RECENT:</span>
        <div className="jp-history-pills">
          {recentDrops.length === 0 ? (
            <span className="jp-history-empty">Drop discs to see live multipliers</span>
          ) : (
            recentDrops.map((d) => (
              <span
                key={d.id}
                className="jp-history-pill"
                style={{
                  background: getBinColor(d.multiplier, d.binIndex, rows + 1),
                  color: '#fff',
                }}
              >
                {d.multiplier}x
              </span>
            ))
          )}
        </div>
      </div>

      {/* ---------------- MAIN ARENA (CANVAS + SIDEBAR) ---------------- */}
      <div className="jp-plinko-arena">
        {/* Plinko Peg Board Canvas */}
        <div className="jp-canvas-box">
          <canvas ref={canvasRef} className="jp-plinko-canvas" />
        </div>

        {/* Controls Sidebar */}
        <div className="jp-plinko-controls">
          {/* Stake Input */}
          <div className="jp-control-card">
            <div className="jp-control-label-row">
              <span className="jp-control-title">BET AMOUNT (KES)</span>
              <span className="jp-control-limits">Min: 10 • Max: 25k</span>
            </div>

            <div className="jp-stepper">
              <button
                onClick={() => setStake((p) => Math.max(10, p - 10))}
                className="jp-stepper-btn"
              >
                −
              </button>
              <input
                type="number"
                value={stake}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) setStake(Math.max(10, Math.min(25000, val)));
                }}
                className="jp-stepper-input"
              />
              <button
                onClick={() => setStake((p) => Math.min(25000, p + 10))}
                className="jp-stepper-btn"
              >
                +
              </button>
            </div>

            <div className="jp-quick-chips">
              {[50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  className={`jp-chip-btn ${stake === v ? 'jp-chip-active' : ''}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level Selector */}
          <div className="jp-control-card">
            <span className="jp-control-title">RISK LEVEL</span>
            <div className="jp-tier-tabs">
              {PLINKO_RISKS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  className={`jp-tier-btn jp-risk-${r} ${risk === r ? 'jp-tier-active' : ''}`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Rows Selector */}
          <div className="jp-control-card">
            <span className="jp-control-title">ROWS ({rows} PEGS)</span>
            <div className="jp-row-selector">
              {PLINKO_ROWS.map((num) => (
                <button
                  key={num}
                  onClick={() => setRows(num)}
                  className={`jp-row-btn ${rows === num ? 'jp-row-active' : ''}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="jp-actions-group">
            <button
              onClick={handleDropDisc}
              disabled={autoDropActive}
              className="jp-drop-btn"
            >
              <span>DROP DISC (KES {stake.toLocaleString()})</span>
            </button>

            <button
              onClick={() => setAutoDropActive((prev) => !prev)}
              className={`jp-autodrop-btn ${autoDropActive ? 'jp-auto-active' : ''}`}
            >
              {autoDropActive ? '⏹ STOP AUTO DROP' : '⚡ AUTO DROP (RAPID)'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- STYLES ---------------- */}
      <style jsx>{`
        .jp-plinko-container {
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

        .jp-plinko-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .jp-plinko-badge {
          font-size: 10px;
          font-weight: 800;
          color: #22c55e;
          letter-spacing: 1px;
        }

        .jp-plinko-title {
          font-size: 18px;
          font-weight: 800;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-plinko-icon {
          color: #22c55e;
          font-size: 16px;
        }

        .jp-plinko-seed-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }
        .jp-plinko-seed-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        /* History Strip */
        .jp-plinko-history-strip {
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
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 800;
          animation: popIn 0.25s ease-out;
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
        .jp-plinko-arena {
          display: grid;
          grid-template-columns: 1fr 310px;
          gap: 16px;
        }

        @media (max-width: 900px) {
          .jp-plinko-arena {
            grid-template-columns: 1fr;
          }
        }

        .jp-canvas-box {
          position: relative;
          width: 100%;
          height: 480px;
          background: radial-gradient(circle at 50% 20%, #1e293b 0%, #090d16 90%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.7);
        }

        .jp-plinko-canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        /* Controls Sidebar */
        .jp-plinko-controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .jp-control-card {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .jp-control-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jp-control-title {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .jp-control-limits {
          font-size: 10px;
          color: #64748b;
        }

        .jp-stepper {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-stepper-btn {
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
        .jp-stepper-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .jp-stepper-input {
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
        }
        .jp-chip-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }
        .jp-chip-active {
          background: rgba(34, 197, 94, 0.2);
          border-color: #22c55e;
          color: #22c55e;
        }

        /* Risk Tabs */
        .jp-tier-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .jp-tier-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          padding: 8px 0;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-tier-btn:hover {
          color: #fff;
        }

        .jp-risk-low.jp-tier-active {
          background: rgba(34, 197, 94, 0.2);
          border-color: #22c55e;
          color: #22c55e;
        }
        .jp-risk-medium.jp-tier-active {
          background: rgba(245, 158, 11, 0.2);
          border-color: #f59e0b;
          color: #f59e0b;
        }
        .jp-risk-high.jp-tier-active {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ef4444;
        }

        /* Row Selector */
        .jp-row-selector {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }

        .jp-row-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 800;
          padding: 7px 0;
          cursor: pointer;
        }
        .jp-row-btn:hover {
          color: #fff;
        }
        .jp-row-active {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          color: #38bdf8;
        }

        /* CTAs */
        .jp-actions-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 4px;
        }

        .jp-drop-btn {
          width: 100%;
          min-height: 54px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
          transition: all 0.2s;
        }
        .jp-drop-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
        }

        .jp-autodrop-btn {
          width: 100%;
          padding: 10px 0;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jp-autodrop-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .jp-auto-active {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ef4444;
          animation: pulseRed 1.5s infinite;
        }

        @keyframes pulseRed {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
