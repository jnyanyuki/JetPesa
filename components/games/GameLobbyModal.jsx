'use client';

import { useState } from 'react';
import { GAMES_REGISTRY, GAME_CATEGORIES, CATEGORY_LABELS } from '../../lib/games/registry';

function GameIcon({ name, size = 20, color = 'currentColor' }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'plane':
      return (
        <svg {...common}>
          <path d="M17.8 16.8 21 21l-4.2-3.2" />
          <path d="M2.5 13.5 21 3l-8.5 18-2.7-7.3-7.3-2.7Z" />
        </svg>
      );
    case 'bomb':
      return (
        <svg {...common}>
          <circle cx="11" cy="13" r="8" />
          <path d="m19.5 4.5-3 3" />
          <path d="m14 7 3-3" />
          <path d="M21 2h-4v4" />
        </svg>
      );
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        </svg>
      );
    case 'dices':
      return (
        <svg {...common}>
          <rect width="12" height="12" x="2" y="10" rx="2" ry="2" />
          <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3.12l-4.8-4.8a2.24 2.24 0 0 0-3.12 0L10 6" />
          <circle cx="6" cy="14" r="1" fill={color} />
          <circle cx="10" cy="18" r="1" fill={color} />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'coins':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
          <path d="M7 6h1v4" />
          <path d="m16.71 13.88.7.71-2.82 2.82" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5" />
          <path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5" />
        </svg>
      );
    case 'disc':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" x2="12" y1="2" y2="4" />
          <line x1="12" x2="12" y1="20" y2="22" />
          <line x1="20" x2="22" y1="12" y2="12" />
          <line x1="2" x2="4" y1="12" y2="12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}

