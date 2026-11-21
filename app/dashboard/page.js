'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth/client';
import confetti from 'canvas-confetti';
import { generateDynamicLobbyChat } from '../../lib/chatEngine';
import { getRandomPlayerPersona, getPersonaBySeed } from '../../lib/playerSeeds';
import { SPRIBE_PLANE_DATA_URL } from '../../lib/planeAsset';

const MIN_WAGER = 10;
const HISTORY_STORAGE_KEY = 'jetpesa_real_previous_rounds';

/* -------------------------------------------------------------------------- */
/*  Icon System                                                               */
/* -------------------------------------------------------------------------- */
function Icon({ name, size = 18, className = '', style = {} }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    style,
    'aria-hidden': true,
  };

  switch (name) {
    case 'jet':
      return <svg {...props}><path d="M17.8 16.8 21 21l-4.2-3.2" /><path d="M2.5 13.5 21 3l-8.5 18-2.7-7.3-7.3-2.7Z" /></svg>;
    case 'volume-x':
      return <svg {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>;
    case 'volume-2':
      return <svg {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>;
    case 'cloud-rain':
      return <svg {...props}><line x1="16" y1="13" x2="16" y2="21" /><line x1="8" y1="13" x2="8" y2="21" /><line x1="12" y1="15" x2="12" y2="23" /><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" /></svg>;
    case 'user':
      return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case 'shield-check':
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'bar-chart-3':
      return <svg {...props}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>;
    case 'rocket':
      return <svg {...props}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>;
    case 'message-square':
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'send':
      return <svg {...props}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
    case 'x-circle':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
    case 'check-circle':
      return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
    case 'alert-triangle':
      return <svg {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'wallet':
      return <svg {...props}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>;
    case 'refresh-cw':
      return <svg {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>;
    case 'plus':
      return <svg {...props}><path d="M5 12h14" /><path d="M12 5v14" /></svg>;
    case 'minus':
      return <svg {...props}><path d="M5 12h14" /></svg>;
    case 'plus-circle':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>;
    case 'minus-circle':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>;
    case 'x':
      return <svg {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
    case 'check':
      return <svg {...props}><path d="M20 6 9 17l-5-5" /></svg>;
    case 'copy':
      return <svg {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>;
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  User Avatar with Thematic Category Glyph & Accent                         */
/* -------------------------------------------------------------------------- */
function UserAvatar({ seed, size = 28 }) {
  const persona = getPersonaBySeed(seed);
  const bgColor = persona?.color || '#3b82f6';
  const Glyph = persona?.icon;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `${bgColor}20`,
        border: `1.5px solid ${bgColor}60`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: bgColor,
        flexShrink: 0,
      }}
      title={persona?.label || 'Pilot'}
    >
      {Glyph ? Glyph(Math.round(size * 0.58)) : <Icon name="user" size={Math.round(size * 0.52)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */
export default function UltimateJetPesaCockpit() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0.0);
  const [phoneProfile, setPhoneProfile] = useState('');
  const [profileName, setProfileName] = useState('');
  const [userIdCode, setUserIdCode] = useState('');
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editName, setEditName] = useState('');
  const [rememberPhone, setRememberPhone] = useState(true);

  const [myBetsHistory, setMyBetsHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isProvablyModalOpen, setIsProvablyModalOpen] = useState(false);
  const [isRainActive, setIsRainActive] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [mobileActivePanel, setMobileActivePanel] = useState('game');

  const [toasts, setToasts] = useState([]);
  const [inputPhone, setInputPhone] = useState('');
  const [inputAmount, setInputAmount] = useState('100');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [loadingWithdraw, setLoadingWithdraw] = useState(false);

  const [deckA, setDeckA] = useState({
    wager: 10,
    isAuto: false,
    isAutoBet: false,
    isAutoCash: false,
    cashVal: 2.55,
    hasBetNext: false,
    hasBetCurrent: false,
    currentBetId: null,
  });

  const [deckB, setDeckB] = useState({
    wager: 10,
    isAuto: false,
    isAutoBet: false,
    isAutoCash: false,
    cashVal: 5.50,
    hasBetNext: false,
    hasBetCurrent: false,
    currentBetId: null,
  });

  const [multiplier, setMultiplier] = useState(1.0);
  const [gameStatus, setGameStatus] = useState('idle');
  const [countdownProgress, setCountdownProgress] = useState(100);
  const [countdownSeconds, setCountdownSeconds] = useState('5.0');
  const progressFillRef = useRef(null);
  const countdownTextRef = useRef(null);
  const gameStatusRef = useRef('idle');
  const lastThrottleTimeRef = useRef(0);
  const [historyTape, setHistoryTape] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        setHistoryTape(saved.map(Number).filter((n) => n && n < 900).slice(0, 14));
      }
    } catch {
      // ignore
    }
  }, []);

  const [activePlayersCount, setActivePlayersCount] = useState(24);
  const [lobbyOnlineCount, setLobbyOnlineCount] = useState(3412);
  const lobbyOnlineCountRef = useRef(3412);
  const [liveBetsFeed, setLiveBetsFeed] = useState([]);

  useEffect(() => {
    const getBaseLobbyCount = () => {
      const hr = new Date().getHours();
      // Peak hours (18:00 - 23:30): 3,800 to 5,200
      if (hr >= 18 && hr <= 23) return 3800 + Math.floor(Math.random() * 1400);
      // Daytime (11:00 - 18:00): 2,600 to 3,600
      if (hr >= 11 && hr < 18) return 2600 + Math.floor(Math.random() * 1000);
      // Morning (07:00 - 11:00): 1,800 to 2,600
      if (hr >= 7 && hr < 11) return 1800 + Math.floor(Math.random() * 800);
      // Late night: 1,100 to 1,700
      return 1100 + Math.floor(Math.random() * 600);
    };

    const initial = getBaseLobbyCount();
    lobbyOnlineCountRef.current = initial;
    setLobbyOnlineCount(initial);

    const interval = setInterval(() => {
      setLobbyOnlineCount((prev) => {
        const delta = Math.floor(Math.random() * 25) - 12;
        const next = Math.max(1100, Math.min(6500, prev + delta));
        lobbyOnlineCountRef.current = next;
        return next;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const displayActivePlayers = useMemo(() => {
    let count = activePlayersCount;
    if (deckA.hasBetCurrent) count += 1;
    if (deckB.hasBetCurrent) count += 1;
    return count;
  }, [activePlayersCount, deckA.hasBetCurrent, deckB.hasBetCurrent]);

  const totalLivePlaced = useMemo(() => {
    let sum = liveBetsFeed.reduce((acc, b) => acc + (Number(b.bet) || 0), 0);
    if (deckA.hasBetCurrent) sum += Number(deckA.wager) || 0;
    if (deckB.hasBetCurrent) sum += Number(deckB.wager) || 0;
    return sum;
  }, [liveBetsFeed, deckA.hasBetCurrent, deckA.wager, deckB.hasBetCurrent, deckB.wager]);

  const totalLiveWon = useMemo(() => {
    return liveBetsFeed.reduce((acc, b) => {
      if (b.status === 'cashed') {
        const payout = Number(b.payout) || Math.floor((Number(b.bet) || 0) * (Number(b.mult) || 1));
        return acc + payout;
      }
      return acc;
    }, 0);
  }, [liveBetsFeed]);
  const [chatInput, setChatInput] = useState('');
  const [chatLogs, setChatLogs] = useState([
    { user: 'Turbo071***45', seed: 'turbo', msg: 'Admin, background rain drop claim active? 🙏', time: '17:50' },
    { user: 'Diamond072***89', seed: 'diamond', msg: 'Leo tunakula rocket safi sana hapa JetPesa! 💎', time: '17:52' },
    { user: 'Pilot079***12', seed: 'pilot', msg: 'Nimecash out 2.4x safi, ready for next takeoff!', time: '17:53' },
    { user: 'Shujaa011***90', seed: 'shujaa', msg: 'Watu wangu tuko locked in! Faida imeingia M-Pesa.', time: '17:55' },
  ]);

  const [provablyData, setProvablyData] = useState(null);
  const [provablyLoading, setProvablyLoading] = useState(false);

  const canvasRef = useRef(null);
  const centerPanelRef = useRef(null);
  const liveSectionRef = useRef(null);
  const animationId = useRef(null);
  const chatEndRef = useRef(null);
  const audioCtxRef = useRef(null);
  const planeImageRef = useRef(null);
  const lastCycleRef = useRef(null);
  const cycleCrashedRef = useRef(false);
  const crashTimestampRef = useRef(0);
  const recordedCrashCycleRef = useRef(null);
  const betNonceRef = useRef(1);
  const lastStateCheckRef = useRef(0);
  const queuedBetPendingRef = useRef({ A: false, B: false });
  const payoutPendingRef = useRef({ A: false, B: false });
  const placedRoundForDeckRef = useRef({ A: null, B: null });
  const roundPoolBetsRef = useRef([]);
  const liveBetsFeedRef = useRef([]);
  const lastBetFeedUpdateRef = useRef(0);

  const currentRoundRef = useRef({
    nonce: 1,
    crashPoint: 2.0,
    serverSeedHash: '',
    roundHash: '',
    clientSeed: '',
    algorithm: '',
    verifyInput: '',
    serverSeed: '',
    houseEdge: 0.01,
  });

  const activeRoundTimingRef = useRef({
    cycleIndex: 0,
    startEpoch: 0,
    departureEpoch: 0,
    crashEpoch: 0,
    endEpoch: 0,
    crashPoint: 2.0,
    flightDurationMs: 10460,
    durationMs: 18460,
  });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      planeImageRef.current = img;
    };
    img.src = SPRIBE_PLANE_DATA_URL || '/spribe_plane.png';
    planeImageRef.current = img;
  }, []);

  const triggerToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const playSynthesizedTone = useCallback((freq, type, duration, volume = 0.03) => {
    if (audioMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // silent
    }
  }, [audioMuted]);

  const generateFreshLiveBets = useCallback((roundCrashPoint = null) => {
    const px = ['070***', '071***', '072***', '079***', '011***', '074***', '010***', '075***', '076***', '078***'];
    // Dynamically derive active round wagers from active lobby traffic (~25% to 75.0% participation rate)
    const currentLobby = lobbyOnlineCountRef.current || 3200;
    const participationRate = 0.25 + Math.random() * 0.50;
    const count = Math.max(100, Math.floor(currentLobby * participationRate));
    const bets = [];

    const effectiveCrash = Number(
      roundCrashPoint ||
      activeRoundTimingRef.current.crashPoint ||
      currentRoundRef.current.crashPoint ||
      2.0
    );

    // Realistic Kenyan market staking distribution (clean denominations matching actual mobile betting):
    const generateMarketStake = () => {
      const r = Math.random();
      if (r < 0.60) {
        // 60% casual / micro stakes (KES 10 - KES 100)
        const opts = [10, 10, 20, 20, 20, 30, 40, 50, 50, 50, 70, 80, 100, 100, 100, 100];
        return opts[Math.floor(Math.random() * opts.length)];
      } else if (r < 0.86) {
        // 26% standard everyday stakes (KES 120 - KES 500)
        const opts = [120, 150, 150, 200, 200, 200, 250, 300, 350, 400, 500, 500];
        return opts[Math.floor(Math.random() * opts.length)];
      } else if (r < 0.96) {
        // 10% mid-tier wagers (KES 600 - KES 1,500)
        const opts = [600, 750, 800, 1000, 1000, 1200, 1500];
        return opts[Math.floor(Math.random() * opts.length)];
      } else {
        // 4% high roller wagers (KES 2,000 - KES 5,000)
        const opts = [2000, 2500, 3000, 5000];
        return opts[Math.floor(Math.random() * opts.length)];
      }
    };

    for (let i = 0; i < count; i++) {
      const id = Math.random().toString(36).substring(2, 8);
      const stake = generateMarketStake();

      // Standard safe percentage bracket cashout distribution:
      // High cashout rate from start (1.05x - 1.65x) that naturally reduces upwards in brackets.
      // This ensures real players cannot visually deduce whether the flight will crash early or fly high!
      const generateTargetMultiplier = () => {
        // ~12% of pilots hold out for moonshots or play manual greed exceeding high crash points
        if (effectiveCrash > 1.20 && Math.random() < 0.12) {
          return parseFloat((effectiveCrash * (1.10 + Math.random() * 1.90)).toFixed(2));
        }

        const r = Math.random();
        if (r < 0.38) {
          // Bracket 1: 1.05x - 1.25x (38% of players - rapid cashout rush right off the ground)
          return parseFloat((1.05 + Math.random() * 0.20).toFixed(2));
        } else if (r < 0.64) {
          // Bracket 2: 1.26x - 1.65x (26% of players - strong conservative second wave)
          return parseFloat((1.26 + Math.random() * 0.39).toFixed(2));
        } else if (r < 0.80) {
          // Bracket 3: 1.66x - 2.40x (16% of players - classic 2x doubling range)
          return parseFloat((1.66 + Math.random() * 0.74).toFixed(2));
        } else if (r < 0.89) {
          // Bracket 4: 2.41x - 4.00x (9% of players - medium risk tier)
          return parseFloat((2.41 + Math.random() * 1.59).toFixed(2));
        } else if (r < 0.94) {
          // Bracket 5: 4.01x - 8.00x (5% of players - high ambition tier)
          return parseFloat((4.01 + Math.random() * 3.99).toFixed(2));
        } else if (r < 0.975) {
          // Bracket 6: 8.01x - 20.00x (3.5% of players - long-haul tier)
          return parseFloat((8.01 + Math.random() * 11.99).toFixed(2));
        } else {
          // Bracket 7: 20.01x - 100.00x+ (2.5% of players - extreme moonshot tier)
          return parseFloat((20.01 + Math.random() * 79.99).toFixed(2));
        }
      };

      const target = generateTargetMultiplier();

      // Stagger joinedAtMs across the 5000ms countdown:
      // ~18% are placed early at the beginning of the countdown (0 - 350ms)
      // ~82% arrive dynamically between 350ms and 4750ms
      const joinedAtMs = Math.random() < 0.18
        ? Math.floor(Math.random() * 350)
        : Math.floor(Math.random() * 4400 + 350);

      const persona = getRandomPlayerPersona();

      bets.push({
        id: `bet-${Date.now()}-${i}-${id}`,
        seed: persona.seed,
        category: persona.category,
        username: persona.username,
        color: persona.color,
        bet: stake,
        cashoutTarget: target,
        mult: target,
        payout: 0,
        status: 'queued',
        joinedAtMs,
        willCashOut: target <= effectiveCrash,
      });
    }

    // Natural table ordering by bet placement time during countdown
    bets.sort((a, b) => a.joinedAtMs - b.joinedAtMs);
    return bets;
  }, []);

  const startFreshLiveBetsFeed = useCallback((initialOffsetMs = 0, customCrash = null) => {
    const effectiveCrash = Number(
      customCrash ||
      activeRoundTimingRef.current.crashPoint ||
      currentRoundRef.current.crashPoint ||
      2.0
    );
    const bets = generateFreshLiveBets(effectiveCrash);
    roundPoolBetsRef.current = bets;
    const visible = bets.filter((b) => b.joinedAtMs <= initialOffsetMs);
    liveBetsFeedRef.current = visible;
    setLiveBetsFeed(visible);
    setActivePlayersCount(visible.length);
  }, [generateFreshLiveBets]);

  const updateLiveBetStatuses = useCallback((currentMultiplier, effectiveCrash = 100) => {
    setLiveBetsFeed((prev) => {
      let changed = false;
      const next = prev.map((b) => {
        // If already cashed or lost, keep state
        if (b.status === 'cashed' || b.status === 'lost') return b;

        // Dynamically cash out in real-time as flight reaches pilot's target
        if (currentMultiplier >= b.cashoutTarget && b.cashoutTarget <= effectiveCrash) {
          changed = true;
          return {
            ...b,
            status: 'cashed',
            payout: Math.floor(b.bet * b.cashoutTarget),
            mult: b.cashoutTarget,
          };
        }

        // Active in flight before reaching cashout target
        if (b.status !== 'flying') {
          changed = true;
          return { ...b, status: 'flying' };
        }

        return b;
      });

      if (changed) {
        liveBetsFeedRef.current = next;
      }
      return changed ? next : prev;
    });
  }, []);

  const markLiveBetsCrashed = useCallback(() => {
    setLiveBetsFeed((prev) => {
      const next = prev.map((b) => (b.status === 'cashed' ? b : { ...b, status: 'lost' }));
      liveBetsFeedRef.current = next;
      return next;
    });
  }, []);

  const sha256Hex = async (input) => {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const hmacSha256Hex = async (key, message) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const deriveCrashPointFromHash = (hash, houseEdge = 0.01) => {
    const h = parseInt(hash.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    if (h % 33 === 0) return 1.0;
    const raw = (100 * e - h) / (e - h);
    const edged = raw * (1 - houseEdge);
    return Math.min(10000.0, Math.max(1, Math.floor(edged) / 100));
  };

  const calculateMultiplierAtSeconds = (activeSeconds) => {
    if (activeSeconds <= 0) return 1.0;
    // Continuous exponential curve: M(t) = exp(0.060*t + 0.0006*t^2)
    // Allows completely natural, smooth flight simulation across both low and high crash ranges
    const exponent = 0.060 * activeSeconds + 0.0006 * Math.pow(activeSeconds, 2);
    const mult = Math.exp(exponent);
    return parseFloat(mult.toFixed(2));
  };

  const generateLocalProvablyRound = useCallback(async (nonce) => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const serverSeed = [...randomBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const clientSeed = `${user?.uid || 'guest'}:${nonce}:jetpesa`;
    const verifyInput = `${clientSeed}:${nonce}`;
    const roundHash = await hmacSha256Hex(serverSeed, verifyInput);
    const serverSeedHash = await sha256Hex(serverSeed);
    const crashPoint = deriveCrashPointFromHash(roundHash, 0.01);
    return {
      nonce, crashPoint, serverSeedHash, serverSeed, roundHash,
      clientSeed, verifyInput, houseEdge: 0.01,
      algorithm: 'HMAC_SHA256(serverSeed, clientSeed:nonce), SHA256 serverSeed commitment',
    };
  }, [user?.uid]);

  const persistCrashToHistory = useCallback((crashPoint, cycleIndex) => {
    if (recordedCrashCycleRef.current === cycleIndex) return;
    recordedCrashCycleRef.current = cycleIndex;
    const cleanCrash = Number(Number(crashPoint).toFixed(2));
    setHistoryTape((prev) => {
      const next = [cleanCrash, ...prev].slice(0, 14);
      if (typeof window !== 'undefined') {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const fetchRoundState = useCallback(async () => {
    try {
      const res = await fetch('/api/game/round-state', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        currentRoundRef.current = {
          ...currentRoundRef.current,
          nonce: data.cycleIndex,
          crashPoint: Number(data.crashPoint || 2.0),
          serverSeedHash: data.serverSeedHash || currentRoundRef.current.serverSeedHash,
        };
        activeRoundTimingRef.current = {
          cycleIndex: data.cycleIndex,
          startEpoch: data.startEpoch,
          departureEpoch: data.departureEpoch,
          crashEpoch: data.crashEpoch,
          endEpoch: data.endEpoch,
          crashPoint: Number(data.crashPoint || 2.0),
          flightDurationMs: data.flightDurationMs,
          durationMs: data.durationMs,
        };
      }
    } catch (err) {
      console.warn('Failed to sync round state:', err);
    }
  }, []);

  const fetchProvablyRound = useCallback(async (nonce, openModal = false) => {
    try {
      if (openModal) setProvablyLoading(true);
      const res = await fetch(`/api/game/provably?nonce=${nonce}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not load provably fair round.');
      currentRoundRef.current = {
        nonce: data.nonce,
        crashPoint: data.crashPoint ? Number(data.crashPoint) : (currentRoundRef.current.crashPoint || 2.0),
        serverSeedHash: data.serverSeedHash,
        roundHash: data.roundHash || 'Cryptographically sealed during flight',
        clientSeed: data.clientSeed,
        algorithm: data.algorithm || 'HMAC_SHA256',
        verifyInput: data.verifyInput || 'Sealed',
        serverSeed: data.serverSeed || 'Revealed after flight ends',
        houseEdge: Number(data.houseEdge ?? 0.03),
        status: data.status,
      };
      setProvablyData(currentRoundRef.current);
      if (openModal) setIsProvablyModalOpen(true);
      return currentRoundRef.current;
    } catch (e) {
      const fallbackRound = await generateLocalProvablyRound(nonce);
      currentRoundRef.current = fallbackRound;
      setProvablyData(fallbackRound);
      if (openModal) setIsProvablyModalOpen(true);
      triggerToast('Server fair API unavailable. Using local cryptographic fallback.', 'info');
      return fallbackRound;
    } finally {
      if (openModal) setProvablyLoading(false);
    }
  }, [triggerToast, generateLocalProvablyRound]);

  const openProvablyModal = async () => {
    await fetchProvablyRound(currentRoundRef.current.nonce, true);
  };

  const refreshUserData = async () => {
    try {
      const res = await fetch('/api/user/profile');
      if (res.ok) {
        const data = await res.json();
        const profile = data.user || data;
        if (profile) {
          if (profile.walletBalance !== undefined) {
            setBalance(Number(profile.walletBalance || 0.0));
          }
          if (profile.userIdCode) {
            setUserIdCode(profile.userIdCode);
          }
          if (profile.displayName) {
            setProfileName(profile.displayName);
            setEditName((p) => p || profile.displayName);
          }
          if (profile.phone) {
            setPhoneProfile(profile.phone);
            setInputPhone((p) => p || profile.phone);
            setEditPhone((p) => p || profile.phone);
            setWithdrawPhone((p) => p || profile.phone);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing user profile:', err);
    }
  };

  const fetchMyBetsHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/user/bets?limit=10');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.bets)) {
          setMyBetsHistory(data.bets);
        }
      }
    } catch (err) {
      console.warn('Error fetching my bets history:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'mine') {
      fetchMyBetsHistory();
      const iv = setInterval(fetchMyBetsHistory, 3000);
      return () => clearInterval(iv);
    }
  }, [activeTab, fetchMyBetsHistory]);

  useEffect(() => {
    const savedPhone = localStorage.getItem('jetpesa_saved_phone');
    if (savedPhone) {
      setInputPhone(savedPhone);
      setPhoneProfile(savedPhone);
      setEditPhone(savedPhone);
      setWithdrawPhone(savedPhone);
    }

    let isMounted = true;
    let pollInterval = null;

    const checkSessionAndSync = async () => {
      try {
        const { data: session } = await authClient.getSession();
        if (!session?.user) {
          router.push('/auth');
          return;
        }

        const currUser = {
          ...session.user,
          uid: session.user.id,
        };
        if (isMounted) setUser(currUser);

        // Fetch initial profile & balance from Postgres
        await refreshUserData();
        await fetchMyBetsHistory();

        // Keep balance synchronized with server-side transactions & deposits
        pollInterval = setInterval(() => {
          if (isMounted) refreshUserData();
        }, 3000);
      } catch (err) {
        console.error('Session check failed:', err);
        router.push('/auth');
      }
    };

    checkSessionAndSync();
    fetchRoundState();
    startFreshLiveBetsFeed(1500);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  const gameContextRef = useRef({ multiplier: 1.0, gameStatus: 'idle', crashPoint: 2.0 });

  useEffect(() => {
    gameContextRef.current = {
      multiplier,
      gameStatus,
      crashPoint: activeRoundTimingRef.current?.crashPoint || 2.0,
    };
  }, [multiplier, gameStatus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  useEffect(() => {
    let timer = null;

    const scheduleNextChat = () => {
      // Natural human typing cadence between 4.5s and 8.5s
      const delay = Math.floor(Math.random() * 4000 + 4500);
      timer = setTimeout(() => {
        const ctx = gameContextRef.current;
        const newMsg = generateDynamicLobbyChat({
          currentMultiplier: ctx.multiplier,
          isBettingPhase: ctx.gameStatus === 'idle',
          hasCrashed: ctx.gameStatus === 'crashed',
          crashPoint: ctx.crashPoint,
        });

        setChatLogs((prev) => [...prev.slice(-35), newMsg]);
        scheduleNextChat();
      }, delay);
    };

    scheduleNextChat();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    function runDistributedClockLoop() {
      const epochTimeMs = Date.now();
      const countdownInterval = 5000;
      let timing = activeRoundTimingRef.current;

      // Ensure timing is initialized from server or derived anchor
      const needsSync = !timing.departureEpoch || epochTimeMs >= timing.endEpoch;
      if (needsSync || (epochTimeMs - lastStateCheckRef.current > 1200)) {
        if (epochTimeMs - lastStateCheckRef.current > 600) {
          lastStateCheckRef.current = epochTimeMs;
          fetchRoundState();
          timing = activeRoundTimingRef.current;
        }
      }

      const cycleIndex = timing.cycleIndex || currentRoundRef.current.nonce || 0;
      const effectiveCrash = timing.crashPoint || currentRoundRef.current.crashPoint || 2.0;

      // Handle round transition to fresh cycle
      if (lastCycleRef.current !== cycleIndex && cycleIndex > 0) {
        lastCycleRef.current = cycleIndex;
        cycleCrashedRef.current = false;
        crashTimestampRef.current = 0;
        queuedBetPendingRef.current = { A: false, B: false };
        payoutPendingRef.current = { A: false, B: false };
        placedRoundForDeckRef.current = { A: null, B: null };
        const elapsedCountdown = timing.startEpoch ? Math.max(0, epochTimeMs - timing.startEpoch) : 0;
        startFreshLiveBetsFeed(elapsedCountdown, effectiveCrash);
      }

      const isBettingPhase = timing.departureEpoch ? epochTimeMs < timing.departureEpoch : true;
      const isPastCrash = timing.crashEpoch ? epochTimeMs >= timing.crashEpoch : false;

      let secondsInAir = 0;
      let isFlightActive = false;

      if (isBettingPhase) {
        cycleCrashedRef.current = false;
        if (gameStatusRef.current !== 'idle') {
          gameStatusRef.current = 'idle';
          setGameStatus('idle');
          setMultiplier(1.0);
          playSynthesizedTone(440, 'triangle', 0.05, 0.03);
        }

        const remainingMs = timing.departureEpoch
          ? Math.max(0, timing.departureEpoch - epochTimeMs)
          : Math.max(0, countdownInterval - (epochTimeMs % countdownInterval));
        const remSecStr = (remainingMs / 1000).toFixed(1);
        const progressPct = Math.max(0, Math.min(100, (remainingMs / countdownInterval) * 100));

        const elapsedInCountdown = countdownInterval - remainingMs;
        if (roundPoolBetsRef.current.length > 0) {
          if (epochTimeMs - lastBetFeedUpdateRef.current > 45 || remainingMs < 80) {
            const visible = roundPoolBetsRef.current.filter((b) => b.joinedAtMs <= elapsedInCountdown);
            if (visible.length !== liveBetsFeedRef.current.length) {
              lastBetFeedUpdateRef.current = epochTimeMs;
              liveBetsFeedRef.current = visible;
              setLiveBetsFeed(visible);
              setActivePlayersCount(visible.length);
            }
          }
        }

        // Butter-smooth 60fps direct DOM updates
        if (progressFillRef.current) {
          progressFillRef.current.style.width = `${progressPct}%`;
        }
        if (countdownTextRef.current) {
          countdownTextRef.current.textContent = `${remSecStr}s`;
        }
        if (epochTimeMs - lastThrottleTimeRef.current > 75) {
          lastThrottleTimeRef.current = epochTimeMs;
          setCountdownSeconds(remSecStr);
          setCountdownProgress(progressPct);
        }

        if (remainingMs % 1000 < 20) playSynthesizedTone(320, 'sine', 0.03, 0.02);

        // Auto Bet automated queueing
        if (deckA.isAutoBet && !deckA.hasBetCurrent && !deckA.hasBetNext) {
          if (balance >= deckA.wager) {
            setDeckA((p) => ({ ...p, hasBetNext: true }));
          } else {
            setDeckA((p) => ({ ...p, isAutoBet: false, hasBetNext: false }));
            triggerToast('Deck A: Auto Bet stopped - insufficient wallet balance.', 'error');
          }
        }
        if (deckB.isAutoBet && !deckB.hasBetCurrent && !deckB.hasBetNext) {
          if (balance >= deckB.wager) {
            setDeckB((p) => ({ ...p, hasBetNext: true }));
          } else {
            setDeckB((p) => ({ ...p, isAutoBet: false, hasBetNext: false }));
            triggerToast('Deck B: Auto Bet stopped - insufficient wallet balance.', 'error');
          }
        }

        if (deckA.hasBetNext && !deckA.hasBetCurrent && !queuedBetPendingRef.current.A && placedRoundForDeckRef.current.A !== cycleIndex) {
          queuedBetPendingRef.current.A = true;
          placedRoundForDeckRef.current.A = cycleIndex;
          placeQueuedBet('A', deckA);
        }
        if (deckB.hasBetNext && !deckB.hasBetCurrent && !queuedBetPendingRef.current.B && placedRoundForDeckRef.current.B !== cycleIndex) {
          queuedBetPendingRef.current.B = true;
          placedRoundForDeckRef.current.B = cycleIndex;
          placeQueuedBet('B', deckB);
        }
      } else if (!isPastCrash && !cycleCrashedRef.current) {
        // FLIGHT IN PROGRESS
        isFlightActive = true;
        secondsInAir = Math.max(0, (epochTimeMs - (timing.departureEpoch || (epochTimeMs - 100))) / 1000);

        if (roundPoolBetsRef.current.length > 0 && liveBetsFeedRef.current.length !== roundPoolBetsRef.current.length) {
          liveBetsFeedRef.current = roundPoolBetsRef.current;
          setLiveBetsFeed(roundPoolBetsRef.current);
          setActivePlayersCount(roundPoolBetsRef.current.length);
        }

        const computedMultiplier = calculateMultiplierAtSeconds(secondsInAir);

        if (computedMultiplier >= effectiveCrash) {
          cycleCrashedRef.current = true;
          crashTimestampRef.current = epochTimeMs;
          if (gameStatusRef.current !== 'crashed') {
            gameStatusRef.current = 'crashed';
            setGameStatus('crashed');
            setMultiplier(effectiveCrash);
            updateLiveBetStatuses(effectiveCrash, effectiveCrash);
            markLiveBetsCrashed();
            persistCrashToHistory(effectiveCrash, cycleIndex);
            setDeckA((p) => {
              const stillAuto = p.isAutoBet && balance >= p.wager;
              return { ...p, hasBetCurrent: false, currentBetId: null, isAutoBet: stillAuto, hasBetNext: stillAuto };
            });
            setDeckB((p) => {
              const stillAuto = p.isAutoBet && balance >= p.wager;
              return { ...p, hasBetCurrent: false, currentBetId: null, isAutoBet: stillAuto, hasBetNext: stillAuto };
            });
            fetchMyBetsHistory();
          }
        } else {
          if (gameStatusRef.current !== 'running') {
            gameStatusRef.current = 'running';
            setGameStatus('running');
          }
          setMultiplier(computedMultiplier);
          updateLiveBetStatuses(computedMultiplier, effectiveCrash);
          if (epochTimeMs % 300 < 20) playSynthesizedTone(200 + computedMultiplier * 15, 'sine', 0.015, 0.012);

          if (deckA.hasBetCurrent && deckA.isAutoCash && computedMultiplier >= parseFloat(deckA.cashVal) && !payoutPendingRef.current.A) {
            payoutPendingRef.current.A = true;
            triggerPayoutSequence('A', computedMultiplier, deckA);
            setDeckA((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          }
          if (deckB.hasBetCurrent && deckB.isAutoCash && computedMultiplier >= parseFloat(deckB.cashVal) && !payoutPendingRef.current.B) {
            payoutPendingRef.current.B = true;
            triggerPayoutSequence('B', computedMultiplier, deckB);
            setDeckB((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          }
        }
      } else {
        // POST-CRASH PAUSE (before next round)
        isFlightActive = true;
        secondsInAir = timing.flightDurationMs ? timing.flightDurationMs / 1000 : 0;
        cycleCrashedRef.current = true;
        if (!crashTimestampRef.current) crashTimestampRef.current = timing.crashEpoch || epochTimeMs;

        if (gameStatusRef.current !== 'crashed') {
          gameStatusRef.current = 'crashed';
          setGameStatus('crashed');
            setMultiplier(effectiveCrash);
            updateLiveBetStatuses(effectiveCrash, effectiveCrash);
            markLiveBetsCrashed();
            persistCrashToHistory(effectiveCrash, cycleIndex);
            setDeckA((p) => {
              const stillAuto = p.isAutoBet && balance >= p.wager;
              return { ...p, hasBetCurrent: false, currentBetId: null, isAutoBet: stillAuto, hasBetNext: stillAuto };
            });
            setDeckB((p) => {
              const stillAuto = p.isAutoBet && balance >= p.wager;
              return { ...p, hasBetCurrent: false, currentBetId: null, isAutoBet: stillAuto, hasBetNext: stillAuto };
            });
            fetchMyBetsHistory();
        }
      }

      renderRadarCanvas(secondsInAir, isFlightActive);
      animationId.current = requestAnimationFrame(runDistributedClockLoop);
    }

    animationId.current = requestAnimationFrame(runDistributedClockLoop);
    return () => cancelAnimationFrame(animationId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckA, deckB, balance, audioMuted, isRainActive]);

  /* ---------------------------------------------------------------------- */
  /*  TRULY RESPONSIVE CANVAS — reads actual container dimensions            */
  /* ---------------------------------------------------------------------- */
  const drawRain = (ctx, W, H, secondsInAir) => {
    if (!isRainActive) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.34)';
    ctx.lineWidth = W < 500 ? 1 : 1.4;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(56,189,248,0.45)';
    const drops = W < 500 ? 40 : 80;
    for (let i = 0; i < drops; i++) {
      const x = ((i * 71 + secondsInAir * 360) % (W + 120)) - 80;
      const y = ((i * 47 + secondsInAir * 620) % (H + 140)) - 80;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 9, y + 24);
      ctx.stroke();
    }
    ctx.restore();
  };

  const renderRadarCanvas = (secondsInAir = 0, isFlightActive = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    if (W === 0 || H === 0) return;

    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Subtle Spribe Aviator sunburst radial rays from origin (bottom-left)
    ctx.save();
    const rayCount = 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
    const maxDim = Math.max(W, H) * 1.5;
    for (let r = 0; r < rayCount; r++) {
      if (r % 2 === 0) {
        const a1 = (r * (Math.PI / 2)) / rayCount;
        const a2 = ((r + 1) * (Math.PI / 2)) / rayCount;
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(Math.cos(a1) * maxDim, H - Math.sin(a1) * maxDim);
        ctx.lineTo(Math.cos(a2) * maxDim, H - Math.sin(a2) * maxDim);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Background Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    const gridX = W < 500 ? 36 : 50;
    const gridY = W < 500 ? 30 : 40;
    for (let i = 0; i < W; i += gridX) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let j = 0; j < H; j += gridY) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke();
    }

    if (isFlightActive && gameStatusRef.current !== 'idle') {
      drawRain(ctx, W, H, secondsInAir);

      const isCrashed = gameStatus === 'crashed' || cycleCrashedRef.current;
      const timeSinceCrash = isCrashed && crashTimestampRef.current ? (Date.now() - crashTimestampRef.current) / 1000 : 0;

      // Pacing: Uniform slowed takeoff that gently glides into the sweet spot cruising zone (72% width, 65% height)
      const flightProgress = Math.min(secondsInAir / 14, 1);
      const easeX = 1 - Math.pow(1 - flightProgress, 1.8);
      const easeY = 1 - Math.pow(1 - flightProgress, 2.2);

      const pad = Math.max(30, W * 0.06);
      const startX = pad;
      const baseY = H - pad;
      const targetW = (W - pad * 2) * 0.72;
      const targetH = (H - pad * 2.2) * 0.65;

      // Gentle aerodynamic hovering oscillation
      const hoverWave = Math.sin(secondsInAir * 2.5) * (H < 350 ? 3 : 5);

      let cx = startX + targetW * easeX;
      let cy = baseY - targetH * easeY + hoverWave;

      // When crashed, the plane swoops forward and upward off-screen into the clouds!
      if (isCrashed) {
        const exitProgress = Math.min(timeSinceCrash / 1.0, 1);
        const exitSwoop = Math.pow(exitProgress, 2);
        cx += exitSwoop * (W * 0.65);
        cy -= exitSwoop * (H * 0.75);
      }

      // Authentic Spribe Aviator stunt plane sizing and climbing angle
      const planeScale = Math.max(0.48, Math.min(W / 650, 0.95));
      const planeW = 148 * planeScale;
      const planeH = planeW * (101 / 201);
      const planeAngle = -0.22 + Math.min(easeY * 0.2, 0.12) + Math.sin(secondsInAir * 4) * 0.012;

      // Attachment point on rear bottom runner:
      // Local runner tip offset from plane center: relX = -planeW * 0.49, relY = planeH * 0.44
      const runnerRelX = -planeW * 0.49;
      const runnerRelY = planeH * 0.44;
      const cosA = Math.cos(planeAngle);
      const sinA = Math.sin(planeAngle);
      const connectX = cx + cosA * runnerRelX - sinA * runnerRelY;
      const connectY = cy + sinA * runnerRelX + cosA * runnerRelY;

      // Draw the red curved flight trajectory trail and signature Spribe solid fill underneath
      if (!isCrashed || timeSinceCrash < 0.9) {
        const controlX = startX + (connectX - startX) * 0.45;
        const controlY = baseY - (baseY - connectY) * 0.28;

        // Solid-to-gradient crimson red area under curve with vertical right drop
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, baseY);
        ctx.quadraticCurveTo(controlX, controlY, connectX, connectY);
        ctx.lineTo(connectX, baseY);
        ctx.closePath();

        const underGradient = ctx.createLinearGradient(0, connectY, 0, baseY);
        underGradient.addColorStop(0, 'rgba(225, 29, 72, 0.48)');
        underGradient.addColorStop(0.65, 'rgba(190, 18, 60, 0.28)');
        underGradient.addColorStop(1, 'rgba(136, 19, 55, 0.12)');
        ctx.fillStyle = underGradient;
        ctx.fill();

        // Bright neon red flight path line
        ctx.beginPath();
        ctx.moveTo(startX, baseY);
        ctx.quadraticCurveTo(controlX, controlY, connectX, connectY);
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = W < 500 ? 3.5 : 5;
        ctx.lineCap = 'round';
        ctx.shadowBlur = multiplier >= 10.0 ? 22 : 12;
        ctx.shadowColor = '#e11d48';
        ctx.stroke();
        ctx.restore();
      }

      // Render Official Spribe Airplane if inside viewport
      if (cx < W + 100 && cy > -100) {
        // Soft ground/atmospheric shadow
        ctx.save();
        ctx.translate(cx + 6 * planeScale, cy + 10 * planeScale);
        ctx.rotate(planeAngle);
        ctx.globalAlpha = 0.25;
        ctx.filter = `blur(${Math.round(8 * planeScale)}px)`;
        if (planeImageRef.current) ctx.drawImage(planeImageRef.current, -planeW / 2, -planeH / 2, planeW, planeH);
        ctx.restore();

        // Main stunt plane
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(planeAngle);
        ctx.shadowBlur = multiplier >= 10.0 ? 18 * planeScale : 8 * planeScale;
        ctx.shadowColor = multiplier >= 10.0 ? '#fbbf24' : 'rgba(225, 29, 72, 0.4)';
        if (planeImageRef.current) ctx.drawImage(planeImageRef.current, -planeW / 2, -planeH / 2, planeW, planeH);

        // Subtle realistic propeller spin motion blur disk at front nose hub
        const propCenterRelX = planeW * 0.485;
        const propCenterRelY = 0;
        const propRadiusY = planeH * 0.48;

        ctx.beginPath();
        ctx.ellipse(propCenterRelX, propCenterRelY, 3.5 * planeScale, propRadiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fill();

        ctx.restore();
      }
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  Wallet & Profile Logic                                                 */
  /* ---------------------------------------------------------------------- */
  const handleCopyUserId = () => {
    if (!userIdCode) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(userIdCode);
      } else {
        const el = document.createElement('textarea');
        el.value = userIdCode;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedUserId(true);
      triggerToast(`User ID ${userIdCode} copied to clipboard!`, 'success');
      setTimeout(() => setCopiedUserId(false), 2000);
    } catch (e) {
      triggerToast(`User ID: ${userIdCode}`, 'info');
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;
    const cleanPhone = editPhone.trim();
    if ((!cleanPhone.startsWith('07') && !cleanPhone.startsWith('01')) || cleanPhone.length !== 10) {
      triggerToast('Enter a valid M-Pesa phone number.', 'error');
      return;
    }
    const cleanDisplayName = (editName || '').trim().slice(0, 50);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: cleanDisplayName,
          phone: cleanPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update profile');
      }
      if (data.userIdCode || data.user?.userIdCode) {
        setUserIdCode(data.userIdCode || data.user?.userIdCode);
      }
      setProfileName(cleanDisplayName);
      setPhoneProfile(cleanPhone);
      setInputPhone(cleanPhone);
      setWithdrawPhone(cleanPhone);
      localStorage.setItem('jetpesa_saved_phone', cleanPhone);
      setIsProfileModalOpen(false);
      triggerToast('Profile updated successfully.', 'success');
    } catch (err) {
      console.error('Failed to update profile:', err);
      triggerToast('Failed to update profile: ' + (err.message || 'Error occurred'), 'error');
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push('/auth');
    } catch (err) {
      console.error('Sign out error:', err);
      router.push('/auth');
    }
  };

  const handleWithdrawExecution = async () => {
    const amt = parseInt(withdrawAmount, 10);
    const targetPhone = (withdrawPhone || phoneProfile || inputPhone || '').trim();
    if (isNaN(amt) || amt < 50) { triggerToast('Minimum withdrawal is KES 50.', 'error'); return; }
    if (amt > balance) { triggerToast('Withdrawal exceeds wallet balance.', 'error'); return; }
    if (!targetPhone) { triggerToast('Please enter an M-Pesa phone number for payout.', 'error'); return; }
    if (!user?.uid && !user?.id) { triggerToast('Login session expired. Please sign in again.', 'error'); return; }

    setLoadingWithdraw(true);
    try {
      const res = await fetch('/api/printpay/b2c-withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: amt, phone: targetPhone }),
      });
      const data = await res.json();
      if (typeof data.newBalance === 'number') {
        setBalance(data.newBalance);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Withdrawal initiation failed.');
      }

      setWithdrawAmount('');
      setIsWithdrawModalOpen(false);
      triggerToast(data.message || `M-Pesa payout of KES ${amt} initiated!`, 'success');

      // Poll B2C status
      if (data.conversationId) {
        let attempts = 0;
        const maxAttempts = 15;
        const pollB2C = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch('/api/printpay/b2c-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: data.conversationId, withdrawalId: data.withdrawalId }),
            });
            const statusData = await statusRes.json();
            if (statusData.status === 'completed') {
              clearInterval(pollB2C);
              triggerToast(`Withdrawal confirmed! Receipt: ${statusData.receipt || 'M-Pesa confirmed'}`, 'success');
            } else if (statusData.status === 'failed') {
              clearInterval(pollB2C);
              triggerToast(statusData.failureReason || 'Payout failed. Wallet refunded.', 'error');
            }
            if (attempts >= maxAttempts) clearInterval(pollB2C);
          } catch {
            if (attempts >= maxAttempts) clearInterval(pollB2C);
          }
        }, 5000);
      }
    } catch (e) {
      triggerToast(`Withdrawal failed: ${e.message}`, 'error');
    } finally {
      setLoadingWithdraw(false);
    }
  };

  const triggerPayoutSequence = async (deckName, multVal, activeState) => {
    if (!user || !activeState.hasBetCurrent) return;
    try {
      const res = await fetch('/api/game/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deck: deckName, betId: activeState.currentBetId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'CRASHED' || data.code === 'ALREADY_RESOLVED') {
          return;
        }
        throw new Error(data.message || 'Auto-cashout missed.');
      }
      const newBal = typeof data.newBalance === 'number' ? data.newBalance : data.balance;
      if (typeof newBal === 'number') {
        setBalance(newBal);
      }
      fetchMyBetsHistory();

      // Keep Auto Bet cycle uninterrupted
      playSynthesizedTone(523.25, 'sine', 0.15, 0.05);
      setTimeout(() => playSynthesizedTone(659.25, 'sine', 0.15, 0.05), 100);
      setTimeout(() => playSynthesizedTone(783.99, 'sine', 0.3, 0.06), 200);
      confetti({ particleCount: 90, spread: 65, origin: { y: 0.35 } });
      triggerToast(`Deck ${deckName} Auto Cashout @ ${data.multiplier.toFixed(2)}x! +KES ${data.winAmount.toFixed(2)}`, 'success');
    } catch (e) {
      // Clean catch for flight resolution races
    }
  };

  const placeQueuedBet = async (deckName, state) => {
    if (!user) {
      queuedBetPendingRef.current[deckName] = false;
      return;
    }
    try {
      const autoCash = state.isAutoCash ? parseFloat(state.cashVal) : null;
      const res = await fetch('/api/game/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deck: deckName,
          wager: Math.max(MIN_WAGER, Number(state.wager) || MIN_WAGER),
          autoCashout: autoCash,
          roundId: currentRoundRef.current.nonce,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newBal = typeof data.newBalance === 'number' ? data.newBalance : data.balance;
        if (typeof newBal === 'number') {
          setBalance(newBal);
        }
        const isAutoBetRunning = Boolean(state.isAutoBet);
        const updateFn = (p) => ({
          ...p,
          hasBetCurrent: true,
          currentBetId: data.betId,
          isAutoBet: isAutoBetRunning,
          hasBetNext: isAutoBetRunning || p.isAuto,
        });

        if (deckName === 'A') setDeckA(updateFn);
        else setDeckB(updateFn);

        if (!data.alreadyActive) {
          triggerToast(`Deck ${deckName} stake KES ${state.wager} placed!${isAutoBetRunning ? ' (Auto)' : ''}`, 'success');
        }
        fetchMyBetsHistory();
      } else {
        if (deckName === 'A') setDeckA((p) => ({ ...p, hasBetNext: false, isAutoBet: false }));
        else setDeckB((p) => ({ ...p, hasBetNext: false, isAutoBet: false }));
        if (data.code !== 'ALREADY_ACTIVE') {
          triggerToast(data.message || `Deck ${deckName} stake failed.`, 'error');
        }
      }
    } catch {
      if (deckName === 'A') setDeckA((p) => ({ ...p, hasBetNext: false, isAutoBet: false }));
      else setDeckB((p) => ({ ...p, hasBetNext: false, isAutoBet: false }));
    } finally {
      queuedBetPendingRef.current[deckName] = false;
    }
  };

  const placeWagerIntent = async (targetDeck) => {
    if (balance <= 0) { triggerToast('Wallet reads KES 0.00. Please deposit first.', 'error'); return; }
    const isA = targetDeck === 'A';
    const targetState = isA ? deckA : deckB;
    const currentWagerAmount = Math.max(MIN_WAGER, Number(targetState.wager) || MIN_WAGER);
    betNonceRef.current++;
    if (currentWagerAmount < MIN_WAGER) { triggerToast('Minimum wager is KES 10.', 'error'); return; }
    if (balance < currentWagerAmount) { triggerToast('Selected stake exceeds your available balance.', 'error'); return; }
    if (!user) { triggerToast('Please sign in to place a wager.', 'error'); return; }

    // If user clicks CANCEL on a queued bet
    if (targetState.hasBetNext) {
      if (isA) setDeckA((p) => ({ ...p, hasBetNext: false }));
      else setDeckB((p) => ({ ...p, hasBetNext: false }));
      triggerToast(`Deck ${targetDeck} queued wager cancelled.`, 'info');
      return;
    }

    // If flight is running or crashed (post-crash pause), queue for next round
    if (gameStatus === 'running' || gameStatus === 'crashed') {
      if (isA) setDeckA((p) => ({ ...p, hasBetNext: true }));
      else setDeckB((p) => ({ ...p, hasBetNext: true }));
      triggerToast(`Deck ${targetDeck} wager queued for next flight.`, 'info');
      return;
    }

    try {
      const autoCash = targetState.isAutoCash ? parseFloat(targetState.cashVal) : null;
      const res = await fetch('/api/game/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deck: targetDeck,
          wager: currentWagerAmount,
          autoCashout: autoCash,
          roundId: currentRoundRef.current.nonce,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Wager rejected.');
      }
      const newBal = typeof data.newBalance === 'number' ? data.newBalance : data.balance;
      if (typeof newBal === 'number') {
        setBalance(newBal);
      }
      if (isA) setDeckA((p) => ({ ...p, hasBetCurrent: true, currentBetId: data.betId }));
      else setDeckB((p) => ({ ...p, hasBetCurrent: true, currentBetId: data.betId }));
      triggerToast(`Deck ${targetDeck} wager confirmed: KES ${currentWagerAmount}`, 'success');
      fetchMyBetsHistory();
    } catch (e) {
      triggerToast(e.message, 'error');
    }
  };

  const handleManualPayoutExecution = async (targetDeck) => {
    const isA = targetDeck === 'A';
    const targetState = isA ? deckA : deckB;
    if (!targetState.hasBetCurrent || !user) return;

    try {
      const res = await fetch('/api/game/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deck: targetDeck, betId: targetState.currentBetId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'CRASHED') {
          triggerToast(data.message || 'Flight flew away. Cashout missed.', 'error');
          if (isA) setDeckA((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          else setDeckB((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          return;
        }
        if (data.code === 'ALREADY_RESOLVED') {
          if (isA) setDeckA((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          else setDeckB((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
          return;
        }
        throw new Error(data.message || 'Cashout failed.');
      }
      const newBal = typeof data.newBalance === 'number' ? data.newBalance : data.balance;
      if (typeof newBal === 'number') {
        setBalance(newBal);
      }
      if (isA) setDeckA((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
      else setDeckB((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
      fetchMyBetsHistory();

      playSynthesizedTone(587.33, 'sine', 0.12, 0.05);
      setTimeout(() => playSynthesizedTone(880.0, 'sine', 0.25, 0.05), 110);
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.4 } });
      triggerToast(`Manual Cashout Approved! + KES ${data.winAmount.toFixed(2)}`, 'success');
    } catch (e) {
      if (isA) setDeckA((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
      else setDeckB((p) => ({ ...p, hasBetCurrent: false, currentBetId: null }));
      triggerToast(e.message, 'error');
    }
  };

  const handleToggleAutoBet = (targetDeck) => {
    const isA = targetDeck === 'A';
    const currentDeck = isA ? deckA : deckB;
    const setter = isA ? setDeckA : setDeckB;

    if (currentDeck.isAutoBet) {
      setter((p) => ({
        ...p,
        isAutoBet: false,
        hasBetNext: false,
      }));
      triggerToast(`Deck ${targetDeck}: Auto Bet stopped.`, 'info');
    } else {
      if (balance < currentDeck.wager) {
        triggerToast(`Insufficient funds (KES ${balance.toFixed(2)}) for wager KES ${currentDeck.wager}. Please deposit.`, 'error');
        return;
      }
      setter((p) => ({
        ...p,
        isAutoBet: true,
        hasBetNext: true,
      }));
      triggerToast(`Deck ${targetDeck}: Auto Bet activated!`, 'success');
    }
  };

  const broadcastChatMessage = () => {
    if (!chatInput.trim()) return;
    if (balance <= 1000) { triggerToast('Only users with wallet above KES 1,000 can send messages.', 'error'); return; }
    setChatLogs((p) => [...p, { user: 'You', seed: 'you', msg: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setChatInput('');
    playSynthesizedTone(800, 'sine', 0.03, 0.01);
  };

  const handlePaymentInitiation = async () => {
    const amt = parseInt(inputAmount, 10);
    const cleanPhone = inputPhone.trim().replace(/\s+/g, '');
    if (isNaN(amt) || amt < 10) { triggerToast('Minimum deposit is KES 10.', 'error'); return; }
    if ((!cleanPhone.startsWith('07') && !cleanPhone.startsWith('01') && !cleanPhone.startsWith('254') && !cleanPhone.startsWith('+254'))) {
      triggerToast('Enter a valid Kenyan phone number (e.g. 07XXXXXXXX or 01XXXXXXXX).', 'error');
      return;
    }
    if (!user?.uid && !user?.id) { triggerToast('Login session expired. Please sign in again.', 'error'); return; }
    
    setLoadingDeposit(true);
    try {
      const res = await fetch('/api/printpay/c2b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: amt, phone: cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Payment initiation failed.');
      if (rememberPhone) localStorage.setItem('jetpesa_saved_phone', cleanPhone);
      triggerToast(data.message || 'STK push sent. Complete payment on your phone.', 'info');
      let attempts = 0;
      const maxAttempts = 36;
      const poll = setInterval(async () => {
        attempts += 1;
        try {
          const statusRes = await fetch(`/api/printpay/c2b-status?reference=${data.reference}&checkout_id=${data.checkoutId || ''}`);
          const statusData = await statusRes.json();
          if (statusData.status === 'completed') {
            clearInterval(poll);
            await refreshUserData();
            setIsDepositModalOpen(false);
            setLoadingDeposit(false);
            triggerToast(`Deposit confirmed! KES ${amt} added to wallet.`, 'success');
          }
          if (statusData.status === 'failed') {
            clearInterval(poll);
            setLoadingDeposit(false);
            triggerToast(statusData.failureReason || 'Payment failed or was cancelled.', 'error');
          }
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            setLoadingDeposit(false);
            triggerToast('Payment is still pending. Wallet will update after confirmation.', 'info');
          }
        } catch (e) {
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            setLoadingDeposit(false);
          }
        }
      }, 3000);
    } catch (e) {
      setLoadingDeposit(false);
      triggerToast(e.message, 'error');
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  Render Helpers                                                         */
  /* ---------------------------------------------------------------------- */
  const renderLiveBets = () => (
    <div className="jp-panel-scroll">
      <div className="jp-live-table-head">
        <span className="jp-col-player">Player</span>
        <span className="jp-col-bet">Bet KES</span>
        <span className="jp-col-mult">X</span>
        <span className="jp-col-win">Win KES</span>
      </div>
      {liveBetsFeed.length === 0 ? (
        <div className="jp-empty-state">
          <Icon name="jet" size={32} />
          <strong>Preparing new round</strong>
          <span>New wagers are entering...</span>
        </div>
      ) : (
        <>
          {liveBetsFeed.map((b) => {
            const isWon = b.status === 'cashed';
            const winAmount = b.payout || Math.floor(b.bet * b.mult);
            const multVal = Number(b.mult || 1);
            const multColor = multVal >= 10.0 ? '#fbbf24' : multVal >= 2.0 ? '#c084fc' : '#38bdf8';

            return (
              <div key={b.id} className={`jp-live-row ${isWon ? 'jp-live-row-won' : ''}`}>
                <div className="jp-live-player-cell">
                  <UserAvatar seed={b.seed} size={24} />
                  <span className="jp-live-user" title={b.username}>{b.username}</span>
                </div>
                <div className="jp-live-bet-cell">
                  {Number(b.bet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="jp-live-mult-cell" style={{ color: isWon ? multColor : 'transparent' }}>
                  {isWon ? `${multVal.toFixed(2)}x` : ''}
                </div>
                <div className="jp-live-win-cell">
                  {isWon
                    ? Number(winAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : ''}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  const renderMyBets = () => {
    const totalStake = myBetsHistory.reduce((acc, b) => acc + (Number(b.stake) || 0), 0);
    const totalWon = myBetsHistory.reduce((acc, b) => acc + (Number(b.winAmount) || 0), 0);
    const netProfit = totalWon - totalStake;

    return (
      <div className="jp-panel-scroll">
        {/* Top summary bar for user's last 10 bets */}
        <div className="jp-my-bets-stats-bar">
          <div className="jp-my-stat-chip">
            <span className="jp-my-stat-label">RECORDED</span>
            <span className="jp-my-stat-val">{myBetsHistory.length} / 10 BETS</span>
          </div>
          <div className="jp-my-stat-chip">
            <span className="jp-my-stat-label">TOTAL STAKE</span>
            <span className="jp-my-stat-val">KES {totalStake.toLocaleString()}</span>
          </div>
          <div className="jp-my-stat-chip">
            <span className="jp-my-stat-label">TOTAL WON</span>
            <span className="jp-my-stat-val jp-my-stat-green">KES {totalWon.toLocaleString()}</span>
          </div>
          <div className="jp-my-stat-chip">
            <span className="jp-my-stat-label">NET PROFIT</span>
            <span className={`jp-my-stat-val ${netProfit >= 0 ? 'jp-my-stat-green' : 'jp-my-stat-rose'}`}>
              {netProfit >= 0 ? '+' : ''}KES {netProfit.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="jp-my-bets-head">
          <span>Flight & Deck</span>
          <span style={{ textAlign: 'right' }}>Stake</span>
          <span style={{ textAlign: 'center' }}>Outcome</span>
          <span style={{ textAlign: 'right' }}>Payout</span>
        </div>

        {myBetsHistory.length === 0 ? (
          <div className="jp-empty-state">
            <Icon name="jet" size={32} />
            <strong>No bets recorded yet</strong>
            <span>Your last 10 round bets will be logged here in real time.</span>
          </div>
        ) : (
          myBetsHistory.slice(0, 10).map((b) => {
            const isWon = b.status === 'WON';
            const isCrashed = b.status === 'CRASHED' || b.status === 'LOST';
            const isActive = b.status === 'ACTIVE';
            const stakeVal = Number(b.stake || 0);
            const winVal = Number(b.winAmount || 0);

            return (
              <div key={b.id || b.roundId} className={`jp-my-bet-card ${isWon ? 'jp-my-bet-card-won' : isCrashed ? 'jp-my-bet-card-lost' : 'jp-my-bet-card-active'}`}>
                <div className="jp-my-bet-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`jp-my-deck-badge ${b.deck === 'B' ? 'jp-deck-b-badge' : 'jp-deck-a-badge'}`}>
                      DECK {b.deck || 'A'}
                    </span>
                    <span className="jp-my-bet-round">#{b.roundId}</span>
                  </div>
                  <span className="jp-my-bet-time">{b.timeStr || ''}</span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className="jp-my-bet-stake">{stakeVal.toLocaleString()} KES</span>
                  {b.autoCashout && (
                    <span className="jp-my-bet-autocash">Auto: {Number(b.autoCashout).toFixed(2)}x</span>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  {isWon ? (
                    <span className="jp-badge jp-badge-win">{b.multiplier ? `${Number(b.multiplier).toFixed(2)}x` : 'WON'}</span>
                  ) : isCrashed ? (
                    <span className="jp-badge jp-badge-lost">{b.roundCrashPoint ? `@ ${Number(b.roundCrashPoint).toFixed(2)}x` : 'Lost'}</span>
                  ) : (
                    <span className="jp-badge jp-badge-flying">Flying</span>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {isWon ? (
                    <span className="jp-my-bet-payout jp-payout-won">+{winVal.toLocaleString()} KES</span>
                  ) : isCrashed ? (
                    <span className="jp-my-bet-payout jp-payout-lost">-{stakeVal.toLocaleString()} KES</span>
                  ) : (
                    <span className="jp-my-bet-payout jp-payout-active">In Flight</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderDeckPanel = (name, deck, setter) => {
    const isQueued = deck.hasBetNext;
    const isFlying = deck.hasBetCurrent;
    const formattedWager = `${Number(deck.wager || 0).toFixed(2)} KES`;

    return (
      <div key={name} className="jp-deck-panel">
        {/* Top Centered Bet / Auto Pill */}
        <div className="jp-deck-tab-wrap">
          <div className="jp-deck-tabs">
            <button
              type="button"
              onClick={() => setter((p) => ({ ...p, isAuto: false }))}
              className={`jp-deck-tab-btn ${!deck.isAuto ? 'active' : ''}`}
            >
              Bet
            </button>
            <button
              type="button"
              onClick={() => setter((p) => ({ ...p, isAuto: true }))}
              className={`jp-deck-tab-btn ${deck.isAuto ? 'active' : ''}`}
            >
              Auto
            </button>
          </div>
        </div>

        {/* Two-Column Main Row: Left (Stepper + 2x2 Grid), Right (Big Amber BET Button) */}
        <div className="jp-deck-main-row">
          <div className="jp-deck-left-col">
            {/* Stepper Input [-] WAGER [+] */}
            <div className="jp-stepper-box">
              <button
                type="button"
                onClick={() => setter((p) => {
                  const cur = Number(p.wager) || MIN_WAGER;
                  return { ...p, wager: Math.max(MIN_WAGER, cur - 10) };
                })}
                className="jp-stepper-btn"
                title="Decrease stake by 10 KES"
                aria-label="Decrease stake by 10 KES"
              >
                <Icon name="minus" size={13} />
              </button>
              <input
                type="number"
                min={MIN_WAGER}
                step={10}
                value={deck.wager}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setter((p) => ({ ...p, wager: '' }));
                    return;
                  }
                  const parsed = parseInt(val, 10);
                  setter((p) => ({ ...p, wager: isNaN(parsed) ? MIN_WAGER : parsed }));
                }}
                onBlur={() => {
                  setter((p) => ({ ...p, wager: Math.max(MIN_WAGER, Number(p.wager) || MIN_WAGER) }));
                }}
                className="jp-stepper-input"
              />
              <button
                type="button"
                onClick={() => setter((p) => {
                  const cur = Number(p.wager) || MIN_WAGER;
                  return { ...p, wager: cur + 10 };
                })}
                className="jp-stepper-btn"
                title="Increase stake by 10 KES"
                aria-label="Increase stake by 10 KES"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>

            {/* 2x2 Quick Stake Grid: 50, 100, 250, 500 (Spribe Aviator Standard) */}
            <div className="jp-quick-grid-2x2">
              {[50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setter((p) => ({ ...p, wager: v }))}
                  className={`jp-quick-grid-btn ${deck.wager === v ? 'active' : ''}`}
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="jp-deck-right-col">
            {isFlying ? (
              <button
                type="button"
                onClick={() => handleManualPayoutExecution(name)}
                className="jp-action-btn jp-cashout-mode"
              >
                <span className="jp-action-label">CASH OUT</span>
                <span className="jp-action-sub">{(deck.wager * multiplier).toFixed(2)} KES</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => placeWagerIntent(name)}
                className={`jp-action-btn jp-bet-mode ${isQueued ? 'queued' : ''} ${deck.isAutoBet ? 'auto-active' : ''}`}
              >
                {isQueued ? (
                  <>
                    <span className="jp-action-label">CANCEL</span>
                    <span className="jp-action-sub">Waiting for next round</span>
                  </>
                ) : (
                  <>
                    <span className="jp-action-label">Bet</span>
                    <span className="jp-action-sub">{formattedWager}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Single-Line Bottom Row (Only visible when deck.isAuto is true) */}
        {deck.isAuto && (
          <div className="jp-deck-auto-row">
            {/* Auto Bet Toggle */}
            <div className="jp-auto-inline-group">
              <span className="jp-auto-inline-label">Auto Bet</span>
              <button
                type="button"
                onClick={() => handleToggleAutoBet(name)}
                className={`jp-toggle-pill ${deck.isAutoBet ? 'active' : ''}`}
                title={deck.isAutoBet ? 'Disable Auto Bet' : 'Enable Auto Bet'}
              >
                <span className="jp-toggle-knob" />
              </button>
            </div>

            {/* Auto Cash Out Toggle */}
            <div className="jp-auto-inline-group">
              <span className="jp-auto-inline-label">Auto Cash Out</span>
              <button
                type="button"
                onClick={() => setter((p) => ({ ...p, isAutoCash: !p.isAutoCash }))}
                className={`jp-toggle-pill ${deck.isAutoCash ? 'active' : ''}`}
                title={deck.isAutoCash ? 'Disable Auto Cash Out' : 'Enable Auto Cash Out'}
              >
                <span className="jp-toggle-knob" />
              </button>
            </div>

            {/* Multiplier input pill: e.g. [ 2.55  x ] */}
            <div className="jp-cashout-pill-box" style={{ opacity: deck.isAutoCash ? 1 : 0.45 }}>
              <input
                type="number"
                step="0.05"
                min="1.01"
                disabled={!deck.isAutoCash}
                value={deck.cashVal}
                onChange={(e) => setter((p) => ({ ...p, cashVal: e.target.value }))}
                className="jp-cashout-pill-input"
              />
              <span className="jp-cashout-pill-suffix">x</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------------------------------------------------- */
  /*  JSX                                                                    */
  /* ---------------------------------------------------------------------- */
  const profileTotalStake = myBetsHistory.reduce((acc, b) => acc + (Number(b.stake) || 0), 0);
  const profileTotalWon = myBetsHistory.reduce((acc, b) => acc + (Number(b.winAmount) || 0), 0);
  const profileNetProfit = profileTotalWon - profileTotalStake;
  const profileBestMultiplier = myBetsHistory.reduce((max, b) => Math.max(max, Number(b.multiplier) || 0), 0);
  const profileWonCount = myBetsHistory.filter((b) => b.status === 'WON').length;
  const profileWinRate = myBetsHistory.length > 0 ? Math.round((profileWonCount / myBetsHistory.length) * 100) : 0;

  return (
    <div className="jp-cockpit">
      {/* Toasts */}
      <div className="jp-toast-container">
        {toasts.map((t) => {
          const toastIcon = t.type === 'error' ? 'x-circle' : t.type === 'success' ? 'check-circle' : 'alert-triangle';
          const toastColor = t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#22c55e' : '#3b82f6';
          return (
            <div key={t.id} className="jp-toast" style={{ borderLeft: `4px solid ${toastColor}` }}>
              <Icon name={toastIcon} size={16} style={{ color: toastColor, flexShrink: 0 }} />
              <span>{t.msg}</span>
            </div>
          );
        })}
      </div>

      {/* Header */}
      <header className="jp-header">
        <div className="jp-header-left">
          <span className="jp-brand-text">JET<span className="jp-brand-accent">PESA</span></span>
          <button className="jp-fair-btn" onClick={openProvablyModal}>
            <Icon name="shield-check" size={13} />
            <span className="jp-fair-label">FAIR #{currentRoundRef.current.nonce}</span>
          </button>
        </div>
        <div className="jp-header-right">
          <button className="jp-icon-btn" onClick={() => setAudioMuted(!audioMuted)} aria-label="Toggle audio">
            <Icon name={audioMuted ? 'volume-x' : 'volume-2'} size={18} />
          </button>
          <button className={`jp-rain-btn ${isRainActive ? 'jp-active' : ''}`} onClick={() => setIsRainActive(!isRainActive)}>
            <Icon name="cloud-rain" size={13} />
            <span className="jp-rain-label">RAIN</span>
          </button>
          <button
            className="jp-profile-btn"
            onClick={() => {
              fetchMyBetsHistory();
              setIsProfileModalOpen(true);
            }}
            title={userIdCode ? `Pilot Account ID: ${userIdCode} - Click to open Profile` : 'Profile'}
          >
            <Icon name="user" size={13} />
            <span className="jp-profile-label">{userIdCode ? `ID: ${userIdCode}` : 'PROFILE'}</span>
          </button>
          <div className="jp-wallet-pill">
            <button className="jp-wallet-balance" onClick={() => balance > 0 ? setIsWithdrawModalOpen(true) : triggerToast('Wallet is empty. Deposit first.', 'info')}>
              <Icon name="wallet" size={15} />
              <span className="jp-wallet-amount">{balance.toFixed(2)} KES</span>
            </button>
            <button className="jp-deposit-btn" onClick={() => setIsDepositModalOpen(true)}>DEPOSIT</button>
          </div>
        </div>
      </header>

      {/* History Tape */}
      <div className="jp-history-tape" suppressHydrationWarning>
        {!mounted || historyTape.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '12px', fontWeight: '800', padding: '5px 2px' }}>
            {mounted ? 'Previous rounds will appear after the first completed flight.' : ''}
          </div>
        ) : (
          historyTape.map((h, i) => (
            <div key={`${h}-${i}`} className={`jp-history-chip ${h >= 10 ? 'jp-history-ultra' : h >= 2 ? 'jp-history-high' : 'jp-history-low'}`} style={{ transform: `rotateX(14deg) translateZ(${Math.max(0, 12 - i)}px)` }}>
              {Number(h).toFixed(2)}x
            </div>
          ))
        )}
      </div>

      {/* Main Layout */}
      <div className="jp-layout">
        <div
          ref={centerPanelRef}
          className="jp-center-panel"
          data-active={mobileActivePanel === 'game' || mobileActivePanel === 'bets'}
        >
          <div className="jp-canvas-container">
            {gameStatus === 'idle' && (
              <div className="jp-idle-overlay">
                <div className="jp-countdown-timer-wrap">
                  <div className="jp-countdown-badge">
                    <Icon name="clock" size={13} className="jp-countdown-clock-icon" />
                    <span>NEXT ROUND IN</span>
                  </div>
                  <div className="jp-countdown-digital">
                    <span ref={countdownTextRef} className="jp-countdown-digits">{countdownSeconds}s</span>
                  </div>
                </div>
                <div className="jp-progress-track">
                  <div
                    ref={progressFillRef}
                    className="jp-progress-fill"
                    style={{ width: `${countdownProgress}%` }}
                  />
                </div>
                <span className="jp-idle-text">WAITING FOR NEXT FLIGHT...</span>
                <span className="jp-idle-sub">Place your bets · Wagers closing soon</span>
              </div>
            )}
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            {gameStatus !== 'idle' && (
              <div className="jp-multiplier-overlay">
                {gameStatus === 'crashed' ? (
                  <div>
                    <h1 className="jp-crashed-title"><Icon name="x-circle" size={32} className="jp-crash-icon" />FLEW AWAY</h1>
                    <span className="jp-crashed-sub">Ended @ {multiplier.toFixed(2)}x</span>
                  </div>
                ) : (
                  <h1 className="jp-multiplier-text">{multiplier.toFixed(2)}x</h1>
                )}
              </div>
            )}
          </div>

          {/* Two Betting Decks (Deck A & Deck B) */}
          <div className="jp-deck-grid">
            {renderDeckPanel('A', deckA, setDeckA)}
            {renderDeckPanel('B', deckB, setDeckB)}
          </div>

          {/* LIVE Section Directly Below the GAME Two Decks Section */}
          <div ref={liveSectionRef} className="jp-panel jp-live-below-decks">
            <div className="jp-tab-bar">
              <button onClick={() => setActiveTab('all')} className={`jp-tab ${activeTab === 'all' ? 'jp-active' : ''}`}>
                <span className="jp-live-dot-pulse" />
                LIVE ({lobbyOnlineCount.toLocaleString()})
              </button>
              <button onClick={() => { setActiveTab('mine'); fetchMyBetsHistory(); }} className={`jp-tab ${activeTab === 'mine' ? 'jp-active' : ''}`}>
                MY BETS{myBetsHistory.length > 0 ? ` (${myBetsHistory.length})` : ''}
              </button>
            </div>
            {activeTab === 'all' && (
              <div className="jp-live-summary-bar">
                <div className="jp-live-summary-card">
                  <div className="jp-live-summary-header">
                    <span className="jp-live-summary-dot jp-dot-pilots" />
                    <span className="jp-live-summary-label">IN FLIGHT</span>
                  </div>
                  <span className="jp-live-summary-value jp-val-pilots">
                    {displayActivePlayers.toLocaleString()}
                  </span>
                </div>
                <div className="jp-live-summary-divider" />
                <div className="jp-live-summary-card">
                  <div className="jp-live-summary-header">
                    <span className="jp-live-summary-dot jp-dot-placed" />
                    <span className="jp-live-summary-label">TOTAL PLACED</span>
                  </div>
                  <span className="jp-live-summary-value jp-val-placed">
                    KES {totalLivePlaced.toLocaleString()}
                  </span>
                </div>
                <div className="jp-live-summary-divider" />
                <div className="jp-live-summary-card">
                  <div className="jp-live-summary-header">
                    <span className="jp-live-summary-dot jp-dot-won" />
                    <span className="jp-live-summary-label">TOTAL WON</span>
                  </div>
                  <span className="jp-live-summary-value jp-val-won">
                    KES {totalLiveWon.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
            {activeTab === 'all' ? renderLiveBets() : renderMyBets()}
          </div>
        </div>

        <div className="jp-panel jp-right-panel" data-active={mobileActivePanel === 'chat'}>
          <div className="jp-chat-header"><div className="jp-chat-dot" /><span>Lobby Chat</span></div>
          <div className="jp-chat-scroll">
            {chatLogs.map((c, i) => {
              const isMe = c.user === 'You';
              return (
                <div key={i} className={`jp-chat-bubble ${isMe ? 'jp-chat-me' : ''}`}>
                  {!isMe && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <UserAvatar seed={c.seed} size={18} />
                      <span className="jp-chat-user">{c.user}</span>
                    </div>
                  )}
                  <span className="jp-chat-msg">{c.msg}</span>
                  <span className="jp-chat-time">{c.time}</span>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="jp-chat-input-row">
            <input type="text" placeholder={balance > 1000 ? 'Type a message...' : 'Requires KES 1001+'} disabled={balance <= 1000} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') broadcastChatMessage(); }} className="jp-chat-input" />
            <button onClick={broadcastChatMessage} className="jp-chat-send" aria-label="Send message"><Icon name="send" size={15} /></button>
          </div>
        </div>
      </div>

      {/* Mobile Footer */}
      <div className="jp-mobile-footer">
        <button
          onClick={() => {
            setMobileActivePanel('bets');
            setActiveTab('all');
            setTimeout(() => {
              liveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 40);
          }}
          className={`jp-mobile-tab ${mobileActivePanel === 'bets' && activeTab === 'all' ? 'jp-active' : ''}`}
        >
          <Icon name="bar-chart-3" size={18} />LIVE
        </button>
        <button
          onClick={() => {
            setMobileActivePanel('game');
            setTimeout(() => {
              centerPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }, 40);
          }}
          className={`jp-mobile-tab ${mobileActivePanel === 'game' ? 'jp-active' : ''}`}
        >
          <Icon name="rocket" size={18} />GAME
        </button>
        <button onClick={() => setMobileActivePanel('chat')} className={`jp-mobile-tab ${mobileActivePanel === 'chat' ? 'jp-active' : ''}`}>
          <Icon name="message-square" size={18} />CHAT
        </button>
      </div>

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div className="jp-modal-overlay" onClick={() => setIsDepositModalOpen(false)}>
          <div className="jp-modal-box jp-modal-green" onClick={(e) => e.stopPropagation()}>
            <button className="jp-modal-close" onClick={() => setIsDepositModalOpen(false)}><Icon name="x" size={20} /></button>
            <h3 className="jp-modal-title" style={{ color: '#22c55e' }}>M-Pesa Deposit (PrintPay)</h3>
            <div className="jp-modal-field"><label className="jp-modal-label">DEPOSIT AMOUNT (MIN 10 KES)</label><input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="jp-modal-input" /></div>
            <div className="jp-modal-field"><label className="jp-modal-label">M-PESA REGISTERED PHONE</label><input type="text" value={inputPhone} onChange={(e) => setInputPhone(e.target.value)} placeholder="07XXXXXXXX or 01XXXXXXXX" className="jp-modal-input" /></div>
            <button onClick={handlePaymentInitiation} disabled={loadingDeposit} className="jp-modal-btn jp-btn-green">{loadingDeposit ? 'SENDING STK PROMPT...' : 'AUTHORIZE STK DEPOSIT'}</button>

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', color: '#94a3b8', lineHeight: '1.6' }}>
              <div style={{ fontWeight: '700', color: '#f8fafc', marginBottom: '2px' }}>Manual Paybill Instructions:</div>
              <div>1. Paybill Business No: <strong style={{ color: '#22c55e' }}>1416998</strong></div>
              <div>2. Account No: <strong style={{ color: '#38bdf8' }}>RK06FTNUZX5T</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="jp-modal-overlay" onClick={() => setIsProfileModalOpen(false)}>
          <div className="jp-modal-box jp-modal-profile" onClick={(e) => e.stopPropagation()}>
            <button className="jp-modal-close" onClick={() => setIsProfileModalOpen(false)}>
              <Icon name="x" size={20} />
            </button>

            <div className="jp-profile-modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="user" size={18} color="#38bdf8" />
                <h3 className="jp-modal-title" style={{ color: '#38bdf8', margin: 0 }}>
                  PILOT PROFILE & ACCOUNT
                </h3>
              </div>
              <span className="jp-bclb-badge">🇰🇪 BCLB LICENSED</span>
            </div>

            {/* Card 1: Kenyan Pilot Identity & BCLB Status */}
            <div className="jp-profile-card">
              <div className="jp-profile-header-row">
                <div className="jp-profile-avatar-wrap">
                  <UserAvatar seed={user?.id || 'pilot'} size={48} />
                  <span className="jp-profile-online-badge" />
                </div>
                <div className="jp-profile-id-info">
                  <div className="jp-profile-name-row">
                    <span className="jp-profile-main-name">{editName || phoneProfile || 'Kenyan Pilot'}</span>
                    <span className="jp-bclb-badge">🇰🇪 BCLB 18+</span>
                  </div>
                  <div className="jp-profile-tags-row">
                    <span className="jp-kyc-tag"><Icon name="shield-check" size={11} /> KYC Tier 1 Verified</span>
                    <span className="jp-currency-tag">• KES Market</span>
                  </div>
                </div>
              </div>

              {/* 8-Digit Account ID Bar */}
              <div className="jp-profile-account-id-box">
                <div className="jp-account-id-label-col">
                  <span className="jp-account-id-sub">8-DIGIT PILOT ACCOUNT ID</span>
                  <span className="jp-account-id-code">{userIdCode || '32637692'}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUserId}
                  className={`jp-account-id-copy-btn ${copiedUserId ? 'copied' : ''}`}
                >
                  <Icon name={copiedUserId ? 'check' : 'copy'} size={14} />
                  <span>{copiedUserId ? 'COPIED' : 'COPY ID'}</span>
                </button>
              </div>
            </div>

            {/* Card 2: Wallet & M-Pesa Banking */}
            <div className="jp-profile-card">
              <div className="jp-card-section-title">
                <Icon name="wallet" size={14} />
                <span>M-PESA WALLET & FUNDS</span>
              </div>

              <div className="jp-wallet-balance-grid">
                <div className="jp-wallet-balance-cell">
                  <span className="jp-balance-cell-label">WITHDRAWABLE CASH</span>
                  <span className="jp-balance-cell-val jp-green-text">KES {balance.toFixed(2)}</span>
                </div>
                <div className="jp-wallet-balance-cell">
                  <span className="jp-balance-cell-label">BONUS BALANCE</span>
                  <span className="jp-balance-cell-val">KES 0.00</span>
                </div>
                <div className="jp-wallet-balance-cell">
                  <span className="jp-balance-cell-label">TOTAL FUNDS</span>
                  <span className="jp-balance-cell-val">KES {balance.toFixed(2)}</span>
                </div>
              </div>

              <div className="jp-profile-wallet-actions">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    setIsDepositModalOpen(true);
                  }}
                  className="jp-profile-action-btn jp-btn-deposit-mpesa"
                >
                  <Icon name="plus" size={14} />
                  <span>DEPOSIT VIA M-PESA</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (balance > 0) {
                      setIsProfileModalOpen(false);
                      setIsWithdrawModalOpen(true);
                    } else {
                      triggerToast('Wallet is empty. Deposit first.', 'info');
                    }
                  }}
                  className="jp-profile-action-btn jp-btn-withdraw-mpesa"
                >
                  <Icon name="wallet" size={14} />
                  <span>WITHDRAW (B2C)</span>
                </button>
              </div>

              {/* Linked M-Pesa Phone */}
              <div className="jp-input-group-vertical" style={{ marginTop: '10px' }}>
                <label className="jp-profile-input-label">
                  <span>PRIMARY M-PESA NUMBER</span>
                  <span className="jp-mpesa-active-pill">🟢 STK Active</span>
                </label>
                <div className="jp-phone-input-wrap">
                  <span className="jp-phone-prefix">+254</span>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="7XXXXXXXX"
                    className="jp-profile-text-input"
                  />
                </div>
                <span className="jp-input-helper-text">
                  Used for Instant STK Push deposits and B2C automated withdrawals.
                </span>
              </div>
            </div>

            {/* Card 3: Kenyan Market Activity & Career Stats */}
            <div className="jp-profile-card">
              <div className="jp-card-section-title">
                <Icon name="bar-chart-3" size={14} />
                <span>ACTIVITY & PILOT PERFORMANCE</span>
              </div>

              <div className="jp-stats-4grid">
                <div className="jp-stat-tile">
                  <span className="jp-stat-tile-label">RECORDED WAGERS</span>
                  <span className="jp-stat-tile-val">{myBetsHistory.length} / 10 Bets</span>
                </div>
                <div className="jp-stat-tile">
                  <span className="jp-stat-tile-label">TOTAL STAKED</span>
                  <span className="jp-stat-tile-val">KES {profileTotalStake.toLocaleString()}</span>
                </div>
                <div className="jp-stat-tile">
                  <span className="jp-stat-tile-label">TOTAL WON</span>
                  <span className="jp-stat-tile-val jp-green-text">KES {profileTotalWon.toLocaleString()}</span>
                </div>
                <div className="jp-stat-tile">
                  <span className="jp-stat-tile-label">NET PROFIT</span>
                  <span className={`jp-stat-tile-val ${profileNetProfit >= 0 ? 'jp-green-text' : 'jp-rose-text'}`}>
                    {profileNetProfit >= 0 ? '+' : ''}KES {profileNetProfit.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="jp-stat-secondary-row">
                <div className="jp-stat-mini-pill">
                  <span>BEST MULTIPLIER:</span>
                  <strong style={{ color: profileBestMultiplier >= 10 ? '#fbbf24' : '#c084fc' }}>
                    {profileBestMultiplier > 0 ? `${profileBestMultiplier.toFixed(2)}x` : '—'}
                  </strong>
                </div>
                <div className="jp-stat-mini-pill">
                  <span>WIN RATE:</span>
                  <strong style={{ color: profileWinRate >= 50 ? '#22c55e' : '#94a3b8' }}>{profileWinRate}%</strong>
                </div>
              </div>
            </div>

            {/* Card 4: Account Details & Editing */}
            <div className="jp-profile-card">
              <div className="jp-card-section-title">
                <Icon name="settings" size={14} />
                <span>ACCOUNT & NICKNAME</span>
              </div>

              <div className="jp-input-group-vertical">
                <label className="jp-profile-input-label">DISPLAY NAME / PILOT NICKNAME</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your nickname"
                  className="jp-profile-text-input"
                />
              </div>

              <div className="jp-input-group-vertical" style={{ marginTop: '8px' }}>
                <label className="jp-profile-input-label">REGISTERED SYSTEM EMAIL</label>
                <input
                  type="text"
                  value={user?.email || `${editPhone || 'pilot'}@phone.jetpesa.com`}
                  disabled
                  readOnly
                  className="jp-profile-text-input jp-input-disabled"
                />
              </div>

              <button
                type="button"
                onClick={handleProfileUpdate}
                className="jp-save-profile-btn"
              >
                <Icon name="check" size={14} />
                <span>SAVE PROFILE CHANGES</span>
              </button>
            </div>

            {/* Card 5: BCLB Regulatory Notice & Responsible Gaming */}
            <div className="jp-profile-card jp-bclb-card">
              <div className="jp-bclb-header">
                <Icon name="shield-check" size={16} />
                <span>BETTING CONTROL & LICENSING BOARD (BCLB)</span>
              </div>
              <p className="jp-bclb-text">
                JetPesa operates in full compliance with the Betting, Lotteries and Gaming Act (Cap 131, Laws of Kenya).
                Strictly 18+ only. Gambling can be addictive and financially hazardous. Play responsibly and set personal wager limits.
              </p>
              <div className="jp-bclb-controls">
                <div className="jp-limit-chip">
                  <span className="jp-limit-label">DAILY STAKE LIMIT:</span>
                  <span className="jp-limit-val">KES 500,000 / Day</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    setIsProvablyModalOpen(true);
                  }}
                  className="jp-provably-verify-btn"
                >
                  <span>AUDIT PROVABLY FAIR SEED</span>
                </button>
              </div>
            </div>

            {/* Card 6: Session & Sign Out */}
            <div className="jp-profile-card" style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleSignOut}
                className="jp-signout-btn"
              >
                <span>SIGN OUT OF JETPESA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="jp-modal-overlay" onClick={() => setIsWithdrawModalOpen(false)}>
          <div className="jp-modal-box jp-modal-orange" onClick={(e) => e.stopPropagation()}>
            <button className="jp-modal-close" onClick={() => setIsWithdrawModalOpen(false)}><Icon name="x" size={20} /></button>
            <h3 className="jp-modal-title" style={{ color: '#f59e0b' }}>M-Pesa Payout (B2C)</h3>
            <p className="jp-modal-balance">Available: <strong style={{ color: '#22c55e' }}>KES {balance.toFixed(2)}</strong></p>
            <div className="jp-modal-field"><label className="jp-modal-label">WITHDRAW AMOUNT (MIN 50 KES)</label><input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="Minimum 50" className="jp-modal-input" /></div>
            <div className="jp-modal-field"><label className="jp-modal-label">RECEIVING M-PESA NUMBER</label><input type="text" value={withdrawPhone} onChange={(e) => setWithdrawPhone(e.target.value)} placeholder="07XXXXXXXX or 01XXXXXXXX" className="jp-modal-input" /></div>
            <button onClick={handleWithdrawExecution} disabled={loadingWithdraw} className="jp-modal-btn jp-btn-orange">{loadingWithdraw ? 'DISBURSING VIA B2C...' : 'DISBURSE TO M-PESA'}</button>
          </div>
        </div>
      )}

      {/* Provably Fair Modal */}
      {isProvablyModalOpen && (
        <div className="jp-modal-overlay" onClick={() => setIsProvablyModalOpen(false)}>
          <div className="jp-modal-box jp-modal-purple" onClick={(e) => e.stopPropagation()}>
            <button className="jp-modal-close" onClick={() => setIsProvablyModalOpen(false)}><Icon name="x" size={20} /></button>
            <h3 className="jp-modal-title" style={{ color: '#a855f7' }}>Provably Fair Round</h3>
            {provablyLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '13px' }}><Icon name="refresh-cw" size={16} className="jp-spin" />Loading hash details...</div>
            ) : (
              <>
                <div className="jp-fair-summary">
                  <div className="jp-fair-mini"><span>Round</span><strong>#{provablyData?.nonce || currentRoundRef.current.nonce}</strong></div>
                  <div className="jp-fair-mini"><span>Crash</span><strong>{Number(provablyData?.crashPoint || currentRoundRef.current.crashPoint).toFixed(2)}x</strong></div>
                </div>
                <HashLine label="Server Seed Hash" value={provablyData?.serverSeedHash || currentRoundRef.current.serverSeedHash} />
                <HashLine label="Round Hash" value={provablyData?.roundHash || currentRoundRef.current.roundHash} />
                <HashLine label="Client Seed" value={provablyData?.clientSeed || currentRoundRef.current.clientSeed} />
                <HashLine label="Verify Input" value={provablyData?.verifyInput || currentRoundRef.current.verifyInput} />
                <HashLine label="Revealed Server Seed" value={provablyData?.serverSeed || currentRoundRef.current.serverSeed || 'Available after round close'} />
                <HashLine label="Algorithm" value={provablyData?.algorithm || currentRoundRef.current.algorithm || 'HMAC_SHA256'} />
                <button onClick={() => fetchProvablyRound(currentRoundRef.current.nonce, true)} className="jp-modal-btn jp-btn-purple">REFRESH HASH DETAILS</button>
              </>
            )}
          </div>
        </div>
      )}



      <style dangerouslySetInnerHTML={{ __html: `
        /* === BASE === */
        .jp-cockpit {
          background: #020617;
          color: #f8fafc;
          min-height: 100vh;
          min-height: 100dvh;
          height: 100dvh;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* === TOASTS === */
        .jp-toast-container {
          position: fixed;
          top: calc(70px + env(safe-area-inset-top, 0px));
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 92%;
          max-width: 420px;
          pointer-events: none;
        }
        .jp-toast {
          background: rgba(15, 23, 42, 0.96);
          color: #fff;
          padding: 11px 14px;
          border-radius: 12px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.6);
          font-weight: 750;
          font-size: 12.5px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          pointer-events: auto;
          animation: jpSlideDown 0.3s ease-out;
        }
        @keyframes jpSlideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* === HEADER === */
        .jp-header {
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          padding-top: calc(10px + env(safe-area-inset-top, 0px));
          padding-left: calc(16px + env(safe-area-inset-left, 0px));
          padding-right: calc(16px + env(safe-area-inset-right, 0px));
          flex-shrink: 0;
          z-index: 50;
          gap: 8px;
        }
        .jp-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .jp-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .jp-brand-text {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -1px;
          background: linear-gradient(to right, #fff, #94a3b8);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          white-space: nowrap;
        }
        .jp-brand-accent {
          background: linear-gradient(135deg, #22c55e, #86efac);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .jp-fair-btn {
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.3);
          color: #22c55e;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }
        .jp-icon-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .jp-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .jp-rain-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          padding: 5px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }
        .jp-rain-btn.jp-active { background: #38bdf8; color: #0f172a; border-color: #38bdf8; }
        .jp-profile-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #fff;
          padding: 5px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }
        .jp-wallet-pill {
          display: flex;
          align-items: center;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 2px 2px 2px 10px;
          border-radius: 30px;
          gap: 2px;
          flex-shrink: 0;
        }
        .jp-wallet-balance {
          background: transparent;
          border: none;
          color: #22c55e;
          font-weight: 900;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .jp-wallet-balance:hover { background: rgba(34,197,94,0.1); }
        .jp-deposit-btn {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          color: #fff;
          font-weight: 900;
          padding: 7px 14px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 11px;
          white-space: nowrap;
        }

        /* === HISTORY TAPE === */
        .jp-history-tape {
          display: flex;
          gap: 7px;
          background: radial-gradient(circle at top, rgba(30,41,59,0.72), #020617 70%);
          padding: 8px 16px;
          overflow-x: auto;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          perspective: 700px;
        }
        .jp-history-tape::-webkit-scrollbar { height: 3px; }
        .jp-history-tape::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
        .jp-history-chip {
          padding: 5px 12px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 950;
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 12px rgba(0,0,0,0.4);
        }
        .jp-history-low { background: linear-gradient(145deg, rgba(51,65,85,0.98), rgba(15,23,42,0.98)); color: #cbd5e1; }
        .jp-history-high { background: linear-gradient(145deg, #c084fc, #7e22ce 48%, #3b0764); color: #fff; }
        .jp-history-ultra { background: linear-gradient(145deg, #fde68a, #f59e0b 36%, #7c2d12); color: #fff7ed; }

        /* === LAYOUT === */
        .jp-layout {
          flex: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 310px;
          padding: 12px;
          gap: 12px;
          box-sizing: border-box;
          min-height: 0;
          overflow: hidden;
        }
        .jp-panel {
          background: rgba(15,23,42,0.6);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .jp-live-below-decks {
          flex: 1 0 auto;
          height: auto;
          min-height: 360px;
          max-height: 520px;
        }
        .jp-panel-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          min-height: 0;
        }
        .jp-panel-scroll::-webkit-scrollbar { width: 5px; }
        .jp-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }

        /* === TABS === */
        .jp-tab-bar { display: flex; background: rgba(0,0,0,0.2); padding: 3px; flex-shrink: 0; }
        .jp-tab {
          flex: 1; padding: 10px; background: transparent; border: none;
          color: #94a3b8; font-size: 10px; font-weight: 800; border-radius: 8px; cursor: pointer;
        }
        .jp-tab.jp-active { background: rgba(255,255,255,0.06); color: #fff; }

        /* === LIVE SUMMARY BAR === */
        .jp-live-summary-bar {
          display: grid;
          grid-template-columns: 0.95fr 1px 1.15fr 1px 1.15fr;
          align-items: center;
          background: rgba(4, 7, 15, 0.75);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          padding: 7px 10px;
          gap: 7px;
          flex-shrink: 0;
        }
        .jp-live-summary-card {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .jp-live-summary-header {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .jp-live-summary-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .jp-dot-pilots {
          background: #a855f7;
          box-shadow: 0 0 6px #a855f7;
        }
        .jp-dot-placed {
          background: #38bdf8;
          box-shadow: 0 0 6px #38bdf8;
        }
        .jp-dot-won {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: jpWonPulse 1.5s infinite;
        }
        .jp-live-summary-label {
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .jp-live-summary-value {
          font-size: 11.5px;
          font-weight: 950;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .jp-val-pilots {
          color: #e2e8f0;
        }
        .jp-val-placed {
          color: #f1f5f9;
        }
        .jp-val-won {
          color: #22c55e;
          text-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
        }
        .jp-live-summary-divider {
          height: 22px;
          background: rgba(255, 255, 255, 0.08);
          width: 1px;
        }
        .jp-live-dot-pulse {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          margin-right: 6px;
          vertical-align: middle;
          animation: jpLivePulse 1.8s infinite;
        }
        @keyframes jpLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes jpWonPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }

        /* === LIVE BETS (Official Spribe Aviator 4-Column Layout: Player | Bet KES | X | Win KES) === */
        .jp-live-table-head {
          display: grid;
          grid-template-columns: minmax(85px, 1.35fr) minmax(70px, 1fr) minmax(46px, 0.7fr) minmax(75px, 1fr);
          gap: 6px;
          color: #8e9ba8;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 14px 6px;
        }
        .jp-col-player { text-align: left; }
        .jp-col-bet { text-align: right; }
        .jp-col-mult { text-align: right; }
        .jp-col-win { text-align: right; }

        .jp-live-row {
          display: grid;
          grid-template-columns: minmax(85px, 1.35fr) minmax(70px, 1fr) minmax(46px, 0.7fr) minmax(75px, 1fr);
          gap: 6px;
          align-items: center;
          padding: 4px 12px;
          background: #111215;
          border: 1px solid rgba(255, 255, 255, 0.035);
          border-radius: 999px;
          font-size: 11.5px;
          margin-bottom: 4px;
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
          content-visibility: auto;
          contain-intrinsic-size: 34px;
        }
        .jp-live-row-won {
          background: #193114 !important;
          border-color: rgba(74, 222, 128, 0.32) !important;
          box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.08);
        }
        .jp-live-player-cell {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .jp-live-user {
          display: block;
          color: #f1f5f9;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11.5px;
        }
        .jp-live-bet-cell {
          text-align: right;
          color: #cbd5e1;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-size: 11.5px;
        }
        .jp-live-mult-cell {
          text-align: right;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          font-size: 11.5px;
        }
        .jp-live-win-cell {
          text-align: right;
          color: #f8fafc;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-size: 11.5px;
        }
        .jp-empty-state { height: 70%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #64748b; font-size: 12px; gap: 6px; text-align: center; }

        /* === MY BETS HISTORY === */
        .jp-my-bets-stats-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 10px;
          margin-bottom: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          gap: 8px;
        }
        .jp-my-stat-chip {
          display: flex;
          flex-direction: column;
        }
        .jp-my-stat-label {
          font-size: 8.5px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .jp-my-stat-val {
          font-size: 11.5px;
          font-weight: 900;
          color: #f8fafc;
          font-variant-numeric: tabular-nums;
        }
        .jp-my-stat-green { color: #22c55e; }
        .jp-my-stat-rose { color: #ef4444; }

        .jp-my-bets-head {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr 1.1fr;
          font-size: 9.5px;
          font-weight: 900;
          color: #64748b;
          text-transform: uppercase;
          padding: 4px 8px 7px;
          letter-spacing: 0.03em;
        }

        .jp-my-bet-card {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr 1.1fr;
          align-items: center;
          padding: 7px 10px;
          margin-bottom: 5px;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .jp-my-bet-card:hover {
          background: rgba(15, 23, 42, 0.85);
        }
        .jp-my-bet-card-won {
          border-left: 3px solid #22c55e;
          background: rgba(34, 197, 94, 0.05);
        }
        .jp-my-bet-card-lost {
          border-left: 3px solid rgba(239, 68, 68, 0.7);
          background: rgba(239, 68, 68, 0.02);
        }
        .jp-my-bet-card-active {
          border-left: 3px solid #38bdf8;
          background: rgba(56, 189, 248, 0.06);
        }

        .jp-my-deck-badge {
          font-size: 8px;
          font-weight: 950;
          padding: 1.5px 5px;
          border-radius: 4px;
          letter-spacing: 0.02em;
        }
        .jp-deck-a-badge {
          background: rgba(34, 197, 94, 0.18);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.35);
        }
        .jp-deck-b-badge {
          background: rgba(14, 165, 233, 0.18);
          color: #38bdf8;
          border: 1px solid rgba(14, 165, 233, 0.35);
        }

        .jp-my-bet-round {
          font-size: 11px;
          font-weight: 800;
          color: #f8fafc;
        }
        .jp-my-bet-time {
          font-size: 9px;
          color: #64748b;
          font-weight: 600;
          display: block;
        }
        .jp-my-bet-stake {
          font-size: 11px;
          font-weight: 800;
          color: #f8fafc;
          font-variant-numeric: tabular-nums;
          display: block;
        }
        .jp-my-bet-autocash {
          font-size: 8.5px;
          color: #94a3b8;
          display: block;
        }
        .jp-my-bet-payout {
          font-size: 11px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          display: block;
        }
        .jp-payout-won { color: #22c55e; }
        .jp-payout-lost { color: #ef4444; }
        .jp-payout-active { color: #38bdf8; }

        /* === DEDICATED PROFILE TAB (Kenyan Market Standard) === */
        .jp-profile-scroll {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 8px 4px;
        }
        .jp-profile-card {
          background: #11141c;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .jp-profile-header-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .jp-profile-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .jp-profile-online-badge {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #11141c;
        }
        .jp-profile-id-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .jp-profile-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jp-profile-main-name {
          font-size: 15px;
          font-weight: 900;
          color: #ffffff;
        }
        .jp-bclb-badge {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.35);
          color: #4ade80;
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.04em;
        }
        .jp-profile-tags-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #94a3b8;
          font-weight: 700;
        }
        .jp-kyc-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #38bdf8;
        }
        .jp-currency-tag {
          color: #64748b;
        }
        .jp-profile-account-id-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(56, 189, 248, 0.06);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 9px;
          padding: 8px 12px;
          margin-top: 4px;
        }
        .jp-account-id-label-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .jp-account-id-sub {
          font-size: 9px;
          color: #64748b;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .jp-account-id-code {
          font-size: 16px;
          font-weight: 900;
          color: #38bdf8;
          font-family: ui-monospace, SFMono-Regular, monospace;
          letter-spacing: 0.18em;
        }
        .jp-account-id-copy-btn {
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s ease;
        }
        .jp-account-id-copy-btn.copied {
          background: rgba(34, 197, 94, 0.2);
          border-color: #22c55e;
          color: #22c55e;
        }

        .jp-card-section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 900;
          color: #94a3b8;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .jp-wallet-balance-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          background: rgba(0, 0, 0, 0.3);
          padding: 8px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.03);
        }
        .jp-wallet-balance-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .jp-balance-cell-label {
          font-size: 8.5px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .jp-balance-cell-val {
          font-size: 13px;
          font-weight: 900;
          color: #cbd5e1;
        }
        .jp-green-text {
          color: #22c55e !important;
        }
        .jp-rose-text {
          color: #f43f5e !important;
        }

        .jp-profile-wallet-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 4px;
        }
        .jp-profile-action-btn {
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 11.5px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: filter 0.15s ease;
        }
        .jp-btn-deposit-mpesa {
          background: linear-gradient(135deg, #16a34a, #15803d);
          border: 1px solid #22c55e;
          color: #ffffff;
        }
        .jp-btn-withdraw-mpesa {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #f59e0b;
        }
        .jp-profile-action-btn:hover {
          filter: brightness(1.1);
        }

        .jp-input-group-vertical {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .jp-profile-input-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 9.5px;
          font-weight: 800;
          color: #8e9ba8;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .jp-mpesa-active-pill {
          font-size: 9px;
          color: #22c55e;
          font-weight: 800;
        }
        .jp-phone-input-wrap {
          display: flex;
          align-items: center;
          background: #0b0d13;
          border: 1px solid #1f2533;
          border-radius: 8px;
          overflow: hidden;
        }
        .jp-phone-prefix {
          padding: 8px 10px;
          background: #141824;
          color: #8e9ba8;
          font-size: 12px;
          font-weight: 800;
          border-right: 1px solid #1f2533;
        }
        .jp-profile-text-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #f1f5f9;
          font-size: 13px;
          font-weight: 700;
          padding: 8px 10px;
          outline: none;
        }
        .jp-profile-text-input.jp-input-disabled {
          color: #64748b;
          cursor: not-allowed;
          background: #090a0f;
        }
        .jp-input-helper-text {
          font-size: 9px;
          color: #64748b;
          line-height: 1.3;
        }

        .jp-stats-4grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }
        .jp-stat-tile {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .jp-stat-tile-label {
          font-size: 8.5px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
        }
        .jp-stat-tile-val {
          font-size: 13.5px;
          font-weight: 900;
          color: #f1f5f9;
        }
        .jp-stat-secondary-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .jp-stat-mini-pill {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 9.5px;
          color: #8e9ba8;
          font-weight: 700;
        }

        .jp-save-profile-btn {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 1px solid #38bdf8;
          border-radius: 8px;
          color: #ffffff;
          padding: 9px 14px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 4px;
          transition: filter 0.15s ease;
        }
        .jp-save-profile-btn:hover {
          filter: brightness(1.1);
        }

        .jp-bclb-card {
          border-color: rgba(34, 197, 94, 0.2);
          background: linear-gradient(180deg, rgba(22, 101, 52, 0.08) 0%, rgba(17, 20, 28, 0.95) 100%);
        }
        .jp-bclb-header {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #4ade80;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }
        .jp-bclb-text {
          margin: 0;
          font-size: 9.5px;
          color: #94a3b8;
          line-height: 1.4;
        }
        .jp-bclb-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jp-limit-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          color: #cbd5e1;
          background: rgba(0, 0, 0, 0.35);
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .jp-limit-label {
          color: #64748b;
          font-weight: 800;
        }
        .jp-limit-val {
          color: #f1f5f9;
          font-weight: 900;
        }
        .jp-provably-verify-btn {
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.35);
          color: #c084fc;
          font-size: 9.5px;
          font-weight: 800;
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .jp-provably-verify-btn:hover {
          background: rgba(168, 85, 247, 0.2);
        }

        .jp-signout-btn {
          width: 100%;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          font-size: 11.5px;
          font-weight: 800;
          padding: 9px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .jp-signout-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .jp-bet-history-row { display: flex; justify-content: space-between; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 8px; margin-bottom: 5px; font-size: 11px; border: 1px solid rgba(255,255,255,0.02); }
        .jp-bet-history-round { color: #64748b; display: block; font-size: 9px; }
        .jp-bet-history-stake { font-weight: 800; }
        .jp-bet-history-mult { color: #22c55e; font-weight: 900; display: block; }
        .jp-bet-history-yield { color: #94a3b8; font-size: 10px; }

        /* === CENTER PANEL === */
        .jp-center-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          height: 100%;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }
        .jp-center-panel::-webkit-scrollbar { width: 5px; }
        .jp-center-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }
        .jp-canvas-container {
          flex: 0 0 auto;
          height: clamp(230px, 36vh, 340px);
          min-height: 220px;
          background: #020306;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.05);
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 0 40px rgba(0,0,0,0.9);
        }
        .jp-idle-overlay {
          position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(15,23,42,0.95) 0%, rgba(2,6,23,0.98) 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10;
          animation: jpFadeIn 0.2s ease-out;
        }
        .jp-countdown-timer-wrap {
          display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .jp-countdown-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px;
          background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: #4ade80;
          font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 6px;
        }
        .jp-countdown-clock-icon { color: #4ade80; animation: jpPulse 1.2s infinite; }
        .jp-countdown-digital {
          display: flex; align-items: baseline; justify-content: center;
        }
        .jp-countdown-digits {
          font-size: clamp(34px, 7vw, 56px); font-weight: 950; color: #ffffff;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, monospace;
          letter-spacing: -1.5px; text-shadow: 0 0 24px rgba(34,197,94,0.55), 0 2px 8px rgba(0,0,0,0.8);
          line-height: 1;
        }
        .jp-progress-track {
          width: 75%; max-width: 320px; height: 9px; background: rgba(0,0,0,0.65);
          padding: 2px; border-radius: 999px; border: 1px solid rgba(34,197,94,0.35);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.7), 0 0 16px rgba(34,197,94,0.2);
          overflow: hidden;
        }
        .jp-progress-fill {
          height: 100%; background: linear-gradient(90deg, #16a34a 0%, #22c55e 50%, #4ade80 100%);
          border-radius: 999px; box-shadow: 0 0 12px rgba(34,197,94,0.8);
          will-change: width;
        }
        .jp-idle-text {
          color: #f8fafc; font-size: 12px; font-weight: 900; margin-top: 14px;
          letter-spacing: 1px; text-align: center; text-transform: uppercase;
        }
        .jp-idle-sub {
          color: #94a3b8; font-size: 11px; font-weight: 700; margin-top: 4px;
        }
        @keyframes jpPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.92); }
        }
        @keyframes jpFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .jp-multiplier-overlay { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none; }
        .jp-multiplier-text { font-size: clamp(36px, 8vw, 96px); font-weight: 900; color: #fff; margin: 0; letter-spacing: -2px; text-shadow: 0 0 30px rgba(255,255,255,0.2); }
        .jp-crashed-title { color: #e11d48; font-size: clamp(24px, 5vw, 52px); font-weight: 900; margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .jp-crash-icon { padding: 6px; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; }
        .jp-crashed-sub { color: #475569; font-size: 13px; font-weight: 800; }

        /* === DECK PANEL === */
        /* === MOTIVATIONAL BETTING DECKS === */
        .jp-deck-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 10px;
          border-radius: 16px;
          flex-shrink: 0;
        }
        .jp-deck-panel {
          background: #11141a;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 10px 12px;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Top centered Bet / Auto capsule */
        .jp-deck-tab-wrap {
          display: flex;
          justify-content: center;
          width: 100%;
        }
        .jp-deck-tabs {
          display: inline-flex;
          background: #1a1e27;
          border-radius: 999px;
          padding: 3px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .jp-deck-tab-btn {
          border: none;
          border-radius: 999px;
          padding: 3px 20px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          color: #8e9ba8;
          background: transparent;
          transition: all 0.15s ease;
        }
        .jp-deck-tab-btn.active {
          background: #2b313d;
          color: #ffffff;
        }

        /* Main Row: Left Column (wager + 2x2 grid) & Right Column (Amber BET button) */
        .jp-deck-main-row {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 10px;
          align-items: stretch;
        }
        .jp-deck-left-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
          justify-content: center;
        }

        /* Stepper [-] Wager [+] */
        .jp-stepper-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #000000;
          border: 1.5px solid #232b38;
          border-radius: 999px;
          padding: 3px 8px;
          height: 38px;
          box-sizing: border-box;
          gap: 6px;
        }
        .jp-stepper-btn {
          width: 24px;
          height: 24px;
          min-width: 24px;
          border-radius: 50%;
          border: 1.5px solid #475569;
          background: #111827;
          color: #cbd5e1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .jp-stepper-btn:hover {
          border-color: #94a3b8;
          background: #1e293b;
          color: #ffffff;
        }
        .jp-stepper-btn:active {
          transform: scale(0.92);
          background: #334155;
          border-color: #60a5fa;
        }
        .jp-stepper-input {
          flex: 1;
          width: 100%;
          min-width: 0;
          background: transparent;
          border: none;
          color: #ffffff;
          font-weight: 900;
          text-align: center;
          font-size: 16px;
          font-family: inherit;
          outline: none;
          padding: 0;
          -moz-appearance: textfield;
        }
        .jp-stepper-input::-webkit-outer-spin-button,
        .jp-stepper-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        /* 2x2 Quick Stake Grid: 50, 100, 250, 500 */
        .jp-quick-grid-2x2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
        }
        .jp-quick-grid-btn {
          background: #141821;
          border: 1px solid #202634;
          border-radius: 999px;
          padding: 4px 0;
          font-size: 11px;
          font-weight: 800;
          color: #8e9ba8;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s ease;
        }
        .jp-quick-grid-btn:hover {
          background: #1f2533;
          color: #ffffff;
        }
        .jp-quick-grid-btn.active {
          border-color: #3b82f6;
          color: #60a5fa;
        }

        /* Right Column: Spribe Aviator Action Buttons */
        .jp-deck-right-col {
          display: flex;
          width: 100%;
          height: 100%;
        }
        .jp-action-btn {
          width: 100%;
          height: 100%;
          min-height: 72px;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          transition: filter 0.15s ease, transform 0.05s ease, background 0.2s ease;
          box-sizing: border-box;
        }

        /* 1. Prestake / Ready State (Classic Spribe Vibrant Green) */
        .jp-action-btn.jp-bet-mode {
          background: #28a745;
          background: linear-gradient(180deg, #2eb85c 0%, #218838 100%);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(40, 167, 69, 0.45);
        }
        .jp-action-btn.jp-bet-mode:hover {
          filter: brightness(1.08);
          box-shadow: 0 6px 18px rgba(40, 167, 69, 0.55);
        }
        .jp-action-btn.jp-bet-mode:active {
          transform: scale(0.98);
        }

        /* 2. Queued / Cancel State (Spribe Cancel Red) */
        .jp-action-btn.jp-bet-mode.queued {
          background: #dc3545 !important;
          background: linear-gradient(180deg, #e02f44 0%, #c82333 100%) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 14px rgba(220, 53, 69, 0.45) !important;
        }
        .jp-action-btn.jp-bet-mode.queued:hover {
          filter: brightness(1.08) !important;
        }

        /* 3. Auto Bet Active State */
        .jp-action-btn.jp-bet-mode.auto-active {
          background: #28a745;
          background: linear-gradient(180deg, #2eb85c 0%, #218838 100%);
          color: #ffffff;
        }

        /* 4. In-Flight Cash Out State (Spribe Amber / Orange) */
        .jp-action-btn.jp-cashout-mode {
          background: #f59e0b !important;
          background: linear-gradient(180deg, #ff9f43 0%, #d97706 100%) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 16px rgba(245, 158, 11, 0.5) !important;
        }
        .jp-action-btn.jp-cashout-mode:hover {
          filter: brightness(1.08) !important;
        }
        .jp-action-btn.jp-cashout-mode:active {
          transform: scale(0.98);
        }

        .jp-action-label {
          font-size: 19px;
          font-weight: 900;
          letter-spacing: 0.02em;
          line-height: 1.1;
        }
        .jp-action-sub {
          font-size: 13px;
          font-weight: 800;
          line-height: 1.1;
        }

        /* Single-Line Bottom Row in Auto Mode */
        .jp-deck-auto-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 4px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .jp-auto-inline-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .jp-auto-inline-label {
          font-size: 10px;
          font-weight: 700;
          color: #8e9ba8;
          white-space: nowrap;
        }
        .jp-toggle-pill {
          width: 34px;
          height: 19px;
          border-radius: 999px;
          background: #282f3c;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 2px;
          cursor: pointer;
          display: flex;
          align-items: center;
          position: relative;
          transition: background 0.2s ease;
          box-sizing: border-box;
        }
        .jp-toggle-pill.active {
          background: #22c55e;
          border-color: #22c55e;
        }
        .jp-toggle-knob {
          display: block;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s ease;
          transform: translateX(0);
        }
        .jp-toggle-pill.active .jp-toggle-knob {
          transform: translateX(15px);
        }

        /* Multiplier Input Pill: [ 2.55 x ] */
        .jp-cashout-pill-box {
          display: flex;
          align-items: center;
          background: #000000;
          border: 1px solid #1f2430;
          border-radius: 999px;
          padding: 2px 8px;
          width: 66px;
          height: 25px;
          box-sizing: border-box;
          justify-content: center;
          gap: 3px;
          transition: opacity 0.15s ease;
        }
        .jp-cashout-pill-input {
          width: 100%;
          background: transparent;
          border: none;
          color: #ffffff;
          font-weight: 800;
          font-size: 11px;
          text-align: right;
          outline: none;
          font-family: inherit;
          padding: 0;
          -moz-appearance: textfield;
        }
        .jp-cashout-pill-input::-webkit-outer-spin-button,
        .jp-cashout-pill-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .jp-cashout-pill-suffix {
          color: #8e9ba8;
          font-size: 11px;
          font-weight: 700;
        }

        /* === CHAT === */
        .jp-right-panel { background: #0b141a; box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
        .jp-chat-header { background: #202c33; padding: 12px 14px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-weight: 800; font-size: 13px; color: #e9edef; }
        .jp-chat-dot { width: 8px; height: 8px; border-radius: 50%; background: #00a884; }
        .jp-chat-scroll { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: #0b141a; min-height: 0; }
        .jp-chat-scroll::-webkit-scrollbar { width: 3px; }
        .jp-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
        .jp-chat-bubble { max-width: 88%; padding: 7px 10px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); flex-shrink: 0; }
        .jp-chat-bubble:not(.jp-chat-me) { background: #202c33; align-self: flex-start; }
        .jp-chat-bubble.jp-chat-me { background: #005c4b; align-self: flex-end; }
        .jp-chat-user { color: #30d6b5; font-weight: 800; font-size: 10px; }
        .jp-chat-msg { color: #e9edef; font-size: 12px; line-height: 1.4; word-break: break-word; display: block; }
        .jp-chat-time { display: block; text-align: right; font-size: 8px; color: rgba(255,255,255,0.35); margin-top: 3px; }
        .jp-chat-input-row { padding: 8px 10px; background: #202c33; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .jp-chat-input { flex: 1; padding: 9px 12px; background: #2a3942; border: none; color: #fff; border-radius: 8px; font-size: 12px; min-width: 0; }
        .jp-chat-input:focus { outline: 1px solid #00a884; }
        .jp-chat-input:disabled { opacity: 0.5; cursor: not-allowed; }
        .jp-chat-send { background: #00a884; border: none; width: 34px; height: 34px; border-radius: 50%; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        /* === MOBILE FOOTER === */
        .jp-mobile-footer {
          background: #0c0d12; border-top: 1px solid rgba(255,255,255,0.06);
          display: none; justify-content: space-around; padding: 8px 0;
          padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
          position: sticky; bottom: 0; z-index: 999; flex-shrink: 0;
        }
        .jp-mobile-tab {
          background: transparent; border: none; color: #64748b; font-size: 10px; font-weight: 800;
          cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 4px 10px; border-radius: 8px;
        }
        .jp-mobile-tab.jp-active { color: #22c55e; }

        /* === MODALS === */
        .jp-modal-overlay {
          position: fixed; inset: 0; background: rgba(2,6,23,0.88);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 16px; animation: jpFadeIn 0.2s ease-out;
        }
        @keyframes jpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .jp-modal-box {
          background: #0f172a; border-radius: 18px; width: 100%; max-width: 400px;
          padding: 24px; position: relative; box-shadow: 0 24px 60px rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.08); animation: jpSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);
          max-height: 90vh; overflow-y: auto;
        }
        @keyframes jpSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .jp-modal-green { border-color: #22c55e; }
        .jp-modal-blue { border-color: #38bdf8; }
        .jp-modal-orange { border-color: #f59e0b; }
        .jp-modal-purple { border-color: #a855f7; max-width: 500px; }
        .jp-modal-profile {
          max-width: 520px !important;
          background: #0d1017 !important;
          border: 1px solid rgba(56, 189, 248, 0.35) !important;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.1) !important;
          padding: 20px !important;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 88vh !important;
          overflow-y: auto !important;
        }
        .jp-profile-modal-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-right: 28px;
        }
        .jp-modal-close { position: absolute; top: 12px; right: 14px; background: transparent; border: none; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; }
        .jp-modal-close:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .jp-modal-title { margin: 0 0 14px; font-weight: 900; font-size: 17px; }
        .jp-modal-field { margin-bottom: 14px; }
        .jp-modal-label { display: block; font-size: 10px; color: #94a3b8; font-weight: 800; margin-bottom: 5px; }
        .jp-modal-input { width: 100%; padding: 11px; background: #020617; border: 1px solid rgba(255,255,255,0.08); color: #fff; font-size: 14px; border-radius: 10px; box-sizing: border-box; }
        .jp-modal-input:focus { outline: none; border-color: #3b82f6; }
        .jp-modal-input.jp-disabled { opacity: 0.6; cursor: not-allowed; }
        .jp-modal-balance { color: #94a3b8; font-size: 12px; margin-bottom: 12px; }
        .jp-modal-btn { width: 100%; padding: 13px; border: none; color: #fff; font-weight: 900; border-radius: 10px; cursor: pointer; }
        .jp-modal-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .jp-btn-green { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .jp-btn-blue { background: linear-gradient(135deg, #38bdf8, #0284c7); }
        .jp-btn-orange { background: linear-gradient(135deg, #f59e0b, #b45309); }
        .jp-btn-purple { background: linear-gradient(135deg, #a855f7, #6b21a8); margin-top: 6px; }
        .jp-fair-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
        .jp-fair-mini { background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.22); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 3px; color: #c4b5fd; font-size: 10px; font-weight: 900; }
        .jp-hash-line { margin-bottom: 10px; }
        .jp-hash-box { background: #020617; border: 1px solid rgba(255,255,255,0.08); color: #e2e8f0; padding: 8px; border-radius: 8px; font-size: 10px; line-height: 1.4; word-break: break-all; font-family: monospace; }
        .jp-spin { animation: jpSpin 1s linear infinite; }
        @keyframes jpSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* === RESPONSIVE: MEDIUM DESKTOP === */
        @media (max-width: 1180px) {
          .jp-layout { grid-template-columns: minmax(0,1fr) 270px !important; gap: 10px !important; padding: 10px !important; }
        }

        /* === RESPONSIVE: TABLET === */
        @media (max-width: 992px) {
          .jp-layout {
            grid-template-columns: 1fr !important;
            padding: 6px !important;
            padding-bottom: 56px !important;
            overflow: hidden !important;
          }
          .jp-mobile-footer { display: flex !important; }
          .jp-center-panel, .jp-right-panel { display: none !important; }
          .jp-center-panel[data-active="true"],
          .jp-right-panel[data-active="true"] {
            display: flex !important;
            height: 100% !important;
          }
          .jp-canvas-container { height: 225px !important; min-height: 215px !important; flex: 0 0 auto !important; }
          .jp-deck-grid { max-height: none !important; padding: 6px !important; gap: 6px !important; flex-shrink: 0 !important; }
          .jp-live-below-decks { min-height: 340px !important; max-height: 480px !important; flex-shrink: 0 !important; }
          .jp-deck-panel { padding: 8px !important; gap: 6px !important; }
          .jp-action-btn, .jp-bet-button, .jp-cashout-button { padding: 6px 4px !important; min-height: 54px !important; }
          .jp-header { flex-wrap: wrap; padding: 8px 10px !important; }
          .jp-brand-text { font-size: 18px !important; }
        }

        /* === RESPONSIVE: MOBILE === */
        @media (max-width: 560px) {
          .jp-canvas-container { min-height: 190px !important; border-radius: 12px !important; }
          .jp-deck-grid { gap: 6px !important; border-radius: 12px !important; max-height: none !important; }
          .jp-stepper-box { height: 32px !important; padding: 2px 6px !important; }
          .jp-stepper-input { font-size: 13px !important; }
          .jp-quick-grid-btn { font-size: 10px !important; padding: 3px 0 !important; }
          .jp-action-label { font-size: 15px !important; }
          .jp-action-sub { font-size: 11px !important; }
          .jp-action-btn { min-height: 60px !important; }
          .jp-multiplier-text { font-size: 2.8rem !important; }
          .jp-crashed-title { font-size: 1.8rem !important; }
          .jp-idle-text { font-size: 11px !important; }
          .jp-profile-label, .jp-rain-label, .jp-fair-label { display: none; }
          .jp-fair-btn { padding: 4px 6px !important; }
          .jp-live-table-head { padding: 4px 8px !important; font-size: 10px !important; }
          .jp-live-row { padding: 3px 8px !important; font-size: 10.5px !important; }
          .jp-live-user, .jp-live-bet-cell, .jp-live-mult-cell, .jp-live-win-cell { font-size: 10.5px !important; }
        }

        /* === RESPONSIVE: TINY PHONES (<380px) === */
        @media (max-width: 380px) {
          .jp-header { gap: 4px !important; padding: 6px 6px !important; }
          .jp-header-right { gap: 4px !important; }
          .jp-wallet-amount { display: none; }
          .jp-wallet-balance { padding: 4px 6px !important; font-size: 11px !important; }
          .jp-deposit-btn { padding: 6px 10px !important; font-size: 10px !important; }
          .jp-brand-text { font-size: 16px !important; }
          .jp-multiplier-text { font-size: 2.2rem !important; }
          .jp-crashed-title { font-size: 1.5rem !important; }
          .jp-deck-grid { max-height: none !important; }
        }

        /* === RESPONSIVE: LANDSCAPE MOBILE === */
        @media (max-height: 500px) and (orientation: landscape) {
          .jp-layout { padding-bottom: 48px !important; }
          .jp-canvas-container { min-height: 120px !important; }
          .jp-deck-grid { max-height: none !important; gap: 4px !important; padding: 4px !important; }
          .jp-deck-panel { gap: 4px !important; padding: 4px !important; }
          .jp-action-btn, .jp-bet-button, .jp-cashout-button { min-height: 44px !important; padding: 4px !important; }
          .jp-history-tape { padding: 4px 10px !important; }
          .jp-idle-text { font-size: 10px !important; margin-top: 6px !important; }
        }
      ` }} />
    </div>
  );
}

function HashLine({ label, value }) {
  return (
    <div className="jp-hash-line">
      <label className="jp-modal-label">{label}</label>
      <div className="jp-hash-box">{value || 'Unavailable'}</div>
    </div>
  );
}
