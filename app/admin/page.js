'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

export default function JetPesaAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('radar'); // 'radar' | 'overview' | 'users' | 'bets' | 'ledger'
  const [overviewData, setOverviewData] = useState(null);
  const [roundsData, setRoundsData] = useState([]);
  const [pastRoundsData, setPastRoundsData] = useState([]);
  const [inFlightStats, setInFlightStats] = useState(null);
  const [dailyStats, setDailyStats] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dailyTab, setDailyTab] = useState('summary'); // 'summary' | 'payins' | 'payouts'
  const [currentCycleState, setCurrentCycleState] = useState(null);
  const [usersData, setUsersData] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [betsData, setBetsData] = useState([]);
  const [ledgerData, setLedgerData] = useState({ deposits: [], withdrawals: [] });

  // TAB 6: Penalty Shootout Engine State
  const [penaltySettings, setPenaltySettings] = useState(null);
  const [penaltyStats, setPenaltyStats] = useState(null);
  const [penaltyPresets, setPenaltyPresets] = useState({});
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [penaltySaving, setPenaltySaving] = useState(false);
  const [penaltyStepsCount, setPenaltyStepsCount] = useState(8);
  const [penaltyMultipliers, setPenaltyMultipliers] = useState([1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.00]);
  const [penaltyGoalProb, setPenaltyGoalProb] = useState(75);
  const [penaltyMinBet, setPenaltyMinBet] = useState(10);
  const [penaltyMaxBet, setPenaltyMaxBet] = useState(40000);

  // TAB 7: All Games Command Center State
  const [selectedAdminGame, setSelectedAdminGame] = useState('mines');
  const [gamesOverview, setGamesOverview] = useState(null);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedGameRounds, setSelectedGameRounds] = useState([]);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [gameConfigDraft, setGameConfigDraft] = useState(null);
  const [gameSaving, setGameSaving] = useState(false);

  const [overrideModal, setOverrideModal] = useState({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' });
  const [adjustModal, setAdjustModal] = useState({ open: false, user: null, amount: '', reason: '' });
  const [instantCrashing, setInstantCrashing] = useState(false);
  const [toast, setToast] = useState(null);

  // TOP PANEL: Independent Round Profit Target state (focuses on all rounds real wagers profit lock)
  const [roundProfitInput, setRoundProfitInput] = useState('50');
  const [roundProfitMode, setRoundProfitMode] = useState('percent'); // 'percent' | 'kes'
  const [roundProfitEnabled, setRoundProfitEnabled] = useState(false);
  const [roundProfitLoading, setRoundProfitLoading] = useState(false);
  const [roundProfitApplied, setRoundProfitApplied] = useState({ mode: 'percent', value: 50, percent: 50, customKes: 500 });
  const roundInputFocusedRef = useRef(false);
  const roundInputDirtyRef = useRef(false);
  const roundMutationLockRef = useRef(0);

  // RIGHT PANEL: Independent House Profit Engine & Daily Target state (player accounts & pay-ins protection)
  const [dailyTargetInput, setDailyTargetInput] = useState('50');
  const [dailyTargetMode, setDailyTargetMode] = useState('percent'); // 'percent' | 'kes'
  const [dailyTargetEnabled, setDailyTargetEnabled] = useState(false);
  const [dailyTargetLoading, setDailyTargetLoading] = useState(false);
  const [dailyTargetApplied, setDailyTargetApplied] = useState({ mode: 'percent', value: 50, percent: 50, customKes: 2500 });
  const [houseProfitEngine, setHouseProfitEngine] = useState(null);
  const dailyInputFocusedRef = useRef(false);
  const dailyInputDirtyRef = useRef(false);
  const dailyMutationLockRef = useRef(0);

  const pollTimerRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getStoredSecret = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('jetpesa_admin_secret') || '';
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Access Denied: Invalid Admin Secret.');
      }

      localStorage.setItem('jetpesa_admin_secret', secretInput);
      setIsAuthenticated(true);
      showToast('Super Admin access authenticated.');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {}
    localStorage.removeItem('jetpesa_admin_secret');
    setIsAuthenticated(false);
    setSecretInput('');
  };

  // Authenticated fetch helper
  const adminFetch = useCallback(async (url, options = {}) => {
    const secret = getStoredSecret();
    const headers = {
      ...(options.headers || {}),
      'x-admin-secret': secret,
    };
    return fetch(url, { ...options, headers });
  }, []);

  // Fetch Radar (Current + Next 6 Rounds + Last 5 Past Rounds + Daily Stats)
  const loadRoundsRadar = useCallback(async (dateParam) => {
    try {
      const targetDate = dateParam || selectedDate;
      const res = await adminFetch(`/api/admin/rounds?count=6&pastCount=5&date=${encodeURIComponent(targetDate)}`);
      const data = await res.json();
      if (data.success) {
        setRoundsData(data.rounds || []);
        setPastRoundsData(data.pastRounds || []);
        setCurrentCycleState(data.currentState || null);
        if (data.inFlightStats) setInFlightStats(data.inFlightStats);
        if (data.dailyStats) setDailyStats(data.dailyStats);
        
        // 1. Top Panel: Round Profit Target (All rounds real wagers lock)
        const roundTarget = data.roundProfitTarget || data.globalProfitTarget;
        if (roundTarget && Date.now() > roundMutationLockRef.current) {
          setRoundProfitEnabled(Boolean(roundTarget.enabled));
          const rMode = roundTarget.mode || 'percent';
          const rVal = rMode === 'kes'
            ? Number(roundTarget.customKes ?? roundTarget.value ?? 500)
            : Number(roundTarget.percent ?? roundTarget.value ?? 50);
          setRoundProfitApplied({
            mode: rMode,
            value: rVal,
            percent: Number(roundTarget.percent ?? 50),
            customKes: Number(roundTarget.customKes ?? 500),
          });
          if (!roundInputFocusedRef.current && !roundInputDirtyRef.current) {
            setRoundProfitMode(rMode);
            setRoundProfitInput(String(rVal));
          }
        }

        // 2. Right Panel: House Profit Engine & Daily Target (Player accounts & Pay-Ins Protection)
        if (data.houseProfitEngine) {
          if (Date.now() > dailyMutationLockRef.current) {
            setHouseProfitEngine(data.houseProfitEngine);
            setDailyTargetEnabled(Boolean(data.houseProfitEngine.enabled));
            const dMode = data.houseProfitEngine.mode || 'percent';
            const dVal = dMode === 'kes'
              ? Number(data.houseProfitEngine.customKes ?? data.houseProfitEngine.value ?? 2500)
              : Number(data.houseProfitEngine.targetPercent ?? data.houseProfitEngine.value ?? 50);
            setDailyTargetApplied({
              mode: dMode,
              value: dVal,
              percent: Number(data.houseProfitEngine.targetPercent ?? 50),
              customKes: Number(data.houseProfitEngine.customKes ?? 2500),
            });
            if (!dailyInputFocusedRef.current && !dailyInputDirtyRef.current) {
              setDailyTargetMode(dMode);
              setDailyTargetInput(String(dVal));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Radar error:', e);
    }
  }, [adminFetch, selectedDate]);

  // Fetch Overview Stats
  const loadOverview = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/overview');
      const data = await res.json();
      if (data.success) {
        setOverviewData(data);
        if (data.game) setCurrentCycleState(data.game);
      }
    } catch (e) {
      console.warn('Overview error:', e);
    }
  }, [adminFetch]);

  // Fetch Users
  const loadUsers = useCallback(async (query = '') => {
    try {
      const res = await adminFetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=30`);
      const data = await res.json();
      if (data.success) setUsersData(data.users || []);
    } catch (e) {
      console.warn('Users error:', e);
    }
  }, [adminFetch]);

  // Fetch Bets
  const loadBets = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/bets?limit=40');
      const data = await res.json();
      if (data.success) setBetsData(data.bets || []);
    } catch (e) {
      console.warn('Bets error:', e);
    }
  }, [adminFetch]);

  // Fetch Ledger
  const loadLedger = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/transactions?limit=30');
      const data = await res.json();
      if (data.success) setLedgerData({ deposits: data.deposits || [], withdrawals: data.withdrawals || [] });
    } catch (e) {
      console.warn('Ledger error:', e);
    }
  }, [adminFetch]);

  // Load Penalty Shootout Configuration & Live Stats
  const loadPenaltyAdminData = useCallback(async () => {
    setPenaltyLoading(true);
    try {
      const res = await adminFetch('/api/admin/games/penalty');
      const data = await res.json();
      if (data.success && data.settings) {
        setPenaltySettings(data.settings);
        setPenaltyStepsCount(data.settings.maxShots || data.settings.multipliers.length);
        setPenaltyMultipliers([...data.settings.multipliers]);
        setPenaltyGoalProb(Math.round((data.settings.goalProbability || 0.75) * 100));
        setPenaltyMinBet(data.settings.minBet || 10);
        setPenaltyMaxBet(data.settings.maxBet || 40000);
        if (data.presets) setPenaltyPresets(data.presets);
        if (data.stats) setPenaltyStats(data.stats);
      }
    } catch (e) {
      console.warn('Penalty admin error:', e);
    } finally {
      setPenaltyLoading(false);
    }
  }, [adminFetch]);

  const handleStepCountChange = (newCount) => {
    const count = Math.max(3, Math.min(15, parseInt(newCount, 10) || 3));
    setPenaltyStepsCount(count);
    setPenaltyMultipliers((prev) => {
      const copy = [...prev];
      if (count > copy.length) {
        while (copy.length < count) {
          const last = copy[copy.length - 1] || 1.25;
          const nextVal = parseFloat((last * 1.35).toFixed(2));
          copy.push(nextVal);
        }
      } else if (count < copy.length) {
        copy.splice(count);
      }
      return copy;
    });
  };

  const handleMultiplierChange = (idx, val) => {
    const num = parseFloat(val);
    setPenaltyMultipliers((prev) => {
      const next = [...prev];
      next[idx] = isNaN(num) ? '' : num;
      return next;
    });
  };

  const applyPenaltyPreset = (presetKey) => {
    const p = penaltyPresets[presetKey];
    if (!p) return;
    setPenaltyStepsCount(p.maxShots);
    setPenaltyMultipliers([...p.multipliers]);
    setPenaltyGoalProb(Math.round(p.goalProbability * 100));
    showToast(`Applied preset: ${p.name}`, 'success');
  };

  const handleSavePenaltySettings = async () => {
    setPenaltySaving(true);
    try {
      const cleanMults = penaltyMultipliers.map((m) => parseFloat(Number(m).toFixed(2)));
      for (let i = 0; i < cleanMults.length; i++) {
        if (isNaN(cleanMults[i]) || cleanMults[i] <= 1.0) {
          showToast(`Step ${i + 1} multiplier must be greater than 1.00x`, 'error');
          setPenaltySaving(false);
          return;
        }
        if (i > 0 && cleanMults[i] <= cleanMults[i - 1]) {
          showToast(`Step ${i + 1} (${cleanMults[i]}x) must be greater than step ${i} (${cleanMults[i - 1]}x)`, 'error');
          setPenaltySaving(false);
          return;
        }
      }

      const res = await adminFetch('/api/admin/games/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxShots: cleanMults.length,
          multipliers: cleanMults,
          goalProbability: parseFloat((penaltyGoalProb / 100).toFixed(2)),
          minBet: Number(penaltyMinBet),
          maxBet: Number(penaltyMaxBet),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPenaltySettings(data.settings);
        showToast(data.message || 'Penalty Shootout steps & multipliers updated!', 'success');
        loadPenaltyAdminData();
      } else {
        showToast(data.message || 'Failed to save penalty settings.', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Network error saving settings.', 'error');
    } finally {
      setPenaltySaving(false);
    }
  };

  // Load All Games Telemetry Overview
  const loadGamesOverview = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await adminFetch('/api/admin/games');
      const data = await res.json();
      if (data.success) {
        setGamesOverview(data);
        if (data.games && data.games[selectedAdminGame]?.settings) {
          setGameConfigDraft((prev) => prev || data.games[selectedAdminGame].settings);
        }
      }
    } catch (err) {
      console.warn('Games telemetry fetch error:', err);
    } finally {
      setGamesLoading(false);
    }
  }, [adminFetch, selectedAdminGame]);

  // Load Recent Rounds & Provably Fair Trail for Selected Game
  const loadSelectedGameRounds = useCallback(async (gameId) => {
    setRoundsLoading(true);
    try {
      const targetId = gameId || selectedAdminGame;
      const res = await adminFetch(`/api/admin/games/rounds?gameId=${encodeURIComponent(targetId)}&limit=30`);
      const data = await res.json();
      if (data.success) {
        setSelectedGameRounds(data.rounds || []);
      }
    } catch (err) {
      console.warn('Game rounds fetch error:', err);
    } finally {
      setRoundsLoading(false);
    }
  }, [adminFetch, selectedAdminGame]);

  const handleSelectGame = (gameId) => {
    setSelectedAdminGame(gameId);
    if (gamesOverview?.games && gamesOverview.games[gameId]?.settings) {
      setGameConfigDraft(gamesOverview.games[gameId].settings);
    }
    loadSelectedGameRounds(gameId);
  };

  const handleSaveGameConfig = async () => {
    if (!gameConfigDraft) return;
    setGameSaving(true);
    try {
      const res = await adminFetch('/api/admin/games/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedAdminGame,
          settings: gameConfigDraft,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Settings updated successfully!`, 'success');
        setGameConfigDraft(data.settings);
        loadGamesOverview();
      } else {
        showToast(data.message || 'Failed to update settings', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGameSaving(false);
    }
  };

  // Initial Auth Check
  useEffect(() => {
    const saved = getStoredSecret();
    if (saved) {
      setSecretInput(saved);
      adminFetch('/api/admin/overview')
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('jetpesa_admin_secret');
          }
        })
        .catch(() => {});
    }
  }, [adminFetch]);

  // Polling loop when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    loadRoundsRadar();
    loadOverview();

    pollTimerRef.current = setInterval(() => {
      loadRoundsRadar();
      if (activeTab === 'overview') loadOverview();
      else if (activeTab === 'bets') loadBets();
      else if (activeTab === 'ledger') loadLedger();
      else if (activeTab === 'games') loadGamesOverview();
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isAuthenticated, activeTab, loadRoundsRadar, loadOverview, loadBets, loadLedger, loadGamesOverview]);

  // Tab switch loader
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'radar') loadRoundsRadar();
    else if (activeTab === 'overview') loadOverview();
    else if (activeTab === 'users') loadUsers(userSearch);
    else if (activeTab === 'bets') loadBets();
    else if (activeTab === 'ledger') loadLedger();
    else if (activeTab === 'penalty') loadPenaltyAdminData();
    else if (activeTab === 'games') {
      loadGamesOverview();
      loadSelectedGameRounds(selectedAdminGame);
    }
  }, [activeTab, isAuthenticated, loadRoundsRadar, loadOverview, loadUsers, loadBets, loadLedger, loadPenaltyAdminData, loadGamesOverview, loadSelectedGameRounds, selectedAdminGame, userSearch]);

  // Save Round Override
  const submitRoundOverride = async () => {
    try {
      const targetPoint = overrideModal.newPoint ? parseFloat(overrideModal.newPoint) : null;
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleIndex: overrideModal.cycleIndex,
          crashPoint: targetPoint,
          note: 'Set via Super Admin Panel',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Override failed.');
      showToast(data.message);
      setOverrideModal({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' });
      loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Instant Crash Current Active Flight Round
  const handleInstantCrash = async () => {
    const curRoundId = inFlightStats?.roundId || currentCycleState?.currentCycleIndex || currentCycleState?.cycleIndex;
    if (!curRoundId) return;

    if (inFlightStats?.hasCrashed) {
      showToast('Current round has already ended.', 'error');
      return;
    }

    setInstantCrashing(true);
    try {
      const curMultiplier = inFlightStats?.multiplier || currentCycleState?.currentMultiplier || 1.0;
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleIndex: curRoundId,
          instantCrash: true,
          crashPoint: inFlightStats?.isBettingPhase ? 1.0 : curMultiplier,
          note: 'Instant crash triggered via Admin Cockpit',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Instant crash failed.');
      showToast(data.message || `🚨 Round #${curRoundId} instantly crashed!`);
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setInstantCrashing(false);
    }
  };

  // Helper to parse custom numeric input cleanly (handles commas, spaces, %, KES)
  const parseCustomFigure = (raw) => {
    if (raw === undefined || raw === null) return NaN;
    const cleaned = String(raw).replace(/[^0-9.]/g, '').trim();
    return cleaned ? parseFloat(cleaned) : NaN;
  };

  // TOP PANEL: Toggle Round Profit Target ON / OFF across ALL rounds real wagers
  const handleToggleRoundProfit = async () => {
    const nextState = !roundProfitEnabled;
    const parsed = parseCustomFigure(roundProfitInput);
    const safeVal = (isNaN(parsed) || parsed <= 0) ? (roundProfitApplied.value || 50) : parsed;
    const effectiveMode = safeVal > 100 ? 'kes' : roundProfitMode;

    roundMutationLockRef.current = Date.now() + 4500;
    setRoundProfitEnabled(nextState);
    setRoundProfitLoading(true);
    try {
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setRoundProfitTarget',
          enabled: nextState,
          value: safeVal,
          percent: effectiveMode === 'percent' ? safeVal : undefined,
          customKes: effectiveMode === 'kes' ? safeVal : undefined,
          mode: effectiveMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to toggle round profit target.');
      const saved = data.roundProfitTarget || { enabled: nextState, mode: effectiveMode, value: safeVal, percent: safeVal, customKes: safeVal };
      const rMode = saved.mode || effectiveMode;
      const rVal = rMode === 'kes' ? Number(saved.customKes ?? safeVal) : Number(saved.percent ?? safeVal);
      setRoundProfitEnabled(Boolean(saved.enabled));
      setRoundProfitMode(rMode);
      setRoundProfitInput(String(rVal));
      setRoundProfitApplied({
        mode: rMode,
        value: rVal,
        percent: Number(saved.percent ?? 50),
        customKes: Number(saved.customKes ?? 500),
      });
      roundInputDirtyRef.current = false;
      const label = rMode === 'kes' ? `KES ${rVal.toLocaleString()}` : `${rVal}%`;
      showToast(
        nextState 
          ? `🎯 Round Profit Target ACTIVATED (${label} on all rounds real wagers)!` 
          : 'Round Profit Target DISABLED (Provably Fair natural flight enabled).'
      );
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRoundProfitLoading(false);
    }
  };

  // TOP PANEL: Save / Update Round Profit Target custom figure across ALL rounds real wagers
  const handleSaveRoundProfit = async (customVal, customMode) => {
    const rawVal = customVal !== undefined ? customVal : roundProfitInput;
    const val = parseCustomFigure(rawVal);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid positive number for the round profit target.', 'error');
      return;
    }

    const effectiveMode = customMode || (val > 100 ? 'kes' : roundProfitMode);
    const normalizedVal = effectiveMode === 'percent'
      ? Math.min(100, Math.max(0.1, parseFloat(val.toFixed(2))))
      : Math.max(1, parseFloat(val.toFixed(2)));

    roundMutationLockRef.current = Date.now() + 4500;
    setRoundProfitLoading(true);
    try {
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setRoundProfitTarget',
          enabled: true,
          value: normalizedVal,
          percent: effectiveMode === 'percent' ? normalizedVal : undefined,
          customKes: effectiveMode === 'kes' ? normalizedVal : undefined,
          mode: effectiveMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update round profit target.');
      const saved = data.roundProfitTarget || { enabled: true, mode: effectiveMode, value: normalizedVal, percent: normalizedVal, customKes: normalizedVal };
      const rMode = saved.mode || effectiveMode;
      const rVal = rMode === 'kes' ? Number(saved.customKes ?? normalizedVal) : Number(saved.percent ?? normalizedVal);
      setRoundProfitEnabled(true);
      setRoundProfitMode(rMode);
      setRoundProfitInput(String(rVal));
      setRoundProfitApplied({
        mode: rMode,
        value: rVal,
        percent: Number(saved.percent ?? 50),
        customKes: Number(saved.customKes ?? 500),
      });
      roundInputDirtyRef.current = false;
      const label = rMode === 'kes' ? `KES ${rVal.toLocaleString()}` : `${rVal}%`;
      showToast(`🎯 Round Profit Target locked at ${label} across all rounds.`);
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRoundProfitLoading(false);
    }
  };

  // RIGHT PANEL: Toggle House Profit Engine & Daily Target (Player accounts & Pay-Ins Protection)
  const handleToggleDailyTarget = async () => {
    const nextState = !dailyTargetEnabled;
    const parsed = parseCustomFigure(dailyTargetInput);
    const safeVal = (isNaN(parsed) || parsed <= 0) ? (dailyTargetApplied.value || 50) : parsed;
    const effectiveMode = safeVal > 100 ? 'kes' : dailyTargetMode;

    dailyMutationLockRef.current = Date.now() + 4500;
    setDailyTargetEnabled(nextState);
    setDailyTargetLoading(true);
    try {
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setDailyProfitEngine',
          enabled: nextState,
          value: safeVal,
          percent: effectiveMode === 'percent' ? safeVal : undefined,
          customKes: effectiveMode === 'kes' ? safeVal : undefined,
          mode: effectiveMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to toggle daily profit engine.');
      const saved = data.dailyProfitEngine || { enabled: nextState, mode: effectiveMode, value: safeVal, percent: safeVal, customKes: safeVal };
      const dMode = saved.mode || effectiveMode;
      const dVal = dMode === 'kes' ? Number(saved.customKes ?? safeVal) : Number(saved.percent ?? safeVal);
      setDailyTargetEnabled(Boolean(saved.enabled));
      setDailyTargetMode(dMode);
      setDailyTargetInput(String(dVal));
      setDailyTargetApplied({
        mode: dMode,
        value: dVal,
        percent: Number(saved.percent ?? 50),
        customKes: Number(saved.customKes ?? 2500),
      });
      dailyInputDirtyRef.current = false;
      const label = dMode === 'kes' ? `KES ${dVal.toLocaleString()}` : `${dVal}%`;
      showToast(
        nextState 
          ? `🛡️ Daily Profit Target ACTIVATED (${label} lock on active funds & pay-ins)!` 
          : 'Daily Profit Target set to pass-through.'
      );
      dailyMutationLockRef.current = 0;
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDailyTargetLoading(false);
    }
  };

  // RIGHT PANEL: Save / Update Daily Profit Target custom figure (% or KES)
  const handleSaveDailyTarget = async (customVal, customMode) => {
    const rawVal = customVal !== undefined ? customVal : dailyTargetInput;
    const val = parseCustomFigure(rawVal);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid positive number for the daily profit target.', 'error');
      return;
    }

    const effectiveMode = customMode || (val > 100 ? 'kes' : dailyTargetMode);
    const normalizedVal = effectiveMode === 'percent'
      ? Math.min(100, Math.max(0.1, parseFloat(val.toFixed(2))))
      : Math.max(1, parseFloat(val.toFixed(2)));

    dailyMutationLockRef.current = Date.now() + 4500;
    setDailyTargetLoading(true);
    try {
      const res = await adminFetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setDailyProfitEngine',
          enabled: true,
          value: normalizedVal,
          percent: effectiveMode === 'percent' ? normalizedVal : undefined,
          customKes: effectiveMode === 'kes' ? normalizedVal : undefined,
          mode: effectiveMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update daily profit target.');
      const saved = data.dailyProfitEngine || { enabled: true, mode: effectiveMode, value: normalizedVal, percent: normalizedVal, customKes: normalizedVal };
      const dMode = saved.mode || effectiveMode;
      const dVal = dMode === 'kes' ? Number(saved.customKes ?? normalizedVal) : Number(saved.percent ?? normalizedVal);
      setDailyTargetEnabled(true);
      setDailyTargetMode(dMode);
      setDailyTargetInput(String(dVal));
      setDailyTargetApplied({
        mode: dMode,
        value: dVal,
        percent: Number(saved.percent ?? 50),
        customKes: Number(saved.customKes ?? 2500),
      });
      dailyInputDirtyRef.current = false;
      const label = dMode === 'kes' ? `KES ${dVal.toLocaleString()}` : `${dVal}%`;
      showToast(`🛡️ Daily Profit Target locked at ${label} of active player funds & pay-ins.`);
      dailyMutationLockRef.current = 0;
      await loadRoundsRadar();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDailyTargetLoading(false);
    }
  };

  // Submit User Balance Adjustment
  const submitBalanceAdjustment = async () => {
    try {
      const amt = parseFloat(adjustModal.amount);
      if (isNaN(amt) || amt === 0) throw new Error('Enter a valid non-zero amount.');
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adjustModal.user.id,
          amount: amt,
          reason: adjustModal.reason || 'Admin manual balance adjustment',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Adjustment failed.');
      showToast(data.message);
      setAdjustModal({ open: false, user: null, amount: '', reason: '' });
      loadUsers(userSearch);
      loadOverview();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  UNAUTHENTICATED GATE                                                    */
  /* ------------------------------------------------------------------------ */
  if (!isAuthenticated) {
    return (
      <main className="jp-admin-login-wrap">
        <div className="jp-admin-login-box">
          <div className="jp-admin-logo-head">
            <div className="jp-admin-emblem">⚡</div>
            <h2>JETPESA COMMAND DECK</h2>
            <p>Super Admin Oracle & Multi-Round Controller</p>
          </div>

          <form onSubmit={handleLogin} className="jp-admin-login-form">
            <label>ENTER MASTER ADMIN SECRET KEY</label>
            <input
              type="password"
              placeholder="e.g. jetpesa_super_admin_2026"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              autoFocus
              required
            />
            {authError && <div className="jp-admin-auth-err">{authError}</div>}
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'AUTHENTICATING...' : 'ENTER SECURE CONSOLE →'}
            </button>
          </form>

          <div className="jp-admin-login-foot">
            <Link href="/dashboard">← Back to Player Cockpit</Link>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{
          __html: `
          body { margin: 0; background: #030712; color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
          .jp-admin-login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at top, #1e1b4b 0%, #070913 50%, #020617 100%); }
          .jp-admin-login-box { width: 100%; max-width: 440px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(225, 29, 72, 0.3); border-radius: 20px; padding: 36px 28px; box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 35px rgba(225,29,72,0.15); backdrop-filter: blur(16px); }
          .jp-admin-logo-head { text-align: center; margin-bottom: 28px; }
          .jp-admin-emblem { width: 56px; height: 56px; line-height: 56px; margin: 0 auto 12px; background: linear-gradient(135deg, #e11d48, #be123c); border-radius: 16px; font-size: 26px; box-shadow: 0 8px 25px rgba(225,29,72,0.4); }
          .jp-admin-logo-head h2 { margin: 0 0 6px; font-size: 20px; font-weight: 900; letter-spacing: 0.05em; color: #fff; }
          .jp-admin-logo-head p { margin: 0; font-size: 12px; color: #94a3b8; }
          .jp-admin-login-form label { display: block; font-size: 10px; font-weight: 800; color: #cbd5e1; letter-spacing: 0.08em; margin-bottom: 8px; }
          .jp-admin-login-form input { width: 100%; padding: 14px 16px; background: #090d16; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none; margin-bottom: 16px; transition: border-color .2s; }
          .jp-admin-login-form input:focus { border-color: #e11d48; box-shadow: 0 0 0 3px rgba(225,29,72,0.25); }
          .jp-admin-login-form button { width: 100%; padding: 14px; background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; border: none; border-radius: 12px; font-weight: 900; font-size: 13px; letter-spacing: 0.05em; cursor: pointer; transition: transform .15s, opacity .15s; }
          .jp-admin-login-form button:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.95; }
          .jp-admin-auth-err { background: rgba(225,29,72,0.15); border: 1px solid rgba(225,29,72,0.4); color: #fda4af; padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 700; margin-bottom: 14px; text-align: center; }
          .jp-admin-login-foot { text-align: center; margin-top: 24px; }
          .jp-admin-login-foot a { color: #64748b; font-size: 12px; text-decoration: none; font-weight: 700; }
          .jp-admin-login-foot a:hover { color: #cbd5e1; }
        ` }} />
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  AUTHENTICATED ADMIN COCKPIT                                             */
  /* ------------------------------------------------------------------------ */

  const curRoundId = inFlightStats?.roundId || currentCycleState?.currentCycleIndex || currentCycleState?.cycleIndex;
  const profitTargetData = inFlightStats?.profitTarget;

  return (
    <div className="jp-admin-app">
      {/* Toast Notification */}
      {toast && (
        <div className={`jp-admin-toast jp-admin-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Top Admin Header */}
      <header className="jp-admin-header">
        <div className="jp-admin-brand">
          <span className="jp-admin-pill">SUPER ADMIN</span>
          <h1>JETPESA ORACLE</h1>
        </div>

        {/* System-Wide Continuous Round Profit Target Strip (Independent) */}
        <div className="jp-admin-profit-strip">
          <div className="jp-profit-left-group">
            <span className="jp-profit-badge-label" title="Focuses on all rounds real wager profit target to ensure the system locks in profits">
              <span className="jp-profit-target-icon">🎯</span>
              <span className="jp-profit-title">ROUND PROFIT TARGET</span>
            </span>

            {/* Interactive ON / OFF Toggle Switch */}
            <div 
              className={`jp-profit-toggle-switch ${roundProfitEnabled ? 'active' : ''}`}
              onClick={handleToggleRoundProfit}
              title={roundProfitEnabled ? 'Click to disable round profit target' : 'Click to enable round profit target on all rounds'}
            >
              <div className="jp-toggle-knob" />
            </div>

            <span className={`jp-profit-toggle-label ${roundProfitEnabled ? 'on' : 'off'}`}>
              {roundProfitEnabled ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Custom Figure Input (% or KES) & Set Button */}
          <div className="jp-profit-input-group">
            <div className="jp-unit-mode-toggle" title="Switch between Percentage (%) and Fixed Amount (KES)">
              <button
                type="button"
                className={`jp-unit-mode-btn ${roundProfitMode === 'percent' ? 'active' : ''}`}
                onClick={() => {
                  roundInputDirtyRef.current = true;
                  setRoundProfitMode('percent');
                }}
              >
                %
              </button>
              <button
                type="button"
                className={`jp-unit-mode-btn ${roundProfitMode === 'kes' ? 'active' : ''}`}
                onClick={() => {
                  roundInputDirtyRef.current = true;
                  setRoundProfitMode('kes');
                }}
              >
                KES
              </button>
            </div>
            <div className="jp-profit-input-wrap">
              {roundProfitMode === 'kes' && <span className="jp-profit-currency">KES</span>}
              <input
                type="text"
                inputMode="decimal"
                placeholder={roundProfitMode === 'kes' ? 'e.g. 500' : 'e.g. 42.5'}
                value={roundProfitInput}
                onFocus={() => { roundInputFocusedRef.current = true; }}
                onBlur={() => { roundInputFocusedRef.current = false; }}
                onChange={(e) => {
                  roundInputDirtyRef.current = true;
                  setRoundProfitInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveRoundProfit();
                  }
                }}
                className="jp-profit-input"
                title={roundProfitMode === 'kes'
                  ? 'Custom KES profit target locked per round across all rounds'
                  : 'Custom percentage profit target on real wagers across all rounds (0.1% to 100%)'}
              />
              {roundProfitMode === 'percent' && <span className="jp-profit-currency">%</span>}
            </div>
            <button
              type="button"
              className="jp-profit-apply-btn"
              onClick={() => handleSaveRoundProfit()}
              disabled={roundProfitLoading || !String(roundProfitInput).trim()}
              title="Save custom round profit target for all rounds"
            >
              {roundProfitLoading ? '...' : 'SET'}
            </button>
          </div>

          {/* Live Status Display across all rounds real wagers */}
          <div className="jp-profit-status-display">
            {roundProfitEnabled ? (
              <div
                className={`jp-profit-status-badge ${profitTargetData?.isSecured ? 'secured' : 'active'}`}
                title={profitTargetData?.reason || `System enforces ${roundProfitApplied.mode === 'kes' ? `KES ${roundProfitApplied.customKes}` : `${roundProfitApplied.percent}%`} profit on real wagers`}
              >
                <span className={`jp-profit-indicator-dot ${profitTargetData?.isSecured ? 'secured' : 'active'}`} />
                <span className="jp-profit-target-val">
                  ALL ROUNDS: {roundProfitApplied.mode === 'kes'
                    ? `KES ${Number(roundProfitApplied.customKes || roundProfitApplied.value).toLocaleString()} LOCK`
                    : `${roundProfitApplied.percent ?? roundProfitApplied.value}% WAGERS LOCK`}
                </span>
                {profitTargetData?.safeMultiplierCap && (
                  <span className="jp-profit-cap-tag">
                    RD #{curRoundId}: CAP {profitTargetData.safeMultiplierCap.toFixed(2)}x
                  </span>
                )}
                {profitTargetData?.isSecured && (
                  <span className="jp-profit-secured-tag">SECURED</span>
                )}
              </div>
            ) : (
              <div className="jp-profit-status-badge idle" title="Round profit target is OFF. All rounds use natural Provably Fair seed.">
                <span className="jp-profit-indicator-dot idle" />
                <span>OFF (PROVABLY FAIR)</span>
              </div>
            )}
          </div>
        </div>

        <div className="jp-admin-head-actions">
          <Link href="/dashboard" className="jp-admin-dash-link" target="_blank">
            Open Player UI ↗
          </Link>
          <button onClick={handleLogout} className="jp-admin-logout-btn">
            Log Out
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="jp-admin-tabs">
        <button
          className={`jp-admin-tab-btn ${activeTab === 'games' ? 'active' : ''}`}
          onClick={() => setActiveTab('games')}
          style={{
            background: activeTab === 'games' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : undefined,
            fontWeight: 800,
          }}
        >
          🎮 All Games Command Center
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          🎯 Flight Radar & Next Rounds
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Treasury & Platform Health
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Players & Wallets
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'bets' ? 'active' : ''}`}
          onClick={() => setActiveTab('bets')}
        >
          🎲 Live Bets Log
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          💳 M-Pesa In/Out Ledger
        </button>
        <button
          className={`jp-admin-tab-btn ${activeTab === 'penalty' ? 'active' : ''}`}
          onClick={() => setActiveTab('penalty')}
        >
          ⚽ Penalty Multipliers & Steps
        </button>
      </nav>

      {/* Main Container */}
      <main className="jp-admin-body">
        {/* ================================================================= */}
        {/* TAB 1: FLIGHT RADAR & NEXT ROUNDS ORACLE                          */}
        {/* ================================================================= */}
        {activeTab === 'radar' && (
          <div className="jp-admin-radar-view">
            {/* TOP ROW: Compact Past Flight Outcomes (Left) + House Profit Engine & Daily Target Calculator (Right) */}
            <div className="jp-radar-top-grid">
              {/* Left Column: Compact Combined Flight History (Past 5) + Upcoming Departure Schedule (Next 6) */}
              <section className="jp-admin-history-strip jp-history-compact">
                {/* SUB-SECTION 1: Flight Departure Schedule (Next 6 Rounds) */}
                <div className="jp-oracle-sub-section">
                  <div className="jp-history-strip-header">
                    <div className="jp-history-strip-title">
                      <span className="jp-history-clock-icon">🚀</span>
                      <h3>Flight Departure Schedule (Next 6 Rounds)</h3>
                    </div>
                    <span className="jp-panel-note">Live Oracle</span>
                  </div>

                  {roundsData.length === 0 ? (
                    <div className="jp-history-empty">
                      <span>Calculating upcoming departure sequence...</span>
                    </div>
                  ) : (
                    <div className="jp-history-cards-grid grid-6">
                      {roundsData.slice(0, 6).map((r) => (
                        <div
                          key={r.cycleIndex}
                          className={`jp-history-card border-${r.category.toLowerCase()} ${r.isCurrent ? 'jp-card-live' : ''}`}
                          onClick={() => setOverrideModal({
                            open: true,
                            cycleIndex: r.cycleIndex,
                            currentPoint: r.crashPoint,
                            newPoint: r.crashPoint.toString(),
                          })}
                          title="Click to override target crash multiplier for this round"
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="jp-history-card-top">
                            <span className="jp-history-round-label">#{r.cycleIndex}</span>
                            {r.isCurrent ? (
                              <span className="jp-status-pill pill-live">LIVE</span>
                            ) : (
                              <span className="jp-status-pill pill-queued">~{r.secondsUntilDeparture}s</span>
                            )}
                          </div>
                          <div className="jp-history-card-body" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span className={`jp-history-mult-num mult-${r.category.toLowerCase()}`}>
                              {r.crashPoint.toFixed(2)}x
                            </span>
                            <span className={`jp-cat-badge badge-${r.category.toLowerCase()}`}>
                              {r.category}
                            </span>
                          </div>
                          <div className="jp-history-card-footer">
                            {r.isOverridden ? (
                              <span className="jp-tag-override-sm">Overridden</span>
                            ) : (
                              <span className="jp-tag-natural-sm">Fair</span>
                            )}
                            <span className="jp-btn-edit-micro" title="Set Multiplier">✏️</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="jp-oracle-divider" />

                {/* SUB-SECTION 2: Past Flight Outcomes (Last 5 Crash Points) */}
                <div className="jp-oracle-sub-section">
                  <div className="jp-history-strip-header">
                    <div className="jp-history-strip-title">
                      <span className="jp-history-clock-icon">🕒</span>
                      <h3>Past Flight Outcomes (Last 5 Crash Points)</h3>
                    </div>
                    <span className="jp-panel-note">Audit Tape</span>
                  </div>

                  {pastRoundsData.length === 0 ? (
                    <div className="jp-history-empty">
                      <span>Awaiting initial round completions...</span>
                    </div>
                  ) : (
                    <div className="jp-history-cards-grid grid-5">
                      {pastRoundsData.map((pr) => (
                        <div key={pr.cycleIndex} className={`jp-history-card border-${pr.category.toLowerCase()}`}>
                          <div className="jp-history-card-top">
                            <span className="jp-history-round-label">#{pr.cycleIndex}</span>
                            <span className={`jp-cat-badge badge-${pr.category.toLowerCase()}`}>
                              {pr.category}
                            </span>
                          </div>
                          <div className="jp-history-card-body">
                            <span className={`jp-history-mult-num mult-${pr.category.toLowerCase()}`}>
                              {pr.crashPoint.toFixed(2)}x
                            </span>
                          </div>
                          <div className="jp-history-card-footer">
                            <span className="jp-history-ago">~{pr.completedAgoSeconds}s ago</span>
                            {pr.isOverridden ? (
                              <span className="jp-tag-override-sm">Overridden</span>
                            ) : (
                              <span className="jp-tag-natural-sm">Fair</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Right Column: House Profit Engine & Daily Target Calculator */}
              <section className="jp-admin-panel jp-profit-engine-panel">
                <div className="jp-panel-header">
                  <div className="jp-history-strip-title">
                    <span className="jp-history-clock-icon">🛡️</span>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        House Profit Engine & Daily Target
                        {houseProfitEngine?.enabled ? (
                          <span className="jp-status-pill pill-live">● ACTIVE LOCK</span>
                        ) : (
                          <span className="jp-status-pill pill-active">○ PASS-THROUGH</span>
                        )}
                      </h3>
                      <span className="jp-panel-note">
                        Safeguards player account funds & locks real pay-ins retention margin
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div 
                      className={`jp-profit-toggle-switch ${dailyTargetEnabled ? 'active' : ''}`}
                      onClick={handleToggleDailyTarget}
                      title={dailyTargetEnabled ? 'Click to disable daily profit engine' : 'Click to enable daily profit engine'}
                    >
                      <div className="jp-toggle-knob" />
                    </div>
                    <span className={`jp-profit-toggle-label ${dailyTargetEnabled ? 'on' : 'off'}`}>
                      {dailyTargetEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>

                {/* 4-Card Relevant Data Financial Grid */}
                <div className="jp-engine-metrics-grid">
                  <div className="jp-engine-metric-card">
                    <span className="jp-engine-metric-label">FUNDS IN PLAYER ACCOUNTS</span>
                    <span className="jp-engine-metric-val val-blue">
                      KES {(houseProfitEngine?.totalLiabilities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="jp-engine-metric-sub">
                      Across {houseProfitEngine?.totalUsers || 0} registered pilots
                    </span>
                  </div>

                  <div className="jp-engine-metric-card">
                    <span className="jp-engine-metric-label">REAL PAY-INS (DEPOSITS)</span>
                    <span className="jp-engine-metric-val val-green">
                      KES {(houseProfitEngine?.todayDeposits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="jp-engine-metric-sub">
                      All-Time: KES {(houseProfitEngine?.allTimeDeposits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="jp-engine-metric-card">
                    <span className="jp-engine-metric-label">ACHIEVED PROFIT (GGR)</span>
                    <span className={`jp-engine-metric-val ${(houseProfitEngine?.todayGgr || 0) >= 0 ? 'val-green' : 'val-red'}`}>
                      {(houseProfitEngine?.todayGgr || 0) >= 0 ? '+' : ''}KES {(houseProfitEngine?.todayGgr || 0).toFixed(2)}
                    </span>
                    <span className="jp-engine-metric-sub">
                      Retention: {houseProfitEngine?.payInRetentionPct || 0}% of pay-ins
                    </span>
                  </div>

                  <div className="jp-engine-metric-card highlight-target">
                    <span className="jp-engine-metric-label">CALCULATED DAILY TARGET</span>
                    <span className="jp-engine-metric-val val-gold">
                      KES {(houseProfitEngine?.calculatedDailyTargetKes || 0).toLocaleString()}
                    </span>
                    <span className="jp-engine-metric-sub">
                      {dailyTargetApplied.mode === 'kes'
                        ? `Custom fixed lock: KES ${Number(dailyTargetApplied.customKes || dailyTargetApplied.value).toLocaleString()}`
                        : `Locks ${dailyTargetApplied.percent ?? dailyTargetApplied.value}% of active funds & pay-ins`}
                    </span>
                  </div>
                </div>

                {/* Target Progress Bar & Lock Status */}
                <div className="jp-engine-progress-wrap">
                  <div className="jp-engine-progress-info">
                    <span className="jp-engine-progress-title">
                      Daily Target Retention Progress: <strong>{houseProfitEngine?.targetProgressPct || 0}%</strong>
                    </span>
                    {houseProfitEngine?.isDailyTargetAchieved ? (
                      <span className="jp-engine-status-tag tag-secured">✅ TARGET SECURED & LOCKED</span>
                    ) : houseProfitEngine?.enabled ? (
                      <span className="jp-engine-status-tag tag-enforcing">⚡ AUTO-ENFORCING VIA ROUND CAPS</span>
                    ) : (
                      <span className="jp-engine-status-tag tag-idle">○ TARGET OFF (NATURAL PROVABLY FAIR)</span>
                    )}
                  </div>
                  <div className="jp-engine-progress-bar">
                    <div 
                      className={`jp-engine-progress-fill ${houseProfitEngine?.isDailyTargetAchieved ? 'secured' : ''}`}
                      style={{ width: `${houseProfitEngine?.targetProgressPct || 0}%` }}
                    />
                  </div>
                </div>

                {/* Controls: Custom Figure Input (% or KES) & Lock Button */}
                <div className="jp-engine-controls-bar">
                  <span className="jp-engine-control-label">
                    {dailyTargetMode === 'kes'
                      ? 'CUSTOM DAILY PROFIT TARGET FIGURE (KES AMOUNT):'
                      : 'CUSTOM DAILY RETENTION TARGET (% OF FUNDS & PAY-INS):'}
                  </span>

                  <div className="jp-engine-input-apply">
                    <div className="jp-unit-mode-toggle" title="Switch between Percentage (%) and Fixed Amount (KES)">
                      <button
                        type="button"
                        className={`jp-unit-mode-btn ${dailyTargetMode === 'percent' ? 'active' : ''}`}
                        onClick={() => {
                          dailyInputDirtyRef.current = true;
                          setDailyTargetMode('percent');
                        }}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={`jp-unit-mode-btn ${dailyTargetMode === 'kes' ? 'active' : ''}`}
                        onClick={() => {
                          dailyInputDirtyRef.current = true;
                          setDailyTargetMode('kes');
                        }}
                      >
                        KES
                      </button>
                    </div>
                    <div className="jp-profit-input-wrap">
                      {dailyTargetMode === 'kes' && <span className="jp-profit-currency">KES</span>}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={dailyTargetMode === 'kes' ? 'e.g. 3500' : 'e.g. 37.5'}
                        value={dailyTargetInput}
                        onFocus={() => { dailyInputFocusedRef.current = true; }}
                        onBlur={() => { dailyInputFocusedRef.current = false; }}
                        onChange={(e) => {
                          dailyInputDirtyRef.current = true;
                          setDailyTargetInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveDailyTarget();
                          }
                        }}
                        className="jp-profit-input jp-profit-input-wide"
                        title={dailyTargetMode === 'kes'
                          ? 'Custom daily profit target figure in KES'
                          : 'Daily profit retention percentage applied to deposits and player funds'}
                      />
                      {dailyTargetMode === 'percent' && <span className="jp-profit-currency">%</span>}
                    </div>
                    <button
                      type="button"
                      className="jp-engine-lock-btn"
                      onClick={() => handleSaveDailyTarget()}
                      disabled={dailyTargetLoading || !String(dailyTargetInput).trim()}
                    >
                      {dailyTargetLoading ? '...' : 'LOCK & APPLY'}
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Middle Row: Minimized In-Flight Telemetry (Left) + Daily Platform Financials & Pay-Ins/Payouts (Right) */}
            <div className="jp-middle-split-row">
              {/* LEFT: Minimized In-Flight Telemetry */}
              <section className="jp-admin-panel jp-inflight-min-panel">
                <div className="jp-panel-header">
                  <div className="jp-history-strip-title">
                    <span className="jp-history-clock-icon">🛩️</span>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Round #{inFlightStats?.roundId || currentCycleState?.currentCycleIndex || '—'}
                        {inFlightStats?.isBettingPhase ? (
                          <span className="jp-status-pill pill-active">⏱ COUNTDOWN</span>
                        ) : inFlightStats?.hasCrashed ? (
                          <span className="jp-status-pill pill-crashed">✕ CRASHED @ {inFlightStats?.crashPoint?.toFixed(2)}x</span>
                        ) : (
                          <span className="jp-status-pill pill-live">● FLYING @ {(inFlightStats?.multiplier || currentCycleState?.currentMultiplier || 1.0).toFixed(2)}x</span>
                        )}
                        {(inFlightStats?.profitTarget?.targetProfitPercent || inFlightStats?.profitTarget?.targetProfitKes) && (
                          <span style={{ marginLeft: '8px', fontSize: '9px', fontWeight: 900, background: 'rgba(16, 185, 129, 0.18)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', padding: '2px 6px', borderRadius: '4px' }}>
                            🎯 TARGET {inFlightStats.profitTarget.targetProfitPercent ? `${inFlightStats.profitTarget.targetProfitPercent}%` : `KES ${inFlightStats.profitTarget.targetProfitKes}`}
                            {inFlightStats.profitTarget.targetProfitKes > 0 && ` (≈ KES ${Number(inFlightStats.profitTarget.targetProfitKes).toLocaleString()})`}
                            {inFlightStats.profitTarget.safeMultiplierCap && ` • CAP ${inFlightStats.profitTarget.safeMultiplierCap.toFixed(2)}x`}
                          </span>
                        )}
                      </h3>
                    </div>
                  </div>

                  {/* Midway: Instant Crash Button */}
                  <div className="jp-instant-crash-midway">
                    <button
                      className="jp-btn-instant-crash"
                      disabled={inFlightStats?.hasCrashed || instantCrashing}
                      onClick={handleInstantCrash}
                      title="Immediately crash active flight round"
                    >
                      {instantCrashing ? 'CRASHING...' : inFlightStats?.hasCrashed ? '✕ CRASHED' : '🚨 CRASH NOW'}
                    </button>
                  </div>

                  <span className="jp-tag-natural" style={{ fontSize: '8.5px', color: '#38bdf8' }}>
                    Real Pilots
                  </span>
                </div>

                {/* Minimized KPIs: 2x2 grid */}
                <div className="jp-inflight-kpi-grid-min">
                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL PILOTS</span>
                    <div className="jp-kpi-val text-white" style={{ fontSize: '15px' }}>
                      {inFlightStats?.totalPilots || 0}
                    </div>
                    <small>{inFlightStats?.activePilots || 0} flying • {inFlightStats?.cashedOutPilots || 0} won</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL WAGERED</span>
                    <div className="jp-kpi-val text-amber" style={{ fontSize: '15px' }}>
                      KES {(inFlightStats?.totalStaked || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>Active: KES {(inFlightStats?.activeStaked || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">REAL PAYOUTS WON</span>
                    <div className="jp-kpi-val text-green" style={{ fontSize: '15px' }}>
                      KES {(inFlightStats?.totalWon || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>{inFlightStats?.cashedOutPilots || 0} cashed out</small>
                  </div>

                  <div className="jp-inflight-kpi-card">
                    <span className="jp-kpi-sublabel">HOUSE NET ROUND</span>
                    <div className={`jp-kpi-val ${(inFlightStats?.netHouseMargin || 0) >= 0 ? 'text-cyan' : 'text-rose'}`} style={{ fontSize: '15px' }}>
                      {(inFlightStats?.netHouseMargin || 0) >= 0 ? '+' : ''}KES {(inFlightStats?.netHouseMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <small>{(inFlightStats?.netHouseMargin || 0) >= 0 ? 'House Profit' : 'House Deficit'}</small>
                  </div>
                </div>

                {/* Real Pilots Scrollable Stream */}
                {(!inFlightStats?.bets || inFlightStats.bets.length === 0) ? (
                  <div className="jp-inflight-empty-min">
                    <span>📡 Listening for real pilot wagers in Round #{inFlightStats?.roundId || currentCycleState?.currentCycleIndex}...</span>
                  </div>
                ) : (
                  <div className="jp-table-wrap jp-inflight-scroll">
                    <table className="jp-admin-table">
                      <thead>
                        <tr>
                          <th>Pilot</th>
                          <th>Deck</th>
                          <th>Stake</th>
                          <th>Multiplier</th>
                          <th>Status</th>
                          <th>Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inFlightStats.bets.map((bet) => {
                          const isFlying = bet.status === 'ACTIVE' && !inFlightStats.hasCrashed && !inFlightStats.isBettingPhase;
                          const curValue = isFlying ? (bet.stake * (inFlightStats.multiplier || 1.0)) : bet.winAmount;
                          return (
                            <tr key={bet.id}>
                              <td><strong>{bet.userPhone || bet.userName}</strong></td>
                              <td><span className="jp-deck-pill">D-{bet.deck}</span></td>
                              <td>KES {bet.stake.toFixed(2)}</td>
                              <td>
                                {bet.multiplier ? (
                                  <span className="jp-table-mult text-green">{bet.multiplier.toFixed(2)}x</span>
                                ) : isFlying ? (
                                  <span className="jp-table-mult text-amber">{(inFlightStats.multiplier || 1.0).toFixed(2)}x</span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>—</span>
                                )}
                              </td>
                              <td>
                                {bet.status === 'WON' ? (
                                  <span className="jp-status-pill pill-won">CASHED</span>
                                ) : bet.status === 'CRASHED' || bet.status === 'LOST' ? (
                                  <span className="jp-status-pill pill-crashed">CRASHED</span>
                                ) : isFlying ? (
                                  <span className="jp-status-pill pill-live">FLYING</span>
                                ) : (
                                  <span className="jp-status-pill pill-active">WAIT</span>
                                )}
                              </td>
                              <td>
                                {bet.status === 'WON' ? (
                                  <span style={{ color: '#22c55e', fontWeight: 900 }}>+{bet.winAmount.toFixed(2)}</span>
                                ) : isFlying ? (
                                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>Est. {curValue.toFixed(2)}</span>
                                ) : (
                                  <span style={{ color: '#f43f5e' }}>-{bet.stake.toFixed(2)}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* RIGHT: Daily Statistics & Real Pay-Ins / Payouts */}
              <section className="jp-admin-panel jp-daily-panel">
                <div className="jp-panel-header">
                  <div className="jp-history-strip-title">
                    <span className="jp-history-clock-icon">💳</span>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Daily Performance & Real M-Pesa Flow
                      </h3>
                    </div>
                  </div>

                  {/* Date Selector & Today Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setSelectedDate(newDate);
                        loadRoundsRadar(newDate);
                      }}
                      className="jp-date-picker-input"
                    />
                    {!dailyStats?.isToday && (
                      <button
                        className="jp-sm-btn"
                        style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8', color: '#38bdf8' }}
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setSelectedDate(today);
                          loadRoundsRadar(today);
                        }}
                      >
                        Today ↩
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Financial KPIs in 2x2 Grid */}
                <div className="jp-inflight-kpi-grid-min">
                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #22c55e' }}>
                    <span className="jp-kpi-sublabel">REAL PAY-INS (DEPOSITS)</span>
                    <div className="jp-kpi-val text-green" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.depositsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{dailyStats?.depositsCount || 0} M-Pesa payments</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #f43f5e' }}>
                    <span className="jp-kpi-sublabel">REAL PAYOUTS (WITHDRAWALS)</span>
                    <div className="jp-kpi-val text-rose" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.withdrawalsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{dailyStats?.withdrawalsCount || 0} completed payouts</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: `3px solid ${(dailyStats?.netCashflow || 0) >= 0 ? '#38bdf8' : '#f43f5e'}` }}>
                    <span className="jp-kpi-sublabel">NET CASHFLOW (IN - OUT)</span>
                    <div className={`jp-kpi-val ${(dailyStats?.netCashflow || 0) >= 0 ? 'text-cyan' : 'text-rose'}`} style={{ fontSize: '15px' }}>
                      {(dailyStats?.netCashflow || 0) >= 0 ? '+' : ''}KES {(dailyStats?.netCashflow || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>{(dailyStats?.netCashflow || 0) >= 0 ? 'Net Inflow Surplus' : 'Net Outflow Deficit'}</small>
                  </div>

                  <div className="jp-inflight-kpi-card" style={{ borderLeft: '3px solid #fbbf24' }}>
                    <span className="jp-kpi-sublabel">GAMING GROSS REVENUE (GGR)</span>
                    <div className="jp-kpi-val text-amber" style={{ fontSize: '15px' }}>
                      KES {(dailyStats?.grossGamingRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <small>Wagered: KES {(dailyStats?.wageredTotal || 0).toFixed(0)} • Won: KES {(dailyStats?.wonTotal || 0).toFixed(0)}</small>
                  </div>
                </div>

                {/* Sub-tabs / Mini transactions stream */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'summary' ? 'active' : ''}`}
                      onClick={() => setDailyTab('summary')}
                    >
                      Summary View
                    </button>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'payins' ? 'active' : ''}`}
                      onClick={() => setDailyTab('payins')}
                    >
                      Pay-Ins ({dailyStats?.recentPayIns?.length || 0})
                    </button>
                    <button
                      className={`jp-mini-tab-btn ${dailyTab === 'payouts' ? 'active' : ''}`}
                      onClick={() => setDailyTab('payouts')}
                    >
                      Payouts ({dailyStats?.recentPayouts?.length || 0})
                    </button>
                  </div>

                  {dailyTab === 'summary' && (
                    <div className="jp-daily-summary-box">
                      <div className="jp-summary-line">
                        <span>Active Betting Rounds:</span>
                        <strong>{dailyStats?.betsCount || 0} real wagers recorded</strong>
                      </div>
                      <div className="jp-summary-line">
                        <span>Total Real Money Cycled:</span>
                        <strong>KES {((dailyStats?.depositsTotal || 0) + (dailyStats?.withdrawalsTotal || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="jp-summary-line">
                        <span>Date Query:</span>
                        <code style={{ color: '#38bdf8' }}>{dailyStats?.date || selectedDate} {dailyStats?.isToday ? '(Today)' : ''}</code>
                      </div>
                    </div>
                  )}

                  {dailyTab === 'payins' && (
                    (!dailyStats?.recentPayIns || dailyStats.recentPayIns.length === 0) ? (
                      <div className="jp-inflight-empty-min">No M-Pesa pay-ins found for {selectedDate}.</div>
                    ) : (
                      <div className="jp-table-wrap jp-inflight-scroll">
                        <table className="jp-admin-table">
                          <thead>
                            <tr>
                              <th>Receipt</th>
                              <th>User</th>
                              <th>Amount</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyStats.recentPayIns.map((p) => (
                              <tr key={p.id}>
                                <td><code style={{ color: '#a7f3d0' }}>{p.receipt || p.id.slice(0, 8)}</code></td>
                                <td>{p.phone}</td>
                                <td><strong className="text-green">+KES {p.amount.toFixed(2)}</strong></td>
                                <td><span className="jp-history-ago">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {dailyTab === 'payouts' && (
                    (!dailyStats?.recentPayouts || dailyStats.recentPayouts.length === 0) ? (
                      <div className="jp-inflight-empty-min">No M-Pesa payouts found for {selectedDate}.</div>
                    ) : (
                      <div className="jp-table-wrap jp-inflight-scroll">
                        <table className="jp-admin-table">
                          <thead>
                            <tr>
                              <th>Receipt / ID</th>
                              <th>Recipient</th>
                              <th>Amount</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyStats.recentPayouts.map((w) => (
                              <tr key={w.id}>
                                <td><code style={{ color: '#fecdd3' }}>{w.receipt || w.id.slice(0, 8)}</code></td>
                                <td>{w.phone}</td>
                                <td><strong className="text-rose">-KES {w.amount.toFixed(2)}</strong></td>
                                <td><span className="jp-history-ago">{new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: TREASURY & PLATFORM HEALTH                                 */}
        {/* ================================================================= */}
        {activeTab === 'overview' && overviewData && (
          <div className="jp-admin-overview-view">
            {/* KPI Cards */}
            <div className="jp-kpi-grid">
              <div className="jp-kpi-card">
                <label>SAFARICOM B2C FLOAT (M-PESA)</label>
                <div className="jp-kpi-val text-cyan">
                  {overviewData.stats.printPayBalance !== null
                    ? `KES ${overviewData.stats.printPayBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : 'Connecting...'}
                </div>
                <small>Ready for instant player cashout withdrawals</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL PLAYER LIABILITIES</label>
                <div className="jp-kpi-val text-amber">
                  KES {overviewData.stats.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>Sum of active balances in public.users</small>
              </div>

              <div className="jp-kpi-card">
                <label>GROSS GAMING REVENUE (GGR)</label>
                <div className={`jp-kpi-val ${overviewData.stats.grossGamingRevenue >= 0 ? 'text-green' : 'text-rose'}`}>
                  KES {overviewData.stats.grossGamingRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>Total Staked ({overviewData.stats.totalWagered.toLocaleString()}) minus Total Won ({overviewData.stats.totalWon.toLocaleString()})</small>
              </div>

              <div className="jp-kpi-card">
                <label>REGISTERED PLAYERS</label>
                <div className="jp-kpi-val text-white">
                  {overviewData.stats.totalUsers.toLocaleString()}
                </div>
                <small>Verified M-Pesa accounts in database</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL COMPLETED DEPOSITS</label>
                <div className="jp-kpi-val text-green">
                  KES {overviewData.stats.totalDepositsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>{overviewData.stats.totalDepositsCount} M-Pesa transactions credited</small>
              </div>

              <div className="jp-kpi-card">
                <label>TOTAL COMPLETED WITHDRAWALS</label>
                <div className="jp-kpi-val text-rose">
                  KES {overviewData.stats.totalWithdrawalsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <small>{overviewData.stats.totalWithdrawalsCount} successful B2C payouts</small>
              </div>
            </div>

            {/* Provably Fair Parameters Card */}
            <section className="jp-admin-panel" style={{ marginTop: 24 }}>
              <div className="jp-panel-header">
                <h3>Cryptographic Engine Parameters</h3>
              </div>
              <div className="jp-crypto-params">
                <div className="jp-param-line">
                  <strong>Server Seed SHA-256 Hash:</strong>
                  <code>{overviewData.game.serverSeedHash}</code>
                </div>
                <div className="jp-param-line">
                  <strong>Client Seed Anchor:</strong>
                  <code>{overviewData.game.clientSeed}</code>
                </div>
                <div className="jp-param-line">
                  <strong>House Edge:</strong>
                  <code>3.00% (Instant 1.00x crash allocation on h % 33 == 0)</code>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PLAYERS & WALLETS                                          */}
        {/* ================================================================= */}
        {activeTab === 'users' && (
          <div className="jp-admin-users-view">
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Player Directory & Wallet Management</h3>
                <div className="jp-search-box">
                  <input
                    type="text"
                    placeholder="Search phone, 8-digit ID, name, email..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      loadUsers(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Phone / ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Wallet Balance</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No players found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      usersData.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.phone || '—'}</strong>
                            {u.userIdCode ? (
                              <div style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700, marginTop: '2px' }}>
                                ID: {u.userIdCode}
                              </div>
                            ) : (
                              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                                {u.id.slice(0, 8)}
                              </div>
                            )}
                          </td>
                          <td>{u.displayName || '—'}</td>
                          <td>{u.email || '—'}</td>
                          <td>
                            <strong style={{ color: '#22c55e' }}>
                              KES {u.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                          </td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="jp-sm-btn"
                              onClick={() => setAdjustModal({ open: true, user: u, amount: '', reason: '' })}
                            >
                              Adjust Balance ±
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: LIVE BETS LOG                                              */}
        {/* ================================================================= */}
        {activeTab === 'bets' && (
          <div className="jp-admin-bets-view">
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Recent Live Wagers (All Players)</h3>
                <button className="jp-sm-btn" onClick={loadBets}>Refresh Feed</button>
              </div>

              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Round #</th>
                      <th>Player</th>
                      <th>Deck</th>
                      <th>Stake</th>
                      <th>Auto Cashout</th>
                      <th>Cashout Mult</th>
                      <th>Payout</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {betsData.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No wagers recorded yet.
                        </td>
                      </tr>
                    ) : (
                      betsData.map((b) => (
                        <tr key={b.id}>
                          <td><strong>#{b.roundId}</strong></td>
                          <td>{b.userPhone || b.userName}</td>
                          <td><span className="jp-deck-pill">Deck {b.deck}</span></td>
                          <td>KES {b.stake.toLocaleString()}</td>
                          <td>{b.autoCashout ? `${b.autoCashout.toFixed(2)}x` : '—'}</td>
                          <td>{b.multiplier ? `${b.multiplier.toFixed(2)}x` : '—'}</td>
                          <td>
                            {b.winAmount > 0 ? (
                              <strong style={{ color: '#22c55e' }}>+KES {b.winAmount.toLocaleString()}</strong>
                            ) : (
                              '0 KES'
                            )}
                          </td>
                          <td>
                            <span className={`jp-status-pill pill-${b.status.toLowerCase()}`}>
                              {b.status}
                            </span>
                          </td>
                          <td>{new Date(b.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: M-PESA IN/OUT LEDGER                                       */}
        {/* ================================================================= */}
        {activeTab === 'ledger' && (
          <div className="jp-admin-ledger-view">
            {/* Deposits Table */}
            <section className="jp-admin-panel" style={{ marginBottom: 24 }}>
              <div className="jp-panel-header">
                <h3>Recent M-Pesa Deposits (C2B / STK Push)</h3>
              </div>
              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Phone</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Credited</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.deposits.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No deposits recorded.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.deposits.map((d) => (
                        <tr key={d.id}>
                          <td><strong>{d.receipt || 'PENDING'}</strong></td>
                          <td>{d.phone}</td>
                          <td><strong style={{ color: '#22c55e' }}>KES {d.amount.toLocaleString()}</strong></td>
                          <td><span className={`jp-status-pill pill-${d.status.toLowerCase()}`}>{d.status}</span></td>
                          <td>{d.credited ? '✓ YES' : '✗ NO'}</td>
                          <td>{new Date(d.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Withdrawals Table */}
            <section className="jp-admin-panel">
              <div className="jp-panel-header">
                <h3>Recent M-Pesa Withdrawals (B2C Automated Payouts)</h3>
              </div>
              <div className="jp-table-wrap">
                <table className="jp-admin-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Phone</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Failure Reason</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                          No withdrawals recorded.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.withdrawals.map((w) => (
                        <tr key={w.id}>
                          <td><strong>{w.receipt || 'PROCESSING'}</strong></td>
                          <td>{w.phone}</td>
                          <td><strong style={{ color: '#f43f5e' }}>KES {w.amount.toLocaleString()}</strong></td>
                          <td><span className={`jp-status-pill pill-${w.status.toLowerCase()}`}>{w.status}</span></td>
                          <td>{w.failureReason || '—'}</td>
                          <td>{new Date(w.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: PENALTY SHOOTOUT ENGINE CONFIGURATION                      */}
        {/* ================================================================= */}
        {activeTab === 'penalty' && (
          <div className="jp-admin-penalty-view">
            {/* Header / Actions */}
            <div className="jp-panel-header" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚽</span> Penalty Shootout Mathematical Engine & Risk Management
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  Configure streak progression steps, multipliers, house margin, and payout volatility in real-time.
                </p>
              </div>
              <button
                onClick={loadPenaltyAdminData}
                disabled={penaltyLoading}
                className="jp-btn-refresh"
                style={{ padding: '6px 12px', fontSize: 11, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 6, cursor: 'pointer' }}
              >
                {penaltyLoading ? 'Refreshing...' : '🔄 Refresh Stats'}
              </button>
            </div>

            {/* KPI Cards */}
            <div className="jp-kpi-grid" style={{ marginBottom: 20 }}>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">TOTAL SHOOTOUTS</span>
                <div className="jp-kpi-val text-cyan">{(penaltyStats?.totalRounds || 0).toLocaleString()}</div>
                <small>Win Rate: {penaltyStats?.winRate || 0}%</small>
              </div>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">TOTAL STAKED</span>
                <div className="jp-kpi-val text-amber">KES {(penaltyStats?.totalStaked || 0).toLocaleString()}</div>
                <small>Gross turnover</small>
              </div>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">TOTAL PAYOUTS</span>
                <div className="jp-kpi-val text-rose">KES {(penaltyStats?.totalWon || 0).toLocaleString()}</div>
                <small>Player cashouts & jackpots</small>
              </div>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">NET HOUSE PROFIT</span>
                <div className="jp-kpi-val text-green">KES {(penaltyStats?.netHouseProfit || 0).toLocaleString()}</div>
                <small>Realized GGR</small>
              </div>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">REALIZED HOUSE MARGIN</span>
                <div className="jp-kpi-val text-white">
                  {penaltyStats?.rtpRealized !== undefined
                    ? `${(100 - penaltyStats.rtpRealized).toFixed(1)}%`
                    : '25.0%'}
                </div>
                <small>Theoretical Target: {(100 - penaltyGoalProb).toFixed(1)}%</small>
              </div>
            </div>

            {/* Presets Bar */}
            <section className="jp-admin-panel" style={{ marginBottom: 20 }}>
              <div className="jp-panel-header">
                <h4>🎯 Risk Presets & Multiplier Templates</h4>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8' }}>
                Quickly apply proven configurations to optimize the platform house edge against runaway players.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {Object.keys(penaltyPresets).map((k) => {
                  const p = penaltyPresets[k];
                  const isCurrent = penaltyStepsCount === p.maxShots && penaltyMultipliers[0] === p.multipliers[0];
                  return (
                    <div
                      key={k}
                      onClick={() => applyPenaltyPreset(k)}
                      style={{
                        background: isCurrent ? 'rgba(34, 197, 94, 0.12)' : '#090d16',
                        border: `1px solid ${isCurrent ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 8,
                        padding: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: 12, color: isCurrent ? '#22c55e' : '#fff' }}>{p.name}</strong>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: '#fbbf24', fontWeight: 800 }}>
                          {p.tag}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {p.maxShots} Steps: <strong>{p.multipliers[0]}x</strong> ➔ <strong>{p.multipliers[p.maxShots - 1]}x</strong>
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                        Goal Rate: {Math.round(p.goalProbability * 100)}% • House Edge: ~{(100 - p.goalProbability * 100).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Global Settings (Steps, Goal Probability, Limits) */}
            <section className="jp-admin-panel" style={{ marginBottom: 20 }}>
              <div className="jp-panel-header">
                <h4>⚙️ Streak Steps & House Parameters</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {/* Steps Stepper */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    SERIES STREAK STEPS (3 - 15)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleStepCountChange(penaltyStepsCount - 1)}
                      disabled={penaltyStepsCount <= 3}
                      style={{ width: 36, height: 36, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 16, cursor: 'pointer' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="3"
                      max="15"
                      value={penaltyStepsCount}
                      onChange={(e) => handleStepCountChange(e.target.value)}
                      style={{ flex: 1, height: 36, background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 800 }}
                    />
                    <button
                      onClick={() => handleStepCountChange(penaltyStepsCount + 1)}
                      disabled={penaltyStepsCount >= 15}
                      style={{ width: 36, height: 36, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 16, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                  <small style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                    Controls the number of consecutive goals required to hit the maximum jackpot.
                  </small>
                </div>

                {/* Goal Conversion Probability */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    GOAL CONVERSION RATE: <span style={{ color: '#22c55e', fontWeight: 900 }}>{penaltyGoalProb}%</span>
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="88"
                    step="1"
                    value={penaltyGoalProb}
                    onChange={(e) => setPenaltyGoalProb(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#22c55e' }}
                  />
                  <small style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                    Keeper save chance: {100 - penaltyGoalProb}%. Lower goal % protects platform house edge.
                  </small>
                </div>

                {/* Min / Max Bet Limits */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    WAGER LIMITS (KES)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      placeholder="Min KES"
                      value={penaltyMinBet}
                      onChange={(e) => setPenaltyMinBet(Number(e.target.value))}
                      style={{ flex: 1, height: 36, background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', textAlign: 'center', fontSize: 12 }}
                    />
                    <input
                      type="number"
                      placeholder="Max KES"
                      value={penaltyMaxBet}
                      onChange={(e) => setPenaltyMaxBet(Number(e.target.value))}
                      style={{ flex: 1, height: 36, background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', textAlign: 'center', fontSize: 12 }}
                    />
                  </div>
                  <small style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                    Min bet: KES {penaltyMinBet} • Max bet: KES {penaltyMaxBet.toLocaleString()}
                  </small>
                </div>
              </div>
            </section>

            {/* Configurable Multiplier Ladder */}
            <section className="jp-admin-panel" style={{ marginBottom: 24 }}>
              <div className="jp-panel-header">
                <h4>📊 Step-by-Step Multiplier Ladder ({penaltyMultipliers.length} Steps)</h4>
                <span style={{ fontSize: 10, color: '#64748b' }}>Every step must be strictly greater than the previous step</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                {penaltyMultipliers.map((mult, idx) => {
                  const shotNum = idx + 1;
                  const isCleanSweep = idx === penaltyMultipliers.length - 1;
                  const cumulativeProb = Math.pow(penaltyGoalProb / 100, shotNum) * 100;

                  return (
                    <div
                      key={shotNum}
                      style={{
                        background: isCleanSweep ? 'rgba(245, 158, 11, 0.1)' : '#090d16',
                        border: `1px solid ${isCleanSweep ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8,
                        padding: 10,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        Shot #{shotNum} {isCleanSweep && '🏆'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, margin: '6px 0' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={mult}
                          onChange={(e) => handleMultiplierChange(idx, e.target.value)}
                          style={{
                            width: 80,
                            padding: '6px 4px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 6,
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 800,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>x</span>
                      </div>
                      <div style={{ fontSize: 9.5, color: '#64748b' }}>
                        Win Chance: <strong style={{ color: '#cbd5e1' }}>{cumulativeProb.toFixed(1)}%</strong>
                      </div>
                      {isCleanSweep && (
                        <div style={{ marginTop: 4, fontSize: 9, fontWeight: 800, color: '#f59e0b', letterSpacing: 0.5 }}>
                          CLEAN SWEEP (MAX)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  onClick={loadPenaltyAdminData}
                  disabled={penaltySaving}
                  style={{
                    padding: '10px 16px',
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    color: '#94a3b8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Discard Changes
                </button>
                <button
                  onClick={handleSavePenaltySettings}
                  disabled={penaltySaving}
                  style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
                  }}
                >
                  {penaltySaving ? 'SAVING CONFIGURATION...' : '💾 SAVE PENALTY CONFIGURATION'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 7: ALL GAMES COMMAND CENTER & RISK TELEMETRY                  */}
        {/* ================================================================= */}
        {activeTab === 'games' && (
          <div className="jp-admin-games-view">
            {/* Header / Actions */}
            <div className="jp-panel-header" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>🎮</span> All Games Command Center & Math Engine Risk Management
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  Real-time financial telemetry, house margin enforcement, risk parameters, and provably fair audits across all 8 JetPesa originals.
                </p>
              </div>
              <button
                onClick={() => {
                  loadGamesOverview();
                  loadSelectedGameRounds(selectedAdminGame);
                }}
                disabled={gamesLoading || roundsLoading}
                className="jp-btn-refresh"
                style={{
                  padding: '7px 14px',
                  fontSize: 11,
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {gamesLoading ? 'Refreshing Telemetry...' : '🔄 Refresh All Telemetry'}
              </button>
            </div>

            {/* Platform-Wide Financials 4-Card KPI Banner */}
            <div className="jp-kpi-grid" style={{ marginBottom: 20 }}>
              <div className="jp-kpi-card">
                <span className="jp-kpi-label">TOTAL PLATFORM TURNOVER</span>
                <div className="jp-kpi-val text-amber">
                  KES {(gamesOverview?.totals?.grandTotalStaked || 0).toLocaleString()}
                </div>
                <small>Gross turnover across 8 games</small>
              </div>

              <div className="jp-kpi-card">
                <span className="jp-kpi-label">TOTAL PLAYER PAYOUTS</span>
                <div className="jp-kpi-val text-rose">
                  KES {(gamesOverview?.totals?.grandTotalWon || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <small>Total winnings paid to players</small>
              </div>

              <div className="jp-kpi-card">
                <span className="jp-kpi-label">NET PLATFORM GGR (HOUSE PROFIT)</span>
                <div className={`jp-kpi-val ${(gamesOverview?.totals?.grandGgr || 0) >= 0 ? 'text-green' : 'text-rose'}`}>
                  {(gamesOverview?.totals?.grandGgr || 0) >= 0 ? '+' : ''}KES {(gamesOverview?.totals?.grandGgr || 0).toFixed(2)}
                </div>
                <small>Net platform gaming revenue</small>
              </div>

              <div className="jp-kpi-card">
                <span className="jp-kpi-label">REALIZED PLATFORM RTP</span>
                <div className="jp-kpi-val text-cyan">
                  {gamesOverview?.totals?.platformRtp || 0}%
                </div>
                <small>Across {(gamesOverview?.totals?.grandTotalRounds || 0).toLocaleString()} recorded rounds</small>
              </div>
            </div>

            {/* 8-Game Navigation Selector Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                { id: 'aviator', icon: '🚀', name: 'JetPesa Aviator', tag: 'CRASH' },
                { id: 'mines', icon: '💣', name: 'JetPesa Mines', tag: 'INSTANT' },
                { id: 'penalty', icon: '⚽', name: 'Penalty Shootout', tag: 'SPORTS' },
                { id: 'plinko', icon: '🔺', name: 'JetPesa Plinko', tag: 'CRASH' },
                { id: 'dice', icon: '🎲', name: 'Classic Dice', tag: 'DICE' },
                { id: 'coinflip', icon: '🪙', name: 'Turbo Coinflip', tag: 'INSTANT' },
                { id: 'hilo', icon: '🃏', name: 'Hi-Lo Card Duel', tag: 'TABLE' },
                { id: 'roulette', icon: '🎯', name: 'Mini-Roulette', tag: 'TABLE' },
              ].map((g) => {
                const isSelected = selectedAdminGame === g.id;
                const gData = gamesOverview?.games?.[g.id];
                const isPaused = gData?.settings?.isPaused;
                const ggr = gData?.netHouseProfit || 0;

                return (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGame(g.id)}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(2, 132, 199, 0.35))'
                        : '#0b1329',
                      border: isSelected
                        ? '2px solid #38bdf8'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 10,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 18 }}>{g.icon}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isPaused ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: isPaused ? '#ef4444' : '#22c55e',
                          border: `1px solid ${isPaused ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                        }}
                      >
                        {isPaused ? 'PAUSED' : 'LIVE'}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                      {g.name}
                    </div>

                    <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{g.tag}</span>
                      <span style={{ color: ggr >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {ggr >= 0 ? '+' : ''}KES {Math.round(ggr).toLocaleString()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Game Detailed Management Station */}
            {(() => {
              const gameStats = gamesOverview?.games?.[selectedAdminGame] || {};
              const gameSettings = gameConfigDraft || gameStats?.settings || {};
              const targetRtp = Number(gameSettings?.targetRtp || 97.5);
              const houseEdge = Number((100 - targetRtp).toFixed(2));

              return (
                <div>
                  {/* Game Detail Header */}
                  <div
                    style={{
                      background: '#090e1d',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '16px 20px',
                      marginBottom: 20,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ margin: 0, fontSize: 20, color: '#fff', fontWeight: 900 }}>
                          {gameSettings.title || selectedAdminGame}
                        </h2>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                          }}
                        >
                          CATEGORY: {gameSettings.category || 'ORIGINALS'}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                        ID: <code style={{ color: '#fbbf24' }}>{selectedAdminGame}</code> • Dynamic Provably Fair SHA-256 Engine
                      </p>
                    </div>

                    {/* Emergency Killswitch Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
                        OPERATIONAL STATUS:
                      </span>
                      <button
                        onClick={() => {
                          setGameConfigDraft((prev) => ({
                            ...(prev || gameSettings),
                            isPaused: !Boolean(prev?.isPaused ?? gameSettings?.isPaused),
                          }));
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 16px',
                          borderRadius: 8,
                          border: gameConfigDraft?.isPaused ? '1px solid #ef4444' : '1px solid #22c55e',
                          background: gameConfigDraft?.isPaused ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: gameConfigDraft?.isPaused ? '#ef4444' : '#22c55e',
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: 12,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <span>{gameConfigDraft?.isPaused ? '🔴' : '🟢'}</span>
                        {gameConfigDraft?.isPaused ? 'GAME PAUSED (MAINTENANCE)' : 'OPERATIONAL (ACCEPTING BETS)'}
                      </button>
                    </div>
                  </div>

                  {/* 4-Card Game Telemetry Grid (Aviator Style) */}
                  <div className="jp-engine-metrics-grid" style={{ marginBottom: 20 }}>
                    <div className="jp-engine-metric-card">
                      <span className="jp-engine-metric-label">GROSS WAGERS & TURNOVER</span>
                      <span className="jp-engine-metric-val val-blue">
                        KES {(gameStats.totalStaked || 0).toLocaleString()}
                      </span>
                      <span className="jp-engine-metric-sub">
                        Across {(gameStats.totalRounds || 0).toLocaleString()} played rounds
                      </span>
                    </div>

                    <div className="jp-engine-metric-card">
                      <span className="jp-engine-metric-label">TOTAL PLAYER CASHOUTS</span>
                      <span className="jp-engine-metric-val val-green">
                        KES {(gameStats.totalWon || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="jp-engine-metric-sub">
                        Win Rate: {gameStats.winRate || 0}% of rounds
                      </span>
                    </div>

                    <div className="jp-engine-metric-card">
                      <span className="jp-engine-metric-label">NET HOUSE PROFIT (GGR)</span>
                      <span className={`jp-engine-metric-val ${(gameStats.netHouseProfit || 0) >= 0 ? 'val-green' : 'val-red'}`}>
                        {(gameStats.netHouseProfit || 0) >= 0 ? '+' : ''}KES {(gameStats.netHouseProfit || 0).toFixed(2)}
                      </span>
                      <span className="jp-engine-metric-sub">
                        Retention: {((100 - (gameStats.realizedRtp || 0))).toFixed(1)}% of total wagers
                      </span>
                    </div>

                    <div className="jp-engine-metric-card highlight-target">
                      <span className="jp-engine-metric-label">REALIZED RTP vs TARGET RTP</span>
                      <span className="jp-engine-metric-val val-gold">
                        {gameStats.realizedRtp || 0}%
                      </span>
                      <span className="jp-engine-metric-sub">
                        Target RTP: {targetRtp}% (House Edge: {houseEdge}%)
                      </span>
                    </div>
                  </div>

                  {/* Mathematical Risk, Margin & Volatility Tuning Panel */}
                  <section className="jp-admin-panel" style={{ marginBottom: 24, padding: 20 }}>
                    <div className="jp-panel-header" style={{ marginBottom: 16 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>⚙️</span> Risk, Margin & Multipliers Mathematical Engine
                        </h4>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          Tune return-to-player percentages, stake boundaries, and game parameters in real-time.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                      {/* Left Column: RTP & Stake Limits */}
                      <div style={{ background: '#090d16', padding: 16, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1' }}>
                              TARGET RTP (RETURN TO PLAYER):
                            </label>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8' }}>
                              {gameConfigDraft?.targetRtp || 97.5}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="85.0"
                            max="99.5"
                            step="0.1"
                            value={gameConfigDraft?.targetRtp || 97.5}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setGameConfigDraft((prev) => ({
                                ...(prev || gameSettings),
                                targetRtp: val,
                                houseEdge: parseFloat((100 - val).toFixed(2)),
                              }));
                            }}
                            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                            <span>85.0% (Tight House Edge: 15%)</span>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>
                              House Edge: {(100 - (gameConfigDraft?.targetRtp || 97.5)).toFixed(1)}%
                            </span>
                            <span>99.5% (Max Loose)</span>
                          </div>
                        </div>

                        {/* Min / Max Bet Controls */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                              MIN BET (KES):
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={gameConfigDraft?.minBet ?? 10}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                setGameConfigDraft((prev) => ({
                                  ...(prev || gameSettings),
                                  minBet: val,
                                }));
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 800,
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                              MAX BET (KES):
                            </label>
                            <input
                              type="number"
                              min="100"
                              step="1000"
                              value={gameConfigDraft?.maxBet ?? 50000}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1000;
                                setGameConfigDraft((prev) => ({
                                  ...(prev || gameSettings),
                                  maxBet: val,
                                }));
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 800,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Game-Specific Parameter Controls */}
                      <div style={{ background: '#090d16', padding: 16, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1', marginBottom: 12 }}>
                          GAME-SPECIFIC RISK & ENGINE PARAMETERS:
                        </div>

                        {selectedAdminGame === 'aviator' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX MULTIPLIER CAP:
                              </label>
                              <input
                                type="number"
                                value={gameConfigDraft?.maxMultiplier ?? 10000}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxMultiplier: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                PROFIT TARGET (%):
                              </label>
                              <input
                                type="number"
                                value={gameConfigDraft?.profitTargetPercent ?? 50}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, profitTargetPercent: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'mines' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX HIDDEN MINES:
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="24"
                                value={gameConfigDraft?.maxMines ?? 24}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxMines: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MULTIPLIER CAP (x):
                              </label>
                              <input
                                type="number"
                                value={gameConfigDraft?.maxMultiplier ?? 5000}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxMultiplier: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'plinko' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX SELECTABLE ROWS:
                              </label>
                              <input
                                type="number"
                                min="8"
                                max="16"
                                value={gameConfigDraft?.maxRows ?? 16}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxRows: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                              <span>Available risk tiers: Low, Medium, High</span>
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'dice' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MIN ROLL TARGET:
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={gameConfigDraft?.minRoll ?? 1.00}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, minRoll: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX ROLL TARGET:
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={gameConfigDraft?.maxRoll ?? 98.00}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxRoll: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'coinflip' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                BASE FLIP MULTIPLIER:
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={gameConfigDraft?.baseMultiplier ?? 1.96}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, baseMultiplier: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX CONSECUTIVE STREAK:
                              </label>
                              <input
                                type="number"
                                min="3"
                                max="25"
                                value={gameConfigDraft?.maxStreak ?? 15}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxStreak: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'hilo' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX SKIPS ALLOWED:
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                value={gameConfigDraft?.maxSkips ?? 3}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxSkips: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                SAME RANK MULTIPLIER:
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={gameConfigDraft?.sameMultiplier ?? 12.61}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, sameMultiplier: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'roulette' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                STRAIGHT-UP PAYOUT (x):
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                value={gameConfigDraft?.straightMultiplier ?? 36.0}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, straightMultiplier: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                              <span>European 37-pocket wheel (0-36). Outside bets return 2.0x.</span>
                            </div>
                          </div>
                        )}

                        {selectedAdminGame === 'penalty' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                MAX SHOTS IN STREAK:
                              </label>
                              <input
                                type="number"
                                min="3"
                                max="15"
                                value={gameConfigDraft?.maxShots ?? 8}
                                onChange={(e) => setGameConfigDraft((prev) => ({ ...prev, maxShots: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}
                              />
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                              <span>For custom shot-by-shot ladders, visit the dedicated Penalty tab.</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                      <button
                        onClick={() => {
                          if (gameStats?.settings) setGameConfigDraft({ ...gameStats.settings });
                        }}
                        disabled={gameSaving}
                        style={{
                          padding: '10px 18px',
                          background: '#1e293b',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 8,
                          color: '#94a3b8',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Reset to Stored Settings
                      </button>

                      <button
                        onClick={handleSaveGameConfig}
                        disabled={gameSaving}
                        style={{
                          padding: '10px 26px',
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 900,
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                        }}
                      >
                        {gameSaving ? 'SAVING CONFIGURATION...' : `💾 SAVE ${gameSettings.title?.toUpperCase() || 'GAME'} CONFIGURATION`}
                      </button>
                    </div>
                  </section>

                  {/* Live Rounds Audit & Provably Fair Trail Table */}
                  <section className="jp-admin-panel">
                    <div className="jp-panel-header" style={{ marginBottom: 14 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>🎲</span> Live Rounds & Provably Fair Audit Trail ({selectedGameRounds.length} Rounds)
                        </h4>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          Transparent cryptographic audit of recent rounds, player stakes, outcomes, and seed hashes.
                        </span>
                      </div>
                      <button
                        onClick={() => loadSelectedGameRounds(selectedAdminGame)}
                        disabled={roundsLoading}
                        style={{
                          padding: '5px 12px',
                          fontSize: 11,
                          background: '#1e293b',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        {roundsLoading ? 'Loading Rounds...' : '🔄 Refresh Trail'}
                      </button>
                    </div>

                    <div className="jp-admin-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                      <table className="jp-admin-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#0b1329', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>ROUND / DROP ID</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>PILOT / USER</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>STAKE</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>MULTIPLIER</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>PAYOUT</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>STATUS</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>DETAILS</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>PROVABLY FAIR HASH</th>
                            <th style={{ padding: '10px 12px', fontSize: 11, color: '#94a3b8' }}>TIME</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGameRounds.length === 0 ? (
                            <tr>
                              <td colSpan="9" style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                                {roundsLoading ? 'Loading recent rounds...' : 'No recorded rounds for this game yet.'}
                              </td>
                            </tr>
                          ) : (
                            selectedGameRounds.map((rnd, i) => {
                              const isWon = rnd.status === 'WON' || rnd.status === 'CASHED_OUT';
                              const isBust = rnd.status === 'BUSTED' || rnd.status === 'LOST';

                              return (
                                <tr
                                  key={rnd.id || i}
                                  style={{
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                  }}
                                >
                                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#93c5fd' }}>
                                    {rnd.id}
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                    {rnd.user || 'Unknown'}
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                                    KES {Number(rnd.stake || 0).toLocaleString()}
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#fff', fontWeight: 800 }}>
                                    {rnd.multiplier ? `${Number(rnd.multiplier).toFixed(2)}x` : '-'}
                                  </td>
                                  <td
                                    style={{
                                      padding: '8px 12px',
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: isWon ? '#4ade80' : '#94a3b8',
                                    }}
                                  >
                                    KES {Number(rnd.payout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span
                                      style={{
                                        fontSize: 9.5,
                                        fontWeight: 800,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: isWon
                                          ? 'rgba(34, 197, 94, 0.2)'
                                          : isBust
                                          ? 'rgba(239, 68, 68, 0.2)'
                                          : 'rgba(234, 179, 8, 0.2)',
                                        color: isWon ? '#4ade80' : isBust ? '#f87171' : '#facc15',
                                      }}
                                    >
                                      {rnd.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 10.5, color: '#cbd5e1' }}>
                                    {rnd.details || '-'}
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>
                                    <span title={rnd.seedHash}>
                                      {rnd.seedHash ? `${rnd.seedHash.substring(0, 14)}...` : '-'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                                    {rnd.createdAt ? new Date(rnd.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* MODAL: OVERRIDE ROUND MULTIPLIER                                  */}
      {/* ================================================================= */}
      {overrideModal.open && (
        <div className="jp-modal-overlay">
          <div className="jp-modal-box">
            <div className="jp-modal-head">
              <h3>Override Crash Point for Round #{overrideModal.cycleIndex}</h3>
              <button onClick={() => setOverrideModal({ open: false, cycleIndex: null, currentPoint: 2.0, newPoint: '' })}>✕</button>
            </div>

            <div className="jp-modal-content">
              <p>
                Set a specific crash multiplier for this upcoming flight. The game engine and all connected clients will honor this exact target.
              </p>

              <label>CUSTOM CRASH MULTIPLIER (1.00x - 10,000.00x):</label>
              <input
                type="number"
                step="0.01"
                min="1.00"
                max="10000.00"
                placeholder="e.g. 250.00, 1000.00, or 1.00"
                value={overrideModal.newPoint}
                onChange={(e) => setOverrideModal({ ...overrideModal, newPoint: e.target.value })}
              />

              <div className="jp-quick-mults">
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '1.00' })}>Instant 1.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '2.50' })}>2.50x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '10.00' })}>10.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '50.00' })}>50.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '100.00' })}>100.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '250.00' })}>250.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '500.00' })}>500.00x</button>
                <button onClick={() => setOverrideModal({ ...overrideModal, newPoint: '1000.00' })}>1,000.00x</button>
              </div>

              <div className="jp-modal-actions">
                <button
                  className="jp-btn-revert"
                  onClick={() => {
                    setOverrideModal({ ...overrideModal, newPoint: 'reset' });
                    submitRoundOverride();
                  }}
                >
                  Revert to Provably Fair Seed
                </button>
                <button className="jp-btn-save" onClick={submitRoundOverride}>
                  Confirm Override →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ADJUST USER WALLET BALANCE                                 */}
      {/* ================================================================= */}
      {adjustModal.open && adjustModal.user && (
        <div className="jp-modal-overlay">
          <div className="jp-modal-box">
            <div className="jp-modal-head">
              <h3>Adjust Balance: {adjustModal.user.phone || adjustModal.user.displayName}</h3>
              <button onClick={() => setAdjustModal({ open: false, user: null, amount: '', reason: '' })}>✕</button>
            </div>

            <div className="jp-modal-content">
              <p>
                Current Balance: <strong>KES {adjustModal.user.walletBalance.toFixed(2)}</strong>
              </p>

              <label>AMOUNT TO CREDIT (+) OR DEBIT (-) IN KES:</label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 500 or -200"
                value={adjustModal.amount}
                onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })}
              />

              <label style={{ marginTop: 12 }}>REASON / AUDIT NOTE:</label>
              <input
                type="text"
                placeholder="e.g. Manual M-Pesa verification bonus"
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
              />

              <div className="jp-modal-actions">
                <button className="jp-btn-save" onClick={submitBalanceAdjustment}>
                  Apply Adjustment →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Admin Panel */}
      <style dangerouslySetInnerHTML={{
        __html: `
        body { margin: 0; background: #030712; color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 11.5px; }
        .jp-admin-app { min-height: 100vh; background: #030712; display: flex; flex-direction: column; font-size: 11.5px; }
        
        /* Header */
        .jp-admin-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px); flex-wrap: wrap; gap: 10px; }
        .jp-admin-brand { display: flex; align-items: center; gap: 8px; }
        .jp-admin-brand h1 { margin: 0; font-size: 13px; font-weight: 900; letter-spacing: 0.05em; color: #fff; }
        .jp-admin-pill { background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; font-size: 8.5px; font-weight: 900; padding: 2px 6px; border-radius: 999px; }

        /* System-Wide Continuous House Profit Target Strip */
        .jp-admin-profit-strip { display: flex; align-items: center; gap: 8px; background: rgba(11, 19, 38, 0.9); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9px; padding: 4px 10px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45), inset 0 0 12px rgba(16, 185, 129, 0.05); }
        .jp-profit-left-group { display: flex; align-items: center; gap: 6px; }
        .jp-profit-badge-label { display: flex; align-items: center; gap: 4px; font-weight: 900; font-size: 10px; color: #10b981; letter-spacing: 0.04em; }
        .jp-profit-target-icon { font-size: 11px; }
        .jp-profit-title { color: #e2e8f0; font-size: 9.5px; font-weight: 800; }
        
        /* Interactive ON / OFF Toggle Switch */
        .jp-profit-toggle-switch { position: relative; width: 34px; height: 18px; background: #1e293b; border-radius: 999px; cursor: pointer; transition: background 0.2s, box-shadow 0.2s, border-color 0.2s; border: 1px solid rgba(255, 255, 255, 0.15); display: inline-block; vertical-align: middle; }
        .jp-profit-toggle-switch.active { background: #059669; border-color: #34d399; box-shadow: 0 0 8px rgba(16, 185, 129, 0.45); }
        .jp-toggle-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; background: #ffffff; border-radius: 999px; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
        .jp-profit-toggle-switch.active .jp-toggle-knob { transform: translateX(16px); }
        .jp-profit-toggle-label { font-size: 9px; font-weight: 900; letter-spacing: 0.05em; min-width: 22px; }
        .jp-profit-toggle-label.on { color: #34d399; }
        .jp-profit-toggle-label.off { color: #64748b; }


        .jp-profit-input-group { display: flex; align-items: center; gap: 5px; }
        .jp-unit-mode-toggle { display: inline-flex; background: #040814; border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 5px; padding: 1px; gap: 1px; }
        .jp-unit-mode-btn { background: transparent; border: none; color: #64748b; font-size: 8.5px; font-weight: 900; padding: 2px 5px; border-radius: 3.5px; cursor: pointer; transition: all 0.15s; }
        .jp-unit-mode-btn.active { background: #1e293b; color: #34d399; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); }
        .jp-profit-input-wrap { display: flex; align-items: center; background: #040814; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 5px; padding: 2px 7px; gap: 4px; }
        .jp-profit-input-wrap:focus-within { border-color: #34d399; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
        .jp-profit-currency { font-size: 9.5px; font-weight: 900; color: #10b981; user-select: none; }
        .jp-profit-input { width: 58px; background: transparent; border: none; outline: none; color: #fff; font-weight: 900; font-size: 11px; font-family: ui-monospace, monospace; text-align: right; }
        .jp-profit-input.jp-profit-input-wide { width: 72px; }
        .jp-profit-input::-webkit-inner-spin-button, .jp-profit-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .jp-profit-apply-btn { background: #1e293b; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 800; cursor: pointer; transition: all 0.15s; }
        .jp-profit-apply-btn:hover:not(:disabled) { background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; color: #fff; }
        .jp-profit-apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .jp-profit-status-display { display: flex; align-items: center; }
        .jp-profit-status-badge { display: flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 5px; font-size: 9.5px; font-weight: 800; }
        .jp-profit-status-badge.active { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; }
        .jp-profit-status-badge.secured { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; }
        .jp-profit-status-badge.idle { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #64748b; }
        .jp-profit-indicator-dot { width: 5px; height: 5px; border-radius: 999px; }
        .jp-profit-indicator-dot.active { background: #10b981; box-shadow: 0 0 6px #10b981; animation: jpBlink 1.4s infinite; }
        .jp-profit-indicator-dot.secured { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
        .jp-profit-indicator-dot.idle { background: #475569; }
        .jp-profit-target-val { font-family: ui-monospace, monospace; font-weight: 900; }
        .jp-profit-cap-tag { background: #0f172a; border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; padding: 1px 4px; border-radius: 3px; font-size: 8.5px; font-weight: 900; }
        .jp-profit-secured-tag { background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.5); color: #38bdf8; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 900; }
        
        .jp-admin-telemetry { display: flex; align-items: center; }
        .jp-admin-live-badge { display: flex; align-items: center; gap: 6px; background: #090d16; border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 800; }
        .jp-pulse-dot { width: 7px; height: 7px; border-radius: 999px; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: jpBlink 1.2s infinite; }
        .jp-tele-divider { color: #475569; }

        .jp-admin-head-actions { display: flex; align-items: center; gap: 8px; }
        .jp-admin-dash-link { color: #38bdf8; text-decoration: none; font-size: 10.5px; font-weight: 800; padding: 5px 10px; border-radius: 6px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); }
        .jp-admin-logout-btn { background: #1f2937; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1); padding: 5px 11px; border-radius: 6px; font-size: 10.5px; font-weight: 800; cursor: pointer; }

        /* Tabs */
        .jp-admin-tabs { display: flex; gap: 5px; padding: 8px 20px; background: #080d1a; border-bottom: 1px solid rgba(255,255,255,0.05); overflow-x: auto; }
        .jp-admin-tab-btn { background: transparent; border: none; color: #94a3b8; font-size: 11.5px; font-weight: 800; padding: 7px 14px; border-radius: 8px; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .jp-admin-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.04); }
        .jp-admin-tab-btn.active { color: #fff; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }

        /* Body */
        .jp-admin-body { padding: 18px 20px; max-width: 1400px; width: 100%; margin: 0 auto; box-sizing: border-box; }

        /* Spotlight Card */
        .jp-admin-spotlight-card { display: flex; align-items: center; justify-content: space-between; background: radial-gradient(circle at top left, #1e1b4b 0%, #0f172a 60%, #070a14 100%); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 14px; padding: 18px 24px; margin-bottom: 18px; box-shadow: 0 16px 36px rgba(0,0,0,0.55); flex-wrap: wrap; gap: 16px; }
        .jp-spotlight-left { max-width: 420px; }
        .jp-spotlight-tag { font-size: 9px; font-weight: 900; color: #818cf8; letter-spacing: 0.1em; display: block; margin-bottom: 4px; }
        .jp-spotlight-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
        .jp-spotlight-title h2 { margin: 0; font-size: 20px; font-weight: 900; color: #fff; }
        .jp-spotlight-timer { font-size: 11px; font-weight: 800; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 999px; }
        .jp-spotlight-desc { margin: 0; font-size: 10.5px; color: #94a3b8; line-height: 1.4; }

        .jp-spotlight-mult-box { text-align: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 22px; min-width: 160px; }
        .jp-spotlight-label { font-size: 9px; font-weight: 900; color: #64748b; letter-spacing: 0.08em; display: block; margin-bottom: 3px; }
        .jp-spotlight-mult-val { font-size: 32px; font-weight: 950; display: block; line-height: 1; margin-bottom: 6px; font-family: system-ui, sans-serif; }
        
        .jp-cat-badge { display: inline-block; font-size: 8.5px; font-weight: 900; padding: 2px 7px; border-radius: 999px; }
        .badge-instant { background: #374151; color: #9ca3af; }
        .badge-low { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
        .badge-high { background: rgba(168, 85, 247, 0.18); color: #c084fc; }
        .badge-mega { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

        .mult-instant { color: #9ca3af; }
        .mult-low { color: #60a5fa; }
        .mult-high { color: #c084fc; }
        .mult-mega { color: #fbbf24; text-shadow: 0 0 16px rgba(245,158,11,0.5); }

        .jp-spotlight-right { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .jp-override-active-badge { text-align: right; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); padding: 6px 11px; border-radius: 8px; color: #fda4af; font-size: 10.5px; font-weight: 800; }
        .jp-override-active-badge small { display: block; font-size: 9px; color: #f43f5e; margin-top: 2px; }
        .jp-override-natural-badge { text-align: right; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); padding: 6px 11px; border-radius: 8px; color: #86efac; font-size: 10.5px; font-weight: 800; }
        .jp-override-natural-badge small { display: block; font-size: 9px; color: #4ade80; margin-top: 2px; }
        .jp-override-trigger-btn { background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; border: none; padding: 7px 14px; border-radius: 8px; font-size: 11.5px; font-weight: 800; cursor: pointer; transition: transform .15s; }
        .jp-override-trigger-btn:hover { transform: translateY(-1px); }

        /* Top Row Split: Compact History + Next 6 Departure Schedule (Left) + House Profit Engine (Right) */
        .jp-radar-top-grid { display: grid; grid-template-columns: 1fr 1.12fr; gap: 14px; margin-bottom: 18px; align-items: stretch; }
        @media (max-width: 1200px) {
          .jp-radar-top-grid { grid-template-columns: 1fr; }
        }

        /* Combined Oracle Strip (Past 5 + Next 6 Departure Schedule) */
        .jp-admin-history-strip { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 10px 12px; backdrop-filter: blur(10px); display: flex; flex-direction: column; justify-content: space-between; }
        .jp-history-compact { margin-bottom: 0; }
        .jp-oracle-sub-section { display: flex; flex-direction: column; gap: 3px; }
        .jp-oracle-divider { height: 1px; background: rgba(255, 255, 255, 0.07); margin: 6px 0 5px; }
        .jp-history-strip-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; flex-wrap: wrap; gap: 4px; }
        .jp-history-strip-title { display: flex; align-items: center; gap: 5px; }
        .jp-history-strip-title h3 { margin: 0; font-size: 10px; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
        .jp-history-clock-icon { font-size: 10.5px; }
        .jp-history-cards-grid { display: grid; gap: 4px; }
        .jp-history-cards-grid.grid-5 { grid-template-columns: repeat(5, 1fr); }
        .jp-history-cards-grid.grid-6 { grid-template-columns: repeat(6, 1fr); }
        @media (max-width: 600px) {
          .jp-history-cards-grid.grid-5, .jp-history-cards-grid.grid-6 { grid-template-columns: repeat(3, 1fr); }
        }
        .jp-history-card { background: rgba(4, 7, 15, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 7px; padding: 4px 6px; display: flex; flex-direction: column; gap: 2px; transition: transform 0.15s, border-color 0.15s; }
        .jp-history-card:hover { transform: translateY(-1px); border-color: rgba(255, 255, 255, 0.22); }
        .jp-history-card.border-instant { border-left: 2px solid #6b7280; }
        .jp-history-card.border-low { border-left: 2px solid #60a5fa; }
        .jp-history-card.border-high { border-left: 2px solid #c084fc; }
        .jp-history-card.border-mega { border-left: 2px solid #fbbf24; }
        .jp-history-card.jp-card-live { background: rgba(34, 197, 94, 0.09); border-color: rgba(34, 197, 94, 0.45); box-shadow: 0 0 12px rgba(34, 197, 94, 0.15); }
        .jp-history-card-top { display: flex; align-items: center; justify-content: space-between; }
        .jp-history-round-label { font-size: 7.5px; font-weight: 800; color: #94a3b8; font-family: ui-monospace, monospace; }
        .jp-history-card-body { margin: 1px 0; }
        .jp-history-mult-num { font-size: 13.5px; font-weight: 950; font-family: system-ui, sans-serif; line-height: 1; }
        .jp-history-card-footer { display: flex; align-items: center; justify-content: space-between; font-size: 7px; color: #64748b; font-weight: 700; margin-top: 1px; }
        .jp-history-ago { color: #64748b; font-size: 7px; }
        .jp-tag-override-sm { background: rgba(244, 63, 94, 0.15); color: #fda4af; padding: 1px 3px; border-radius: 3px; font-size: 6.5px; font-weight: 800; }
        .jp-tag-natural-sm { background: rgba(255,255,255,0.06); color: #94a3b8; padding: 1px 3px; border-radius: 3px; font-size: 6.5px; font-weight: 700; }
        .jp-btn-edit-micro { font-size: 7.5px; cursor: pointer; opacity: 0.8; transition: transform 0.12s; }
        .jp-btn-edit-micro:hover { transform: scale(1.15); opacity: 1; }
        .jp-history-empty { text-align: center; padding: 10px; color: #64748b; font-size: 9.5px; }

        /* House Profit Engine & Daily Target Calculator Panel (Right of History) */
        .jp-profit-engine-panel {
          background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.06) 0%, rgba(15, 23, 42, 0.85) 100%);
          border: 1px solid rgba(16, 185, 129, 0.28);
          border-radius: 14px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 7px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .jp-engine-metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        @media (max-width: 768px) {
          .jp-engine-metrics-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .jp-engine-metric-card { background: rgba(4, 7, 15, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
        .jp-engine-metric-card.highlight-target { border-color: rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.05); }
        .jp-engine-metric-label { font-size: 7.5px; font-weight: 800; color: #94a3b8; letter-spacing: 0.04em; margin-bottom: 2px; }
        .jp-engine-metric-val { font-size: 13.5px; font-weight: 950; font-family: ui-monospace, monospace; line-height: 1.1; }
        .jp-engine-metric-sub { font-size: 7.5px; color: #64748b; font-weight: 700; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .val-blue { color: #38bdf8; }
        .val-green { color: #34d399; }
        .val-gold { color: #fbbf24; }
        .val-red { color: #f43f5e; }

        .jp-engine-progress-wrap { background: rgba(4, 7, 15, 0.5); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 10px; }
        .jp-engine-progress-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 8.5px; }
        .jp-engine-progress-title { color: #cbd5e1; font-weight: 800; }
        .jp-engine-progress-title strong { color: #38bdf8; font-family: ui-monospace, monospace; font-size: 9.5px; }
        .jp-engine-status-tag { font-size: 7.5px; font-weight: 900; padding: 1px 6px; border-radius: 4px; letter-spacing: 0.03em; }
        .jp-engine-status-tag.tag-secured { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
        .jp-engine-status-tag.tag-enforcing { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); animation: jpBlink 1.6s infinite; }
        .jp-engine-status-tag.tag-idle { background: rgba(255, 255, 255, 0.05); color: #64748b; border: 1px solid rgba(255, 255, 255, 0.08); }
        
        .jp-engine-progress-bar { width: 100%; height: 5px; background: #0b1120; border-radius: 999px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.06); }
        .jp-engine-progress-fill { height: 100%; background: linear-gradient(90deg, #0284c7, #10b981); border-radius: 999px; transition: width 0.35s ease; }
        .jp-engine-progress-fill.secured { background: linear-gradient(90deg, #10b981, #059669); box-shadow: 0 0 8px #10b981; }

        .jp-engine-controls-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .jp-engine-control-label { font-size: 8px; font-weight: 900; color: #64748b; letter-spacing: 0.05em; margin-right: 2px; }
        .jp-engine-input-apply { display: flex; align-items: center; gap: 4px; }
        .jp-engine-lock-btn {
          background: linear-gradient(135deg, #059669, #10b981);
          color: #fff;
          border: none;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 8.5px;
          font-weight: 900;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
          white-space: nowrap;
        }
        .jp-engine-lock-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(16, 185, 129, 0.45); }
        .jp-engine-lock-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Middle Row: Side-by-side split (In-Flight Minimized + Daily Financials) */
        .jp-middle-split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; align-items: stretch; }
        @media (max-width: 980px) {
          .jp-middle-split-row { grid-template-columns: 1fr; }
        }
        .jp-inflight-min-panel { display: flex; flex-direction: column; border: 1px solid rgba(56, 189, 248, 0.2); background: radial-gradient(circle at top left, rgba(14, 165, 233, 0.04) 0%, rgba(15, 23, 42, 0.75) 100%); }
        .jp-daily-panel { display: flex; flex-direction: column; border: 1px solid rgba(168, 85, 247, 0.2); background: radial-gradient(circle at top right, rgba(168, 85, 247, 0.04) 0%, rgba(15, 23, 42, 0.75) 100%); }
        .jp-inflight-kpi-grid-min { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
        .jp-inflight-kpi-card { background: rgba(4, 7, 15, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 14px; }
        .jp-kpi-sublabel { font-size: 8.5px; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em; display: block; margin-bottom: 4px; }
        .jp-inflight-empty-min { text-align: center; padding: 16px 12px; background: rgba(4, 7, 15, 0.4); border: 1px dashed rgba(255, 255, 255, 0.08); border-radius: 8px; font-size: 10px; color: #64748b; margin-top: 8px; }
        .jp-inflight-scroll { max-height: 140px; overflow-y: auto; margin-top: 8px; }
        .jp-instant-crash-midway { display: flex; align-items: center; justify-content: center; }
        .jp-btn-instant-crash {
          background: linear-gradient(135deg, #e11d48, #9f1239);
          color: #fff;
          border: 1px solid rgba(244, 63, 94, 0.5);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.04em;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 0 10px rgba(225, 29, 72, 0.4);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .jp-btn-instant-crash:hover:not(:disabled) {
          background: linear-gradient(135deg, #f43f5e, #be123c);
          box-shadow: 0 0 16px rgba(244, 63, 94, 0.7);
          transform: translateY(-1px);
        }
        .jp-btn-instant-crash:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
          background: #1f2937;
          border-color: rgba(255, 255, 255, 0.1);
          color: #94a3b8;
        }
        .jp-date-picker-input { background: #090d16; border: 1px solid rgba(255, 255, 255, 0.12); color: #cbd5e1; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; outline: none; }
        .jp-mini-tab-btn { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 9.5px; font-weight: 800; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
        .jp-mini-tab-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
        .jp-mini-tab-btn.active { background: #1e293b; color: #fff; border-color: rgba(255, 255, 255, 0.2); }
        .jp-daily-summary-box { background: rgba(4, 7, 15, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 10.5px; }
        .jp-summary-line { display: flex; justify-content: space-between; align-items: center; }
        .jp-summary-line span { color: #94a3b8; }
        .jp-summary-line strong { color: #f8fafc; font-weight: 800; }

        /* Panels & Tables */
        .jp-admin-panel { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 16px 18px; backdrop-filter: blur(10px); }
        .jp-panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
        .jp-panel-header h3 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; }
        .jp-panel-note { font-size: 10px; color: #64748b; }

        .jp-table-wrap { overflow-x: auto; }
        .jp-admin-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
        .jp-admin-table th { padding: 9px 11px; background: rgba(0,0,0,0.3); color: #94a3b8; font-weight: 800; font-size: 9.5px; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .jp-admin-table td { padding: 9px 11px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #cbd5e1; }
        .jp-admin-table tr:hover { background: rgba(255,255,255,0.02); }
        .jp-admin-table tr.row-current { background: rgba(34, 197, 94, 0.06); border-left: 3px solid #22c55e; }

        .jp-table-mult { font-weight: 900; font-size: 12px; }
        .jp-tag-override { background: rgba(244, 63, 94, 0.15); color: #fda4af; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 800; }
        .jp-tag-natural { background: rgba(255,255,255,0.06); color: #94a3b8; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; }

        .jp-status-pill { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 900; }
        .pill-live { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .pill-queued { background: rgba(255,255,255,0.08); color: #94a3b8; }
        .pill-completed, .pill-won { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .pill-crashed, .pill-failed { background: rgba(244, 63, 94, 0.2); color: #fb7185; }
        .pill-active, .pill-pending { background: rgba(251, 191, 36, 0.2); color: #fde047; }
        .jp-deck-pill { background: #1e293b; color: #cbd5e1; padding: 2px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 800; }

        .jp-sm-btn { background: #1f2937; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; transition: background .15s; }
        .jp-sm-btn:hover { background: #374151; }

        /* KPI Grid */
        .jp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
        .jp-kpi-card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.3); }
        .jp-kpi-card label { display: block; font-size: 9px; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em; margin-bottom: 5px; }
        .jp-kpi-val { font-size: 18px; font-weight: 950; margin-bottom: 4px; }
        .jp-kpi-card small { display: block; font-size: 9.5px; color: #64748b; }
        .text-cyan { color: #38bdf8; }
        .text-amber { color: #fbbf24; }
        .text-green { color: #22c55e; }
        .text-rose { color: #f43f5e; }
        .text-white { color: #fff; }

        .jp-crypto-params { display: flex; flex-direction: column; gap: 8px; }
        .jp-param-line { font-size: 11px; display: flex; flex-direction: column; gap: 3px; }
        .jp-param-line code { background: #090d16; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 10.5px; color: #cbd5e1; word-break: break-all; }

        .jp-search-box input { background: #090d16; border: 1px solid rgba(255,255,255,0.12); padding: 6px 11px; border-radius: 8px; color: #fff; font-size: 11px; outline: none; width: 220px; }

        /* Modals */
        .jp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 99999; backdrop-filter: blur(8px); }
        .jp-modal-box { width: 100%; max-width: 440px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow: hidden; }
        .jp-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #131d35; }
        .jp-modal-head h3 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; }
        .jp-modal-head button { background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; }
        .jp-modal-content { padding: 18px; }
        .jp-modal-content p { margin: 0 0 12px; font-size: 11px; color: #94a3b8; line-height: 1.4; }
        .jp-modal-content label { display: block; font-size: 10px; font-weight: 800; color: #cbd5e1; margin-bottom: 5px; letter-spacing: 0.05em; }
        .jp-modal-content input { width: 100%; padding: 9px 11px; background: #090d16; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #fff; font-size: 12px; box-sizing: border-box; outline: none; }
        .jp-quick-mults { display: flex; gap: 5px; margin: 10px 0 16px; flex-wrap: wrap; }
        .jp-quick-mults button { background: #1e293b; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; }
        .jp-modal-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; }
        .jp-btn-revert { background: #1f2937; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 7px 12px; border-radius: 8px; font-size: 10.5px; font-weight: 800; cursor: pointer; }
        .jp-btn-save { background: linear-gradient(135deg, #e11d48, #be123c); border: none; color: #fff; padding: 7px 14px; border-radius: 8px; font-size: 10.5px; font-weight: 800; cursor: pointer; }

        /* Toast */
        .jp-admin-toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 16px; border-radius: 10px; font-size: 11.5px; font-weight: 800; z-index: 100000; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .jp-admin-toast-success { background: #065f46; color: #a7f3d0; border: 1px solid #10b981; }
        .jp-admin-toast-error { background: #881337; color: #fecdd3; border: 1px solid #f43f5e; }

        @keyframes jpBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      ` }} />
    </div>
  );
}
