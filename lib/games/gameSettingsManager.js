import { sql } from '../db';

export const DEFAULT_GAMES_CONFIG = {
  aviator: {
    id: 'aviator',
    title: 'JetPesa Aviator',
    category: 'CRASH',
    targetRtp: 97.0,
    houseEdge: 3.0,
    minBet: 10,
    maxBet: 50000,
    maxMultiplier: 10000,
    isPaused: false,
    profitTargetPercent: 50,
  },
  mines: {
    id: 'mines',
    title: 'JetPesa Mines',
    category: 'INSTANT',
    targetRtp: 97.5,
    houseEdge: 2.5,
    minBet: 10,
    maxBet: 30000,
    maxMines: 24,
    maxMultiplier: 5000,
    isPaused: false,
  },
  penalty: {
    id: 'penalty',
    title: 'Penalty Shootout KES',
    category: 'SPORTS',
    targetRtp: 97.0,
    houseEdge: 3.0,
    minBet: 10,
    maxBet: 40000,
    maxShots: 8,
    multipliers: [1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.00],
    goalProbability: 0.75,
    isPaused: false,
  },
  plinko: {
    id: 'plinko',
    title: 'JetPesa Plinko',
    category: 'CRASH',
    targetRtp: 99.0,
    houseEdge: 1.0,
    minBet: 10,
    maxBet: 25000,
    maxRows: 16,
    isPaused: false,
  },
  dice: {
    id: 'dice',
    title: 'Classic Dice (Over/Under)',
    category: 'DICE',
    targetRtp: 98.5,
    houseEdge: 1.5,
    minBet: 10,
    maxBet: 100000,
    minRoll: 1.00,
    maxRoll: 98.00,
    isPaused: false,
  },
  coinflip: {
    id: 'coinflip',
    title: 'Turbo Coinflip',
    category: 'INSTANT',
    targetRtp: 98.0,
    houseEdge: 2.0,
    minBet: 10,
    maxBet: 50000,
    baseMultiplier: 1.96,
    maxStreak: 15,
    isPaused: false,
  },
  hilo: {
    id: 'hilo',
    title: 'Hi-Lo Card Duel',
    category: 'TABLE',
    targetRtp: 97.0,
    houseEdge: 3.0,
    minBet: 10,
    maxBet: 20000,
    maxSkips: 3,
    sameMultiplier: 12.61,
    isPaused: false,
  },
  roulette: {
    id: 'roulette',
    title: 'Turbo Mini-Roulette',
    category: 'TABLE',
    targetRtp: 97.3,
    houseEdge: 2.7,
    minBet: 10,
    maxBet: 50000,
    straightMultiplier: 36.0,
    isPaused: false,
  },
};

const settingsCache = new Map();
let lastCacheSync = 0;
const CACHE_TTL_MS = 3000;

/**
 * Retrieves the settings for a single game.
 */
export async function getGameSettings(gameId, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && settingsCache.has(gameId) && now - lastCacheSync < CACHE_TTL_MS) {
    return settingsCache.get(gameId);
  }

  const defaultConf = DEFAULT_GAMES_CONFIG[gameId] || {
    id: gameId,
    title: gameId,
    targetRtp: 97.0,
    houseEdge: 3.0,
    minBet: 10,
    maxBet: 50000,
    isPaused: false,
  };

  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS public.system_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const key = `game_settings_${gameId}`;
    const rows = await sql.query(`SELECT value FROM public.system_settings WHERE key = $1 LIMIT 1`, [key]);

    if (rows && rows.length > 0) {
      const dbVal = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      const merged = { ...defaultConf, ...dbVal };
      settingsCache.set(gameId, merged);
      lastCacheSync = now;
      return merged;
    }

    // Initialize with default
    await sql.query(`
      INSERT INTO public.system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO NOTHING
    `, [key, JSON.stringify(defaultConf)]);

    settingsCache.set(gameId, defaultConf);
    lastCacheSync = now;
    return defaultConf;
  } catch (err) {
    console.warn(`Could not read settings for ${gameId} from DB:`, err.message);
    return settingsCache.get(gameId) || defaultConf;
  }
}

/**
 * Saves updated settings for a specific game.
 */
