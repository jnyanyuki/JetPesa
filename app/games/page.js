'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth/client';
import { GAMES_REGISTRY, GAME_CATEGORIES, CATEGORY_LABELS } from '../../lib/games/registry';

/* -------------------------------------------------------------------------- */
/*  Game Icon System                                                          */
/* -------------------------------------------------------------------------- */
function GameIcon({ name, size = 24, color = 'currentColor' }) {
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

export default function GamesLobbyPage() {
  const router = useRouter();

  // User state
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [balance, setBalance] = useState(0.0);
  const [userIdCode, setUserIdCode] = useState('');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [depositPhone, setDepositPhone] = useState('');
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState(GAME_CATEGORIES.ALL);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync session and wallet
  useEffect(() => {
    let isMounted = true;
    async function loadSession() {
      try {
        const { data: session } = await authClient.getSession();
        if (session?.user && isMounted) {
          setUser(session.user);
          // Load 8-digit ID
          if (session.user.id) {
            let hash = 0;
            for (let i = 0; i < session.user.id.length; i++) {
              hash = (hash << 5) - hash + session.user.id.charCodeAt(i);
              hash |= 0;
            }
            const positiveHash = Math.abs(hash);
            const num8 = String(10000000 + (positiveHash % 90000000));
            setUserIdCode(num8);
          }

          // Fetch wallet balance
          const res = await fetch('/api/user/wallet');
          if (res.ok) {
            const data = await res.json();
            if (data.success && isMounted) {
              setBalance(Number(data.walletBalance || data.balance || 0));
            }
          }
        } else if (isMounted) {
          setUser(null);
          setUserIdCode('');
          setBalance(0);
        }
      } catch (err) {
        console.warn('Error loading session in games lobby:', err);
        if (isMounted) {
          setUser(null);
          setUserIdCode('');
          setBalance(0);
        }
      } finally {
        if (isMounted) setAuthChecked(true);
      }
    }
    loadSession();
    return () => { isMounted = false; };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Deposit handler
  const handleInitiateDeposit = async () => {
    if (!depositPhone || depositPhone.trim().length < 9) {
      showToast('Please enter a valid Safaricom phone number.');
      return;
    }
    const amt = Number(depositAmount);
    if (!amt || amt < 10) {
      showToast('Minimum deposit is KES 10.');
      return;
    }

    setLoadingDeposit(true);
    try {
      const res = await fetch('/api/printpay/c2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: depositPhone, amount: amt }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('M-Pesa STK Prompt sent! Enter your PIN on your phone.');
        setIsDepositModalOpen(false);
      } else {
        showToast(data.message || 'Deposit initiation failed.');
      }
    } catch {
      showToast('Network error during deposit initiation.');
    } finally {
      setLoadingDeposit(false);
    }
  };

  // Filtered games
  const filteredGames = useMemo(() => {
    return GAMES_REGISTRY.filter((game) => {
      const matchesCategory =
        selectedCategory === GAME_CATEGORIES.ALL || game.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Handle game launch: if unauthenticated, navigate to auth form with target game
  const handleGameLaunch = (e, game) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!game.isLive) {
      showToast(`${game.title} is currently in final audit! Scheduled for release next.`);
      return;
    }
    if (!user) {
      const redirectUrl = `/dashboard?game=${game.id}`;
      router.push(`/auth?tab=login&redirect=${encodeURIComponent(redirectUrl)}&game=${encodeURIComponent(game.title)}`);
      return;
    }
    router.push(`/dashboard?game=${game.id}`);
  };

  return (
    <div className="jp-lobby-page">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="jp-toast-pill">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* HEADER                                                              */}
      {/* =================================================================== */}
      <header className="jp-lobby-header">
        <div className="jp-header-left">
          <Link href="/dashboard" className="jp-logo-link">
            <span className="jp-logo-text">
              JET<span className="jp-logo-accent">PESA</span>
            </span>
          </Link>
          <div className="jp-bclb-tag">
            <span>🇰🇪 BCLB LICENSED</span>
          </div>
        </div>

        {user ? (
          <div className="jp-header-right">
            <Link href="/dashboard" className="jp-back-cockpit-btn">
              <span>✈️ RETURN TO COCKPIT</span>
            </Link>

            {userIdCode && (
              <div className="jp-user-id-pill" title={`8-Digit Pilot ID: ${userIdCode}`}>
                <span>ID: {userIdCode}</span>
              </div>
            )}

            <div className="jp-wallet-pill">
              <div className="jp-balance-val">
                <span className="jp-currency">KES</span>
                <strong className="jp-amount">{balance.toFixed(2)}</strong>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(true)}
                className="jp-deposit-btn"
              >
                DEPOSIT
              </button>
            </div>
          </div>
        ) : (
          <div className="jp-header-right jp-header-unauth">
            <Link href="/auth?tab=login&redirect=/games" className="jp-btn-login-ghost">
              LOG IN
            </Link>
            <Link href="/auth?tab=signup&redirect=/games" className="jp-btn-register-solid">
              <span>REGISTER</span>
              <span className="jp-register-fast-dot" />
            </Link>
          </div>
        )}
      </header>

      {/* =================================================================== */}
      {/* UN-AUTHENTICATED LANDING HERO BANNER                                */}
      {/* =================================================================== */}
      {!user && (
        <section className="jp-unauth-landing-hero">
          <div className="jp-unauth-hero-inner">
            <div className="jp-unauth-pill-tag">
              <span className="jp-pulse-red-dot" />
              <span>KENYA&apos;S PREMIER REAL-MONEY CASINO & CRASH ARCADE</span>
            </div>
            <h1 className="jp-unauth-title">
              Instant Flights. Real Multipliers. <br />
              <span className="jp-title-gradient">Zero Waiting. Instant M-Pesa Cashouts.</span>
            </h1>
            <p className="jp-unauth-desc">
              Experience Kenya&apos;s leading provably fair multiplier games with automated Safaricom M-Pesa STK deposits and lightning-fast B2C cashouts from KES 10. Click any game to play or register in 10 seconds.
            </p>
            <div className="jp-unauth-cta-row">
              <Link href="/auth?tab=signup&redirect=/games" className="jp-cta-primary-green">
                <span>CREATE FREE ACCOUNT</span>
                <span className="jp-cta-arrow">➔</span>
              </Link>
              <Link href="/auth?tab=login&redirect=/games" className="jp-cta-secondary-ghost">
                <span>PILOT SIGN IN</span>
              </Link>
            </div>
            <div className="jp-unauth-perks-row">
              <div className="jp-perk-item">
                <span className="jp-perk-icon">⚡</span>
                <span>Instant M-Pesa STK</span>
              </div>
              <div className="jp-perk-item">
                <span className="jp-perk-icon">🛡️</span>
                <span>BCLB Licensed (Cap 131)</span>
              </div>
              <div className="jp-perk-item">
                <span className="jp-perk-icon">🎲</span>
                <span>SHA-256 Provably Fair</span>
              </div>
              <div className="jp-perk-item">
                <span className="jp-perk-icon">💰</span>
                <span>KES 10 Minimum Entry</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* CONTROLS: CATEGORIES & SEARCH                                       */}
      {/* =================================================================== */}
      <div className="jp-lobby-controls">
        <div className="jp-categories-bar">
          {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              className={`jp-cat-btn ${selectedCategory === catKey ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="jp-search-box">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search games (Aviator, Mines, Dice, Plinko...)"
            className="jp-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="jp-search-clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* GAMES GRID                                                          */}
      {/* =================================================================== */}
      <main className="jp-games-grid-section">
        <div className="jp-games-grid">
          {filteredGames.map((game) => {
            const gameHref = `/dashboard?game=${game.id}`;

            return (
              <div
                key={game.id}
                onClick={(e) => handleGameLaunch(e, game)}
                className={`jp-game-card ${game.isLive ? 'is-live' : 'is-upcoming'} jp-card-clickable`}
                style={{ '--card-accent': game.accentColor }}
              >
                {/* Header: Icon + Badge */}
                <div className="jp-card-header">
                  <div
                    className="jp-card-icon-container"
                    style={{
                      background: `${game.accentColor}18`,
                      borderColor: `${game.accentColor}40`,
                    }}
                  >
                    <GameIcon name={game.icon} size={28} color={game.accentColor} />
                  </div>

                  <div className="jp-card-badge-row">
                    <span className={`jp-badge jp-badge-${game.badgeType}`}>
                      {game.badge}
                    </span>
                    {game.isLive && (
                      <span className="jp-badge jp-badge-live">LIVE</span>
                    )}
                  </div>
                </div>

                {/* Game Title & Description */}
                <div className="jp-card-body">
                  <h3 className="jp-card-title">{game.title}</h3>
                  <span className="jp-card-cat">
                    {game.provider} • {game.category.toUpperCase()}
                  </span>
                  <p className="jp-card-description">{game.description}</p>
                </div>

                {/* Features Chips */}
                <div className="jp-card-features">
                  {game.features?.slice(0, 3).map((f, i) => (
                    <span key={i} className="jp-feature-tag">
                      {f}
                    </span>
                  ))}
                </div>

                {/* Specs: RTP, Min, Max */}
                <div className="jp-card-specs">
                  <div className="jp-spec-cell">
                    <span className="jp-spec-lbl">RTP</span>
                    <strong className="jp-spec-val" style={{ color: '#22c55e' }}>
                      {game.rtp}
                    </strong>
                  </div>
                  <div className="jp-spec-cell">
                    <span className="jp-spec-lbl">MIN BET</span>
                    <strong className="jp-spec-val">KES {game.minBet}</strong>
                  </div>
                  <div className="jp-spec-cell">
                    <span className="jp-spec-lbl">MAX BET</span>
                    <strong className="jp-spec-val">
                      KES {game.maxBet.toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* CTA Action */}
                <div className="jp-card-footer">
                  {game.isLive ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGameLaunch(e, game);
                      }}
                      className="jp-play-btn"
                    >
                      <span>PLAY {game.shortName.toUpperCase()} NOW</span>
                      <span className="jp-play-arrow">➔</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => showToast(`${game.title} is currently in final audit! Scheduled for release next.`)}
                      className="jp-preview-btn"
                    >
                      <span>PREVIEW ROADMAP</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* =================================================================== */}
      {/* PROVABLY FAIR PLATFORM BANNER                                       */}
      {/* =================================================================== */}
      <section className="jp-lobby-hero">
        <div className="jp-hero-content">
          <div className="jp-hero-tag">
            <span className="jp-live-dot" />
            <span>OFFICIAL REAL-MONEY CASINO & CRASH ARCADE</span>
          </div>
          <h1 className="jp-hero-title">
            PROVABLY FAIR GAMES <br />
            <span className="jp-hero-gradient">FAST FLIGHTS. INSTANT CASHOUTS.</span>
          </h1>
          <p className="jp-hero-subtitle">
            Play Kenya&apos;s leading online multiplier games. Fully integrated with Safaricom M-Pesa
            instant STK deposits and automated B2C withdrawals.
          </p>

          <div className="jp-hero-stats">
            <div className="jp-hero-stat-card">
              <span className="jp-stat-num">97.5%</span>
              <span className="jp-stat-lbl">AUDITED PLATFORM RTP</span>
            </div>
            <div className="jp-hero-stat-card">
              <span className="jp-stat-num">KES 10</span>
              <span className="jp-stat-lbl">MINIMUM WAGER</span>
            </div>
            <div className="jp-hero-stat-card">
              <span className="jp-stat-num">SHA-256</span>
              <span className="jp-stat-lbl">PROVABLY FAIR SEED</span>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* FOOTER & BCLB REGULATORY                                            */}
      {/* =================================================================== */}
      <footer className="jp-lobby-footer">
        <div className="jp-footer-inner">
          <div className="jp-footer-bclb">
            <span className="jp-bclb-shield">🛡️</span>
            <div>
              <strong>Betting Control & Licensing Board (BCLB) Verified</strong>
              <p>
                JetPesa operates strictly in compliance with the Laws of Kenya (Betting, Lotteries
                and Gaming Act, Cap 131). Strictly 18+ only. Play responsibly.
              </p>
            </div>
          </div>
          <div className="jp-footer-links">
            <Link href="/dashboard?game=aviator">JetPesa Aviator</Link>
            <Link href="/dashboard?game=mines">JetPesa Mines</Link>
            <Link href="/auth">Pilot Portal</Link>
          </div>
        </div>
      </footer>

      {/* =================================================================== */}
      {/* DEPOSIT MODAL                                                       */}
      {/* =================================================================== */}
      {isDepositModalOpen && (
        <div className="jp-modal-overlay" onClick={() => setIsDepositModalOpen(false)}>
          <div className="jp-modal-box" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsDepositModalOpen(false)}
              className="jp-modal-close"
            >
              ✕
            </button>
            <h3 className="jp-modal-title">M-Pesa Express Deposit</h3>
            <div className="jp-field">
              <label>DEPOSIT AMOUNT (MIN 10 KES)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="jp-input"
              />
            </div>
            <div className="jp-field">
              <label>M-PESA REGISTERED PHONE</label>
              <input
                type="tel"
                value={depositPhone}
                onChange={(e) => setDepositPhone(e.target.value)}
                placeholder="07XXXXXXXX or 01XXXXXXXX"
                className="jp-input"
              />
            </div>
            <button
              type="button"
              disabled={loadingDeposit}
              onClick={handleInitiateDeposit}
              className="jp-modal-submit-btn"
            >
              {loadingDeposit ? 'SENDING STK PROMPT...' : 'AUTHORIZE STK DEPOSIT'}
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STYLING                                                             */}
      {/* =================================================================== */}
      <style jsx>{`
        .jp-lobby-page {
          min-height: 100vh;
          background: #06080d;
          color: #f8fafc;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
        }

        /* Toast */
        .jp-toast-pill {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: #38bdf8;
          padding: 10px 20px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 800;
          z-index: 99999;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
          animation: jpFadeIn 0.25s ease-out;
        }

        /* Header */
        .jp-lobby-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px;
          background: rgba(13, 16, 23, 0.85);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .jp-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .jp-logo-link {
          text-decoration: none;
        }

        .jp-logo-text {
          font-size: 22px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .jp-logo-accent {
          color: #ef4444;
        }

        .jp-bclb-tag {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .jp-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .jp-back-cockpit-btn {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #f87171;
          font-size: 11px;
          font-weight: 800;
          padding: 8px 14px;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .jp-back-cockpit-btn:hover {
          background: #ef4444;
          color: #ffffff;
        }

        .jp-user-id-pill {
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          font-size: 11px;
          font-weight: 800;
          padding: 6px 12px;
          border-radius: 8px;
          font-family: ui-monospace, monospace;
        }

        .jp-wallet-pill {
          display: flex;
          align-items: center;
          background: #020617;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 9px;
          overflow: hidden;
        }

        .jp-balance-val {
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-currency {
          font-size: 10px;
          color: #22c55e;
          font-weight: 800;
        }

        .jp-amount {
          font-size: 13px;
          font-weight: 900;
          color: #ffffff;
        }

        .jp-deposit-btn {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          color: #ffffff;
          padding: 7px 12px;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          transition: filter 0.15s ease;
        }

        .jp-deposit-btn:hover {
          filter: brightness(1.15);
        }

        /* Unauthenticated Header Navigation */
        .jp-header-unauth {
          gap: 10px;
        }

        .jp-btn-login-ghost {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 800;
          padding: 8px 18px;
          border-radius: 9px;
          text-decoration: none;
          letter-spacing: 0.03em;
          transition: all 0.15s ease;
        }

        .jp-btn-login-ghost:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.3);
          color: #ffffff;
        }

        .jp-btn-register-solid {
          background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
          border: none;
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          padding: 8px 20px;
          border-radius: 9px;
          text-decoration: none;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
          transition: all 0.15s ease;
        }

        .jp-btn-register-solid:hover {
          transform: translateY(-1px);
          filter: brightness(1.1);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
        }

        .jp-register-fast-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ffffff;
        }

        /* Unauthenticated Landing Hero Banner */
        .jp-unauth-landing-hero {
          padding: 56px 24px 40px;
          background: radial-gradient(circle at 50% 10%, rgba(239, 68, 68, 0.14) 0%, rgba(15, 23, 42, 0) 75%),
                      linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, transparent 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          justify-content: center;
          text-align: center;
        }

        .jp-unauth-hero-inner {
          max-width: 840px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .jp-unauth-pill-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #ef4444;
          letter-spacing: 0.08em;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          padding: 4px 12px;
          border-radius: 999px;
        }

        .jp-pulse-red-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 10px #ef4444;
          animation: pulseRed 1.8s infinite;
        }

        @keyframes pulseRed {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .jp-unauth-title {
          font-size: 38px;
          font-weight: 900;
          line-height: 1.14;
          margin: 0;
          letter-spacing: -0.03em;
        }

        .jp-title-gradient {
          background: linear-gradient(135deg, #ffffff 20%, #38bdf8 65%, #22c55e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .jp-unauth-desc {
          font-size: 15px;
          color: #94a3b8;
          max-width: 660px;
          margin: 0;
          line-height: 1.6;
        }

        .jp-unauth-cta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 6px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .jp-cta-primary-green {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #15803d 0%, #22c55e 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 900;
          padding: 13px 28px;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: 0.03em;
          box-shadow: 0 8px 24px rgba(34, 197, 94, 0.45);
          transition: all 0.15s ease;
        }

        .jp-cta-primary-green:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(34, 197, 94, 0.65);
          filter: brightness(1.1);
        }

        .jp-cta-secondary-ghost {
          display: inline-flex;
          align-items: center;
          padding: 13px 26px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 800;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .jp-cta-secondary-ghost:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.3);
          color: #ffffff;
        }

        .jp-unauth-perks-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .jp-perk-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #cbd5e1;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 6px 14px;
          border-radius: 999px;
        }

        .jp-card-clickable {
          cursor: pointer;
        }

        /* Hero / Trust Banner (After Games) */
        .jp-lobby-hero {
          padding: 56px 24px 48px;
          margin-top: 40px;
          background: radial-gradient(circle at 50% 20%, rgba(239, 68, 68, 0.08) 0%, transparent 70%);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: center;
          text-align: center;
        }

        .jp-hero-content {
          max-width: 800px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .jp-hero-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 900;
          color: #ef4444;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .jp-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 10px #ef4444;
        }

        .jp-hero-title {
          font-size: 38px;
          font-weight: 900;
          line-height: 1.15;
          margin: 0;
          letter-spacing: -0.03em;
        }

        .jp-hero-gradient {
          background: linear-gradient(135deg, #ffffff 30%, #94a3b8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .jp-hero-subtitle {
          font-size: 14px;
          color: #94a3b8;
          max-width: 620px;
          margin: 0;
          line-height: 1.5;
        }

        .jp-hero-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 14px;
          width: 100%;
          max-width: 600px;
        }

        .jp-hero-stat-card {
          background: rgba(17, 20, 28, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .jp-stat-num {
          font-size: 18px;
          font-weight: 900;
          color: #ffffff;
        }

        .jp-stat-lbl {
          font-size: 9px;
          color: #64748b;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        /* Controls */
        .jp-lobby-controls {
          padding: 24px 24px 16px;
          max-width: 1240px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .jp-categories-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
        }

        .jp-cat-btn {
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

        .jp-cat-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .jp-cat-btn.active {
          background: #ef4444;
          border-color: #ef4444;
          color: #ffffff;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
        }

        .jp-search-box {
          position: relative;
          min-width: 280px;
        }

        .jp-search-input {
          width: 100%;
          background: #0f121a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 9px 16px;
          font-size: 12px;
          color: #ffffff;
          outline: none;
          box-sizing: border-box;
        }

        .jp-search-input:focus {
          border-color: #ef4444;
        }

        .jp-search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 12px;
        }

        /* Grid Section */
        .jp-games-grid-section {
          flex: 1;
          padding: 10px 24px 48px;
          max-width: 1240px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .jp-games-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .jp-game-card {
          background: #0f131c;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .jp-game-card:hover {
          transform: translateY(-3px);
          border-color: var(--card-accent, #ef4444);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.1);
        }

        .jp-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .jp-card-icon-container {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          border: 1px solid;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-card-badge-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .jp-badge {
          font-size: 9.5px;
          font-weight: 900;
          padding: 3px 8px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .jp-badge-hot {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid #ef4444;
          color: #f87171;
        }

        .jp-badge-blue {
          background: rgba(56, 189, 248, 0.2);
          border: 1px solid #38bdf8;
          color: #38bdf8;
        }

        .jp-badge-green {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid #22c55e;
          color: #4ade80;
        }

        .jp-badge-purple {
          background: rgba(168, 85, 247, 0.2);
          border: 1px solid #a855f7;
          color: #c084fc;
        }

        .jp-badge-gold {
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid #f59e0b;
          color: #fbbf24;
        }

        .jp-badge-amber {
          background: rgba(234, 179, 8, 0.2);
          border: 1px solid #eab308;
          color: #fde047;
        }

        .jp-badge-rose {
          background: rgba(236, 72, 153, 0.2);
          border: 1px solid #ec4899;
          color: #f472b6;
        }

        .jp-badge-red {
          background: rgba(244, 63, 94, 0.2);
          border: 1px solid #f43f5e;
          color: #fb7185;
        }

        .jp-badge-live {
          background: rgba(34, 197, 94, 0.18);
          border: 1px solid #22c55e;
          color: #22c55e;
        }

        .jp-card-body {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .jp-card-title {
          font-size: 17px;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
        }

        .jp-card-cat {
          font-size: 10px;
          color: #64748b;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .jp-card-description {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 6px 0 0;
          min-height: 34px;
        }

        .jp-card-features {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .jp-feature-tag {
          font-size: 9.5px;
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 7px;
          border-radius: 4px;
          font-weight: 700;
        }

        .jp-card-specs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          background: rgba(0, 0, 0, 0.4);
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.03);
        }

        .jp-spec-cell {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .jp-spec-lbl {
          font-size: 8px;
          color: #64748b;
          font-weight: 800;
          text-transform: uppercase;
        }

        .jp-spec-val {
          font-size: 12px;
          font-weight: 900;
        }

        .jp-card-footer {
          margin-top: 4px;
        }

        .jp-play-btn {
          width: 100%;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 4px 16px rgba(239, 68, 68, 0.35);
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-sizing: border-box;
          transition: filter 0.15s ease;
        }

        .jp-play-btn:hover {
          filter: brightness(1.15);
        }

        .jp-preview-btn {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 10px 14px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .jp-preview-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        /* Footer */
        .jp-lobby-footer {
          background: #090b10;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding: 24px;
        }

        .jp-footer-inner {
          max-width: 1240px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }

        .jp-footer-bclb {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          max-width: 600px;
        }

        .jp-footer-bclb strong {
          font-size: 12px;
          color: #e2e8f0;
        }

        .jp-footer-bclb p {
          margin: 4px 0 0;
          font-size: 10.5px;
          color: #64748b;
          line-height: 1.4;
        }

        .jp-footer-links {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .jp-footer-links a {
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
        }

        .jp-footer-links a:hover {
          color: #ffffff;
        }

        /* Modal */
        .jp-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }

        .jp-modal-box {
          background: #0f1420;
          border: 1px solid #22c55e;
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          width: 100%;
          position: relative;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
        }

        .jp-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 16px;
          cursor: pointer;
        }

        .jp-modal-title {
          margin: 0 0 16px;
          color: #22c55e;
          font-size: 18px;
          font-weight: 900;
        }

        .jp-field {
          margin-bottom: 12px;
        }

        .jp-field label {
          display: block;
          font-size: 9.5px;
          color: #94a3b8;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .jp-input {
          width: 100%;
          padding: 10px 12px;
          background: #060910;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }

        .jp-input:focus {
          border-color: #22c55e;
        }

        .jp-modal-submit-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          border-radius: 9px;
          color: #ffffff;
          font-weight: 900;
          font-size: 12.5px;
          cursor: pointer;
          margin-top: 8px;
        }

        @keyframes jpFadeIn {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        @media (max-width: 768px) {
          .jp-hero-title { font-size: 26px; }
          .jp-hero-stats { grid-template-columns: 1fr; }
          .jp-lobby-controls { flex-direction: column; align-items: stretch; }
          .jp-search-box { width: 100%; }
        }
      `}</style>
    </div>
  );
}