export default function GameLobbyModal({ isOpen, onClose, activeGameId, onSelectGame }) {
  const [selectedCategory, setSelectedCategory] = useState(GAME_CATEGORIES.ALL);

  if (!isOpen) return null;

  const filteredGames = selectedCategory === GAME_CATEGORIES.ALL
    ? GAMES_REGISTRY
    : GAMES_REGISTRY.filter((g) => g.category === selectedCategory);

  return (
    <div className="jp-modal-overlay" onClick={onClose}>
      <div className="jp-modal-box jp-lobby-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="jp-lobby-modal-header">
          <div className="jp-lobby-title-wrap">
            <div className="jp-lobby-badge-pulse">
              <span className="jp-live-dot-pulse" />
              <span>OFFICIAL CASINO & ARCADE</span>
            </div>
            <h2 className="jp-lobby-modal-title">
              JET<span style={{ color: '#ef4444' }}>PESA</span> GAME LOBBY
            </h2>
            <p className="jp-lobby-modal-sub">
              Select any game below to play instantly with your synchronized M-Pesa wallet.
            </p>
          </div>
          <button className="jp-modal-close" onClick={onClose} aria-label="Close Lobby">
            ✕
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="jp-lobby-cat-bar">
          {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              className={`jp-lobby-cat-btn ${selectedCategory === catKey ? 'jp-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Games Grid */}
        <div className="jp-lobby-grid">
          {filteredGames.map((game) => {
            const isActive = activeGameId === game.id;
            return (
              <div
                key={game.id}
                className={`jp-lobby-card ${isActive ? 'jp-card-active' : ''} ${!game.isLive ? 'jp-card-upcoming' : ''}`}
                style={{ '--accent-color': game.accentColor }}
                onClick={() => {
                  onSelectGame(game.id);
                  onClose();
                }}
              >
                {/* Top Row: Icon + Badge */}
                <div className="jp-card-top-row">
                  <div className="jp-card-icon-wrap" style={{ background: `${game.accentColor}1a`, borderColor: `${game.accentColor}40` }}>
                    <GameIcon name={game.icon} size={24} color={game.accentColor} />
                  </div>
                  <div className="jp-card-badges">
                    <span className={`jp-game-badge jp-badge-${game.badgeType}`}>
                      {game.badge}
                    </span>
                    {isActive && (
                      <span className="jp-game-badge jp-badge-current">
                        CURRENT
                      </span>
                    )}
                  </div>
                </div>

                {/* Game Title & Provider */}
                <div className="jp-card-info">
                  <h3 className="jp-card-title">{game.title}</h3>
                  <span className="jp-card-provider">{game.provider} • {game.category.toUpperCase()}</span>
                  <p className="jp-card-desc">{game.description}</p>
                </div>

                {/* Key Metrics: RTP & Min Bet */}
                <div className="jp-card-metrics">
                  <div className="jp-metric-pill">
                    <span className="jp-metric-label">RTP</span>
                    <strong className="jp-metric-val jp-green-text">{game.rtp}</strong>
                  </div>
                  <div className="jp-metric-pill">
                    <span className="jp-metric-label">MIN BET</span>
                    <strong className="jp-metric-val">KES {game.minBet}</strong>
                  </div>
                  <div className="jp-metric-pill">
                    <span className="jp-metric-label">MAX BET</span>
                    <strong className="jp-metric-val">KES {game.maxBet.toLocaleString()}</strong>
                  </div>
                </div>

                {/* Action CTA Button */}
                <button
                  type="button"
                  className={`jp-card-action-btn ${isActive ? 'jp-btn-current' : game.isLive ? 'jp-btn-play' : 'jp-btn-preview'}`}
                >
                  {isActive ? (
                    'NOW PLAYING'
                  ) : game.isLive ? (
                    'PLAY NOW'
                  ) : (
                    'VIEW ROADMAP & PREVIEW'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .jp-lobby-modal-box {
          max-width: 920px !important;
          width: 95% !important;
          background: #090b10 !important;
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.9), 0 0 30px rgba(239, 68, 68, 0.1) !important;
          padding: 24px !important;
          border-radius: 20px !important;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 90vh !important;
          overflow-y: auto !important;
        }

        .jp-lobby-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 14px;
        }

        .jp-lobby-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .jp-lobby-badge-pulse {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #ef4444;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .jp-lobby-modal-title {
          font-size: 24px;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .jp-lobby-modal-sub {
          font-size: 12px;
          color: #94a3b8;
          margin: 0;
        }

        .jp-lobby-cat-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .jp-lobby-cat-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .jp-lobby-cat-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f1f5f9;
        }

        .jp-lobby-cat-btn.jp-active {
          background: #ef4444;
          border-color: #ef4444;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
        }

        .jp-lobby-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 14px;
        }

        .jp-lobby-card {
          background: #11141c;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          cursor: pointer;
          position: relative;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .jp-lobby-card:hover {
          transform: translateY(-3px);
          border-color: var(--accent-color);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 18px rgba(239, 68, 68, 0.12);
        }

        .jp-card-active {
          border-color: #22c55e !important;
          box-shadow: 0 0 20px rgba(34, 197, 94, 0.25) !important;
        }

        .jp-card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .jp-card-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-card-badges {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .jp-game-badge {
          font-size: 9.5px;
          font-weight: 900;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .jp-badge-hot {
          background: rgba(239, 68, 68, 0.18);
          border: 1px solid #ef4444;
          color: #f87171;
        }

        .jp-badge-blue {
          background: rgba(56, 189, 248, 0.18);
          border: 1px solid #38bdf8;
          color: #38bdf8;
        }

        .jp-badge-green {
          background: rgba(34, 197, 94, 0.18);
          border: 1px solid #22c55e;
          color: #4ade80;
        }

        .jp-badge-purple {
          background: rgba(168, 85, 247, 0.18);
          border: 1px solid #a855f7;
          color: #c084fc;
        }

        .jp-badge-gold {
          background: rgba(245, 158, 11, 0.18);
          border: 1px solid #f59e0b;
          color: #fbbf24;
        }

        .jp-badge-amber {
          background: rgba(234, 179, 8, 0.18);
          border: 1px solid #eab308;
          color: #fde047;
        }

        .jp-badge-rose {
          background: rgba(236, 72, 153, 0.18);
          border: 1px solid #ec4899;
          color: #f472b6;
        }

        .jp-badge-red {
          background: rgba(244, 63, 94, 0.18);
          border: 1px solid #f43f5e;
          color: #fb7185;
        }

        .jp-badge-current {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid #22c55e;
          color: #22c55e;
        }

        .jp-card-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .jp-card-title {
          font-size: 15px;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
        }

        .jp-card-provider {
          font-size: 10px;
          color: #64748b;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .jp-card-desc {
          font-size: 11px;
          color: #94a3b8;
          margin: 4px 0 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .jp-card-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          background: rgba(0, 0, 0, 0.35);
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.03);
        }

        .jp-metric-pill {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .jp-metric-label {
          font-size: 8px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
        }

        .jp-metric-val {
          font-size: 11px;
          font-weight: 900;
          color: #e2e8f0;
        }

        .jp-green-text {
          color: #22c55e !important;
        }

        .jp-card-action-btn {
          width: 100%;
          border-radius: 9px;
          padding: 9px;
          font-size: 11.5px;
          font-weight: 900;
          letter-spacing: 0.04em;
          cursor: pointer;
          border: none;
          transition: filter 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-btn-play {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
        }

        .jp-btn-play:hover {
          filter: brightness(1.15);
        }

        .jp-btn-current {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid #22c55e;
          color: #22c55e;
        }

        .jp-btn-preview {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
        }

        .jp-btn-preview:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }
      `}</style>
    </div>
  );
}
