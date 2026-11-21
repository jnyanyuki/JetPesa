/**
 * JetPesa Game-Specific Live Bets Feed Engine
 * Generates continuous, realistic, high-fidelity live bet streams,
 * metrics summaries, and outcomes tailored specifically to each game.
 */

import { getRandomPlayerPersona } from '../playerSeeds';
import { calculateMinesMultiplier } from './minesEngine';

export const GAME_FEED_CONFIG = {
  aviator: {
    gameId: 'aviator',
    title: 'JetPesa Aviator',
    activeLabel: 'IN FLIGHT',
    placedLabel: 'TOTAL PLACED',
    wonLabel: 'TOTAL WON',
    multCol: 'X',
    emptyTitle: 'Preparing new flight',
    emptySubtitle: 'Pilots are entering the cockpit...',
    onlineBase: 2450,
  },
  mines: {
    gameId: 'mines',
    title: 'JetPesa Mines',
    activeLabel: 'ACTIVE MINERS',
    placedLabel: 'TOTAL STAKED',
    wonLabel: 'TOTAL CASHOUTS',
    multCol: 'GEMS / X',
    emptyTitle: 'Exploring minefield',
    emptySubtitle: 'Explorers uncovering diamond tiles...',
    onlineBase: 1820,
  },
  penalty: {
    gameId: 'penalty',
    title: 'Penalty Shootout KES',
    activeLabel: 'ACTIVE STRIKERS',
    placedLabel: 'TOTAL KICKED',
    wonLabel: 'TOTAL WON',
    multCol: 'SHOTS / X',
    emptyTitle: 'Penalty shootout',
    emptySubtitle: 'Strikers stepping up to the spot...',
    onlineBase: 1340,
  },
  plinko: {
    gameId: 'plinko',
    title: 'JetPesa Plinko',
    activeLabel: 'DROPPING DISCS',
    placedLabel: 'TOTAL DROPPED',
    wonLabel: 'TOTAL WON',
    multCol: 'ROWS / X',
    emptyTitle: 'Dropping pyramid discs',
    emptySubtitle: 'Balls bouncing down the pegs...',
    onlineBase: 1680,
  },
  dice: {
    gameId: 'dice',
    title: 'Classic Dice (Over/Under)',
    activeLabel: 'ACTIVE ROLLERS',
    placedLabel: 'TOTAL ROLLED',
    wonLabel: 'TOTAL WON',
    multCol: 'TARGET / X',
    emptyTitle: 'Rolling digital dice',
    emptySubtitle: 'Rollers submitting target predictions...',
    onlineBase: 1540,
  },
  coinflip: {
    gameId: 'coinflip',
    title: 'Turbo Coinflip',
    activeLabel: 'ACTIVE FLIPPERS',
    placedLabel: 'TOTAL FLIPPED',
    wonLabel: 'TOTAL WON',
    multCol: 'STREAK / X',
    emptyTitle: 'Flipping golden coins',
    emptySubtitle: 'Streaks building on Heads or Tails...',
    onlineBase: 1290,
  },
  hilo: {
    gameId: 'hilo',
    title: 'Hi-Lo Card Duel',
    activeLabel: 'DUELING PLAYERS',
    placedLabel: 'TOTAL STAKED',
    wonLabel: 'TOTAL WON',
    multCol: 'PICK / X',
    emptyTitle: 'Dealing cards',
    emptySubtitle: 'Duelists predicting higher or lower...',
    onlineBase: 1150,
  },
  roulette: {
    gameId: 'roulette',
    title: 'Turbo Mini-Roulette',
    activeLabel: 'WHEEL SPINNERS',
    placedLabel: 'TOTAL CHIPS',
    wonLabel: 'TOTAL WON',
    multCol: 'POCKET / X',
    emptyTitle: 'Spinning European wheel',
    emptySubtitle: 'Chips placed on the 37-pocket layout...',
    onlineBase: 1470,
  },
};

export function getGameFeedConfig(gameId) {
  return GAME_FEED_CONFIG[gameId] || GAME_FEED_CONFIG.aviator;
}

const STAKE_DISTRIBUTION = [
  10, 20, 20, 50, 50, 50, 100, 100, 100, 150, 200, 250, 500, 500, 750, 1000, 1500, 2500, 5000
];

function getRandomStake() {
  return STAKE_DISTRIBUTION[Math.floor(Math.random() * STAKE_DISTRIBUTION.length)];
}

const PENALTY_MULTS = [1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.00];

