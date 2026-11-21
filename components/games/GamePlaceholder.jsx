'use client';

import { getGameById } from '../../lib/games/registry';

export default function GamePlaceholder({ gameId, onBackToAviator, onOpenLobby }) {
  const game = getGameById(gameId);

  return (
    <div className="jp-placeholder-container" style={{ '--accent': game.accentColor }}>
      <div className="jp-placeholder-card">
        {/* Header Ribbon */}
        <div className="jp-placeholder-header">
          <div className="jp-placeholder-badge" style={{ background: `${game.accentColor}22`, borderColor: game.accentColor, color: game.accentColor }}>
            <span>ROADMAP • COMING UP NEXT</span>
          </div>
          <h1 className="jp-placeholder-title">{game.title}</h1>
          <p className="jp-placeholder-desc">{game.description}</p>
        </div>

        {/* Feature Specs Grid */}
        <div className="jp-specs-grid">
          <div className="jp-spec-card">
            <span className="jp-spec-label">RETURN TO PLAYER (RTP)</span>
            <strong className="jp-spec-val" style={{ color: '#22c55e' }}>{game.rtp}</strong>
            <small className="jp-spec-sub">Audited Provably Fair</small>
          </div>
          <div className="jp-spec-card">
            <span className="jp-spec-label">HOUSE EDGE</span>
            <strong className="jp-spec-val" style={{ color: '#38bdf8' }}>{game.houseEdge}</strong>
            <small className="jp-spec-sub">Low Margin Math</small>
          </div>
          <div className="jp-spec-card">
            <span className="jp-spec-label">STAKE LIMITS</span>
            <strong className="jp-spec-val">KES {game.minBet} - {game.maxBet.toLocaleString()}</strong>
            <small className="jp-spec-sub">Safaricom M-Pesa Integrated</small>
          </div>
        </div>

        {/* Key Features List */}
        <div className="jp-features-box">
          <h4 className="jp-features-heading">CORE GAMEPLAY MECHANICS & SPECS</h4>
          <div className="jp-features-chips">
            {game.features?.map((f, i) => (
              <div key={i} className="jp-feature-chip">
                <span className="jp-feature-dot" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="jp-placeholder-actions">
          <button
            type="button"
            onClick={onBackToAviator}
            className="jp-action-btn jp-btn-primary"
          >
            <span>PLAY AVIATOR NOW (ACTIVE)</span>
          </button>
          <button
            type="button"
            onClick={onOpenLobby}
            className="jp-action-btn jp-btn-secondary"
          >
            <span>BROWSE ALL CASINO GAMES</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-placeholder-container {
          width: 100%;
          min-height: 480px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: radial-gradient(circle at 50% 30%, rgba(17, 20, 28, 0.8) 0%, #06070a 100%);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
        }

        .jp-placeholder-card {
          max-width: 680px;
          width: 100%;
          background: #0d1017;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
          position: relative;
          z-index: 2;
        }

        .jp-placeholder-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
        }

        .jp-placeholder-badge {
          display: inline-flex;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .jp-placeholder-title {
          font-size: 26px;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
        }

        .jp-placeholder-desc {
          font-size: 13px;
          color: #94a3b8;
          max-width: 520px;
          margin: 0;
          line-height: 1.5;
        }

        .jp-specs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .jp-spec-card {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          text-align: center;
        }

        .jp-spec-label {
          font-size: 9px;
          color: #64748b;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .jp-spec-val {
          font-size: 15px;
          font-weight: 900;
          color: #ffffff;
        }

        .jp-spec-sub {
          font-size: 9.5px;
          color: #94a3b8;
        }

        .jp-features-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .jp-features-heading {
          margin: 0;
          font-size: 10px;
          color: #64748b;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .jp-features-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .jp-feature-chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          color: #cbd5e1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
        }

        .jp-feature-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent, #38bdf8);
        }

        .jp-placeholder-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .jp-action-btn {
          border-radius: 9px;
          padding: 12px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          transition: all 0.15s ease;
        }

        .jp-btn-primary {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
        }

        .jp-btn-primary:hover {
          filter: brightness(1.15);
        }

        .jp-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
        }

        .jp-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        @media (max-width: 640px) {
          .jp-specs-grid {
            grid-template-columns: 1fr;
          }
          .jp-placeholder-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
