import crypto from 'crypto';

export const ROULETTE_CONFIG = {
  minBet: 10,
  maxBet: 50000,
  rtp: '97.3%',
  houseEdge: '2.7%',
  totalPockets: 37,
};

// Official European single-zero roulette wheel order (clockwise)
export const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

export const BLACK_NUMBERS = [
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
];

export const BET_TYPES = {
  STRAIGHT: { name: 'Straight Up', multiplier: 36 },
  RED: { name: 'Red', multiplier: 2 },
  BLACK: { name: 'Black', multiplier: 2 },
  EVEN: { name: 'Even', multiplier: 2 },
  ODD: { name: 'Odd', multiplier: 2 },
  LOW: { name: '1 to 18 (Low)', multiplier: 2 },
  HIGH: { name: '19 to 36 (High)', multiplier: 2 },
  DOZEN_1: { name: '1st 12', multiplier: 3 },
  DOZEN_2: { name: '2nd 12', multiplier: 3 },
  DOZEN_3: { name: '3rd 12', multiplier: 3 },
  COL_1: { name: '1st Column', multiplier: 3 },
  COL_2: { name: '2nd Column', multiplier: 3 },
  COL_3: { name: '3rd Column', multiplier: 3 },
};

/**
 * Returns color of a given pocket number.
 * @param {number} num 
 * @returns {'green'|'red'|'black'}
 */
export function getPocketColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

/**
 * Resolves a Provably Fair roulette spin using HMAC-SHA256.
 * @param {string} serverSeed 
 * @param {string} clientSeed 
 * @param {number} nonce 
 * @returns {{ number: number, color: string, wheelIndex: number }}
 */
export function resolveRouletteSpin(serverSeed, clientSeed, nonce = 1) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:roulette`)
    .digest('hex');

  const randInt = parseInt(hash.slice(0, 8), 16);
  const winningNumber = randInt % 37;
  const wheelIndex = WHEEL_SEQUENCE.indexOf(winningNumber);
  const color = getPocketColor(winningNumber);

  return {
    number: winningNumber,
    color,
    wheelIndex,
  };
}

/**
 * Evaluates an array of player bets against the winning pocket.
 * @param {number} winningNumber 
 * @param {Array<{ type: string, value?: number, amount: number }>} bets 
 * @returns {{ totalStake: number, totalPayout: number, netProfit: number, evaluatedBets: Array }}
 */
export function evaluateRouletteBets(winningNumber, bets) {
  const color = getPocketColor(winningNumber);
  const isZero = winningNumber === 0;

  let totalStake = 0;
  let totalPayout = 0;
  const evaluatedBets = [];

  for (const bet of bets) {
    const amount = Number(bet.amount) || 0;
    if (amount <= 0) continue;
    totalStake += amount;

    let isWin = false;
    let multiplier = 0;
    const betType = String(bet.type).toUpperCase();

    if (betType === 'STRAIGHT') {
      const targetNum = Number(bet.value);
      isWin = targetNum === winningNumber;
      multiplier = isWin ? BET_TYPES.STRAIGHT.multiplier : 0;
    } else if (betType === 'RED') {
      isWin = !isZero && color === 'red';
      multiplier = isWin ? BET_TYPES.RED.multiplier : 0;
    } else if (betType === 'BLACK') {
      isWin = !isZero && color === 'black';
      multiplier = isWin ? BET_TYPES.BLACK.multiplier : 0;
    } else if (betType === 'EVEN') {
      isWin = !isZero && winningNumber % 2 === 0;
      multiplier = isWin ? BET_TYPES.EVEN.multiplier : 0;
    } else if (betType === 'ODD') {
      isWin = !isZero && winningNumber % 2 !== 0;
      multiplier = isWin ? BET_TYPES.ODD.multiplier : 0;
    } else if (betType === 'LOW') {
      isWin = winningNumber >= 1 && winningNumber <= 18;
      multiplier = isWin ? BET_TYPES.LOW.multiplier : 0;
    } else if (betType === 'HIGH') {
      isWin = winningNumber >= 19 && winningNumber <= 36;
      multiplier = isWin ? BET_TYPES.HIGH.multiplier : 0;
    } else if (betType === 'DOZEN_1') {
      isWin = winningNumber >= 1 && winningNumber <= 12;
      multiplier = isWin ? BET_TYPES.DOZEN_1.multiplier : 0;
    } else if (betType === 'DOZEN_2') {
      isWin = winningNumber >= 13 && winningNumber <= 24;
      multiplier = isWin ? BET_TYPES.DOZEN_2.multiplier : 0;
    } else if (betType === 'DOZEN_3') {
      isWin = winningNumber >= 25 && winningNumber <= 36;
      multiplier = isWin ? BET_TYPES.DOZEN_3.multiplier : 0;
    } else if (betType === 'COL_1') {
      // Numbers: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 (num % 3 === 1)
      isWin = !isZero && winningNumber % 3 === 1;
      multiplier = isWin ? BET_TYPES.COL_1.multiplier : 0;
    } else if (betType === 'COL_2') {
      // Numbers: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 (num % 3 === 2)
      isWin = !isZero && winningNumber % 3 === 2;
      multiplier = isWin ? BET_TYPES.COL_2.multiplier : 0;
    } else if (betType === 'COL_3') {
      // Numbers: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 (num % 3 === 0)
      isWin = !isZero && winningNumber % 3 === 0;
      multiplier = isWin ? BET_TYPES.COL_3.multiplier : 0;
    }

    const payout = Math.floor(amount * multiplier * 100) / 100;
    totalPayout += payout;

    evaluatedBets.push({
      ...bet,
      isWin,
      multiplier,
      payout,
    });
  }

  totalStake = Math.floor(totalStake * 100) / 100;
  totalPayout = Math.floor(totalPayout * 100) / 100;
  const netProfit = Math.floor((totalPayout - totalStake) * 100) / 100;

  return {
    totalStake,
    totalPayout,
    netProfit,
    evaluatedBets,
  };
}

/**
 * Generates a Provably Fair keypair for Roulette.
 */
export function generateRouletteKeyPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  return { serverSeed, serverSeedHash, clientSeed };
}