export async function saveGameSettings(gameId, newSettings) {
  const current = await getGameSettings(gameId, true);
  const updated = {
    ...current,
    ...newSettings,
    updatedAt: new Date().toISOString(),
  };

  const key = `game_settings_${gameId}`;
  await sql.query(`
    INSERT INTO public.system_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, JSON.stringify(updated)]);

  settingsCache.set(gameId, updated);
  lastCacheSync = Date.now();
  return updated;
}

/**
 * Aggregates live financial and telemetry metrics for all games.
 */
export async function getComprehensiveGamesStats() {
  const gameIds = Object.keys(DEFAULT_GAMES_CONFIG);
  const stats = {};

  let grandTotalStaked = 0;
  let grandTotalWon = 0;
  let grandTotalRounds = 0;

  for (const gid of gameIds) {
    const settings = await getGameSettings(gid);
    let totalRounds = 0;
    let totalStaked = 0;
    let totalWon = 0;
    let wonRounds = 0;
    let activeRounds = 0;

    try {
      if (gid === 'aviator') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(win_amount), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds
          FROM public.bets
          WHERE round_id IS NOT NULL
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
        }
      } else if (gid === 'mines') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_rounds
          FROM public.mines_rounds
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
          activeRounds = Number(rows[0].active_rounds);
        }
      } else if (gid === 'penalty') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_rounds
          FROM public.penalty_rounds
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
          activeRounds = Number(rows[0].active_rounds);
        }
      } else if (gid === 'plinko') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE payout > stake)::int AS won_rounds
          FROM public.plinko_drops
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
        }
      } else if (gid === 'dice') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(amount), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'won')::int AS won_rounds
          FROM public.bets
          WHERE game_type = 'dice' OR bet_type = 'dice'
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
        }
      } else if (gid === 'coinflip') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_rounds
          FROM public.coinflip_rounds
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
          activeRounds = Number(rows[0].active_rounds);
        }
      } else if (gid === 'hilo') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(stake), 0)::numeric AS total_staked,
            COALESCE(SUM(payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE status = 'WON')::int AS won_rounds,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_rounds
          FROM public.hilo_rounds
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
          activeRounds = Number(rows[0].active_rounds);
        }
      } else if (gid === 'roulette') {
        const rows = await sql.query(`
          SELECT 
            COUNT(*)::int AS total_rounds,
            COALESCE(SUM(total_stake), 0)::numeric AS total_staked,
            COALESCE(SUM(total_payout), 0)::numeric AS total_won,
            COUNT(*) FILTER (WHERE total_payout > 0)::int AS won_rounds
          FROM public.roulette_spins
        `);
        if (rows && rows.length > 0) {
          totalRounds = Number(rows[0].total_rounds);
          totalStaked = Number(rows[0].total_staked);
          totalWon = Number(rows[0].total_won);
          wonRounds = Number(rows[0].won_rounds);
        }
      }
    } catch (e) {
      console.warn(`Error querying stats for game ${gid}:`, e.message);
    }

    const netHouseProfit = totalStaked - totalWon;
    const realizedRtp = totalStaked > 0 ? parseFloat(((totalWon / totalStaked) * 100).toFixed(1)) : 0;
    const winRate = totalRounds > 0 ? parseFloat(((wonRounds / totalRounds) * 100).toFixed(1)) : 0;

    stats[gid] = {
      id: gid,
      title: settings.title,
      totalRounds,
      totalStaked,
      totalWon,
      netHouseProfit,
      realizedRtp,
      winRate,
      activeRounds,
      settings,
    };

    grandTotalStaked += totalStaked;
    grandTotalWon += totalWon;
    grandTotalRounds += totalRounds;
  }

  const grandGgr = grandTotalStaked - grandTotalWon;
  const platformRtp = grandTotalStaked > 0 ? parseFloat(((grandTotalWon / grandTotalStaked) * 100).toFixed(1)) : 0;

  return {
    games: stats,
    totals: {
      grandTotalStaked,
      grandTotalWon,
      grandGgr,
      platformRtp,
      grandTotalRounds,
    },
  };
}

/**
 * Queries the recent rounds for the selected game.
 */
export async function getGameRecentRounds(gameId, limit = 25) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 25));

  try {
    if (gameId === 'aviator') {
      const rows = await sql.query(`
        SELECT 
          b.id, b.user_id, b.stake, b.multiplier, b.win_amount AS payout, 
          b.status, b.created_at,
          u.display_name, u.phone
        FROM public.bets b
        LEFT JOIN public.users u ON b.user_id = u.id
        WHERE b.round_id IS NOT NULL
        ORDER BY b.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: r.status,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'mines') {
      const rows = await sql.query(`
        SELECT 
          m.id, m.user_id, m.stake, m.mines_count, m.revealed_tiles, 
          m.current_multiplier, m.payout, m.status, m.server_seed_hash, m.created_at,
          u.display_name, u.phone
        FROM public.mines_rounds m
        LEFT JOIN public.users u ON m.user_id = u.id
        ORDER BY m.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.current_multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: r.status,
        details: `${r.mines_count} Mines • ${Array.isArray(r.revealed_tiles) ? r.revealed_tiles.length : 0} Gems`,
        seedHash: r.server_seed_hash,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'penalty') {
      const rows = await sql.query(`
        SELECT 
          p.id, p.user_id, p.stake, p.current_shot, p.current_multiplier, 
          p.payout, p.status, p.server_seed_hash, p.created_at,
          u.display_name, u.phone
        FROM public.penalty_rounds p
        LEFT JOIN public.users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.current_multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: r.status,
        details: `${r.current_shot} Goals`,
        seedHash: r.server_seed_hash,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'plinko') {
      const rows = await sql.query(`
        SELECT 
          d.id, d.user_id, d.stake, d.rows_count, d.risk_tier, 
          d.multiplier, d.payout, d.created_at,
          u.display_name, u.phone
        FROM public.plinko_drops d
        LEFT JOIN public.users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: Number(r.payout) > Number(r.stake) ? 'WON' : 'LOST',
        details: `${r.rows_count} Rows • ${r.risk_tier}`,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'coinflip') {
      const rows = await sql.query(`
        SELECT 
          c.id, c.user_id, c.stake, c.current_streak, c.current_multiplier, 
          c.payout, c.status, c.server_seed_hash, c.created_at,
          u.display_name, u.phone
        FROM public.coinflip_rounds c
        LEFT JOIN public.users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.current_multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: r.status,
        details: `${r.current_streak} Flips Streak`,
        seedHash: r.server_seed_hash,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'hilo') {
      const rows = await sql.query(`
        SELECT 
          h.id, h.user_id, h.stake, h.current_step, h.current_multiplier, 
          h.payout, h.status, h.server_seed_hash, h.created_at,
          u.display_name, u.phone
        FROM public.hilo_rounds h
        LEFT JOIN public.users u ON h.user_id = u.id
        ORDER BY h.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.current_multiplier),
        payout: Number(r.payout),
        profit: Number(r.payout) - Number(r.stake),
        status: r.status,
        details: `${r.current_step} Steps`,
        seedHash: r.server_seed_hash,
        createdAt: r.created_at,
      }));
    }

    if (gameId === 'roulette') {
      const rows = await sql.query(`
        SELECT 
          r.id, r.user_id, r.total_stake AS stake, r.winning_number, r.winning_color, 
          r.total_payout AS payout, r.net_profit AS profit, r.status, r.server_seed_hash, r.created_at,
          u.display_name, u.phone
        FROM public.roulette_spins r
        LEFT JOIN public.users u ON r.user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT $1
      `, [lim]);
      return rows.map((r) => ({
        id: r.id,
        user: r.display_name || r.phone || 'Anonymous',
        stake: Number(r.stake),
        multiplier: Number(r.stake) > 0 ? parseFloat((Number(r.payout) / Number(r.stake)).toFixed(2)) : 0,
        payout: Number(r.payout),
        profit: Number(r.profit),
        status: Number(r.payout) > 0 ? 'WON' : 'LOST',
        details: `Pocket ${r.winning_number} (${String(r.winning_color).toUpperCase()})`,
        seedHash: r.server_seed_hash,
        createdAt: r.created_at,
      }));
    }

    return [];
  } catch (err) {
    console.error(`Error querying recent rounds for ${gameId}:`, err);
    return [];
  }
}