export function generateGameLiveBet(gameId = 'aviator') {
  const persona = getRandomPlayerPersona();
  const bet = getRandomStake();
  const id = `live-${gameId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let mult = 1.0;
  let status = 'lost';
  let details = '';

  switch (gameId) {
    case 'mines': {
      const minesOptions = [1, 2, 3, 3, 3, 4, 5, 5, 8, 10];
      const minesCount = minesOptions[Math.floor(Math.random() * minesOptions.length)];
      const maxGems = Math.min(8, 25 - minesCount);
      const gems = Math.floor(Math.random() * maxGems) + 1;
      const calculated = calculateMinesMultiplier(minesCount, gems);
      const isWon = Math.random() < 0.62;

      mult = Number(calculated.toFixed(2));
      status = isWon ? 'cashed' : 'lost';
      details = isWon ? `💎 ${gems} Gems (${minesCount}M)` : `💥 Hit Mine (${gems} Gems)`;
      break;
    }

    case 'plinko': {
      const rows = [8, 12, 16][Math.floor(Math.random() * 3)];
      const risk = ['low', 'med', 'high'][Math.floor(Math.random() * 3)];
      const outcomes = risk === 'high'
        ? [0.2, 0.2, 0.3, 1.5, 4.0, 9.0, 29.0, 110.0, 1000.0]
        : risk === 'med'
        ? [0.4, 0.7, 1.1, 1.8, 3.0, 8.0, 20.0, 55.0]
        : [0.5, 0.9, 1.1, 1.4, 1.8, 3.0, 5.6];

      mult = outcomes[Math.floor(Math.random() * outcomes.length)];
      status = mult >= 1.0 ? 'cashed' : 'lost';
      details = `🔺 ${rows}R ${risk.toUpperCase()}`;
      break;
    }

    case 'dice': {
      const mode = Math.random() < 0.5 ? 'under' : 'over';
      const target = parseFloat((15.0 + Math.random() * 70.0).toFixed(1));
      const roll = parseFloat((Math.random() * 100.0).toFixed(2));
      const isWon = mode === 'under' ? roll < target : roll > target;
      const winChance = mode === 'under' ? target : (100 - target);
      mult = parseFloat((98.5 / Math.max(1, winChance)).toFixed(2));
      status = isWon ? 'cashed' : 'lost';
      details = `🎲 ${mode === 'under' ? '<' : '>'} ${target} (${roll})`;
      break;
    }

    case 'coinflip': {
      const flips = Math.floor(Math.random() * 4) + 1;
      const pick = Math.random() < 0.5 ? 'Heads' : 'Tails';
      const isWon = Math.random() < 0.52;
      mult = parseFloat(Math.pow(1.96, flips).toFixed(2));
      status = isWon ? 'cashed' : 'lost';
      details = `🪙 ${pick} (${flips}x)`;
      break;
    }

    case 'hilo': {
      const pick = Math.random() < 0.48 ? 'Higher ▲' : Math.random() < 0.94 ? 'Lower ▼' : 'Same 🎯';
      const isWon = Math.random() < 0.58;
      mult = pick === 'Same 🎯' ? 12.61 : parseFloat((1.35 + Math.random() * 2.10).toFixed(2));
      status = isWon ? 'cashed' : 'lost';
      details = `🃏 ${pick}`;
      break;
    }

    case 'roulette': {
      const types = ['Straight #', 'Red', 'Black', 'Even', 'Odd', '1st Dozen'];
      const pickType = types[Math.floor(Math.random() * types.length)];
      let isWon = false;
      const pocket = Math.floor(Math.random() * 37);

      if (pickType === 'Straight #') {
        mult = 36.00;
        isWon = Math.random() < 0.08;
        details = `🎯 Straight #${pocket}`;
      } else if (pickType === '1st Dozen') {
        mult = 3.00;
        isWon = Math.random() < 0.33;
        details = `🎯 1st Dozen (#${pocket})`;
      } else {
        mult = 2.00;
        isWon = Math.random() < 0.48;
        details = `🎯 ${pickType} (#${pocket})`;
      }
      status = isWon ? 'cashed' : 'lost';
      break;
    }

    case 'penalty': {
      const shots = Math.floor(Math.random() * 6) + 1;
      mult = PENALTY_MULTS[shots - 1] || 1.25;
      const isWon = Math.random() < 0.64;
      status = isWon ? 'cashed' : 'lost';
      details = `⚽ ${shots}/8 Goals`;
      break;
    }

    case 'aviator':
    default: {
      const cashout = parseFloat((1.10 + Math.random() * 4.50).toFixed(2));
      const isWon = Math.random() < 0.55;
      mult = cashout;
      status = isWon ? 'cashed' : 'lost';
      details = `🚀 ${cashout.toFixed(2)}x`;
      break;
    }
  }

  const payout = status === 'cashed' ? Math.floor(bet * mult) : 0;

  return {
    id,
    seed: persona.seed,
    username: persona.username,
    color: persona.color,
    category: persona.category,
    bet,
    mult,
    payout,
    status,
    details,
    time,
  };
}

export function generateInitialGameLiveBets(gameId = 'aviator', count = 18) {
  const bets = [];
  for (let i = 0; i < count; i++) {
    bets.push(generateGameLiveBet(gameId));
  }
  return bets;
}
