/**
 * JetPesa Natural Language Chat Synthesis Engine
 * Generates continuous, hyper-realistic, non-repeating community chat messages
 * tailored specifically to each game with live game-state awareness.
 */

import { getRandomPlayerPersona } from './playerSeeds';

// LRU memory buffer to prevent redundant repetition (keeps last 100 messages)
const recentMessagesMemory = [];
const MAX_MEMORY = 100;

function rememberMessage(msg) {
  recentMessagesMemory.push(msg.trim().toLowerCase());
  if (recentMessagesMemory.length > MAX_MEMORY) {
    recentMessagesMemory.shift();
  }
}

function hasBeenSaidRecently(msg) {
  const norm = msg.trim().toLowerCase();
  return recentMessagesMemory.includes(norm);
}

// -------------------------------------------------------------
// Universal Openers & Sheng/Swahili Expressions
// -------------------------------------------------------------
const UNIVERSAL_OPENERS = [
  'Wazee', 'Wakuu', 'Manze', 'Bana', 'Aiseee', 'Kusema ukweli', 'Wueh', 'Yooh',
  'Honestly', 'Wah', 'Enyewe', 'Round hii', 'Hii game', 'Today', 'Hapa JetPesa',
  'Guys', 'Kaka', 'Mimi leo', 'Bro', 'Acha nikuambie', 'Watu wangu',
  'Mazee', 'Basi sasa', 'Kweli kabisa', 'Sikilizeni wakuu'
];

const UNIVERSAL_WITHDRAWALS = [
  'Withdrawal yangu imeingia kwa sekunde chache tu kwa M-Pesa, big up JetPesa team!',
  'M-Pesa balance inasoma vizuri jioni ya leo shukrani kwa JetPesa!',
  'Admin, lini mnaweka rain ingine ya free bets? Tunangoja hapa! 🙏',
  'Platform iko on point, no hidden charges kwa payouts zetu.',
  'M-Pesa pay-in ilikua smooth, chini ya sekunde tatu balance ikasoma.',
  'Hii JetPesa ndio the real deal Kenya mzima, instant withdrawals kabisa.',
  'Nimeona jamaa amecash out 15,000 bob hapo juu! Hongera sana bro! 👏',
  'Discipline ndio siri hapa wazee, kidogo kidogo inajaza kibaba.'
];

// -------------------------------------------------------------
// GAME-SPECIFIC BANTER & STRATEGY POOLS
// -------------------------------------------------------------
const GAME_CHAT_POOLS = {
  // 1. AVIATOR
  aviator: {
    standalone: [
      'Ushauri wangu kwa wote: usikae sana kwa ndege, toka mapema 1.5x au 2x.',
      'Kwani huyu pilot leo anaenda moja kwa moja angani bila brake? 🚀😂',
      'Niliweka auto-cashout 1.60x, kila round napata profit bila kuhema.',
      'Tumeanza flight nyingine, kila mtu aweke seatbelt tayari kwa kuruka!',
      'Nani mwingine anatumia strategy ya Deck A safe na Deck B high target?',
      'Multiplier ya leo inanikumbusha siku nilipiga 45k hapa JetPesa.',
      'Mimi hutoa 1.7x mara nne mfululizo kisha nachukua mapumziko.',
      'Leo lazima tuoe rent na faida ya hapa. Let\'s fly wazee!',
      'Nashukuru sana nilicash out kwa wakati kabla haijafly away! 🛫'
    ],
    highMult: [
      'WHAAAAT?! Hii ndege haitaki kutua leo! 🚀🚀',
      'Yooh multiplier inapanda kama moshi! Nani bado ako ndani?!',
      'Mungu wangu nilitoka 2.5x ningebaki ningekua tajiri leo 😭😭',
      'Hii ni safari ya mbinguni direct! Hongera waliohold!',
      'Aiseee pilot hana breki leo! Multiplier ya ajabu kabisa!',
      'Incredible flight! Multiplier ya nguvu sana hapa JetPesa!'
    ],
    lowCrash: [
      'Aii kwani pilot amesahau kuweka mafuta? 😂',
      'Imekata mapema sana! Pole kwa waliochoma stake.',
      'Haikufika mbali lakini next round itafunguka vizuri sana.',
      'Acha ningoje round inayofuata, hii ilikua ya kufagia uwanja.',
      'Hapo ndipo umuhimu wa auto cashout 1.1x unapoonekana wazee.'
    ],
    countdown: [
      'Weka stake haraka countdown inaisha wazee!',
      'Deck A 100 KES, Deck B 50 KES, ready for takeoff! 🛫',
      'Seatbelts on! Hii round naona ikitufikisha 3x kwa urahisi.',
      'All pilots on board, radar is clear, let\'s go for the gold!'
    ],
  },

  // 2. MINES
  mines: {
    standalone: [
      'Gems 5 safi nimecash out 4.2x kabla sijakanyaga bomb! 💎💣',
      'Mimi huweka 3 mines tu nakusanya gems 6 taratibu bila pressure.',
      'Manze nilikua na diamonds 7 nikaongeza moja nikakanyaga mine 😭',
      'Bro toka na 3 gems uweke faida kwa mfuko, tamaa itakumaliza!',
      'Mines 10 inalipa deadly odds ukipata hata gems 2 tu!',
      'Hapo katikati round hii kuna diamond nimehisi, wacha niguse.',
      'Cashout ya 2,400 KES imeingia M-Pesa pap kutoka Mines! 🔥',
      'Strategy yangu ya Mines: corners 4 kwanza then cash out.',
      'Discipline kwa Mines ndio siri, ukiona 2.5x chukua pesa utoke.',
      'Nilikanyaga bomb kwa last tile wueh! Next round lazima nilipe kisasi.',
      'Gems ziko tele leo, nani ako na win streak ya Mines hapa?',
      '1 Mine setting ndio best kwa kukuza float polepole bila stress.'
    ],
    highMult: [
      'Gems 10 zimefunguka! Multiplier ya 15x imenilipa safi sana! 💎💎💎',
      'Aiseee nilikua na roho ya chuma! Cashout ya 8.5x imeingia wallet!',
      'Diamond grid yote karibu kijani! Hongera sana bro!',
      'Kabla bomb haijalipuka nilipiga cashout ya mwaka! 💰'
    ],
    lowCrash: [
      'First click bomb?! Kwani nilikanyaga landmine direct 😂',
      'Pole kwa aliyelipuka click ya kwanza, grid ijayo iko safi.',
      'Hiyo mine ilikua imejificha kona mbaya sana!'
    ],
    countdown: [
      'Chagua idadi ya mines uanze kuokota almasi wazee!',
      'Weka stake yako tuanze kufungua grid ya almasi.',
      'Minefield iko set, lets hunt some green diamonds! 💎'
    ],
  },

  // 3. PLINKO
  plinko: {
    standalone: [
      'Plinko 16 rows High Risk ndio njia ya kufika 1000x wazee! 🔺🚀',
      'Mpira imeruka hadi kando kabisa nikapiga 130x payout!',
      'Mimi hucheza 12 rows medium, inareturn consistently sana.',
      'Auto drop ya mipira 10 na 50 bob kila moja inalipa safi.',
      'Hii physics ya Plinko iko smooth sana maze, hakuna bias.',
      'Mpira imebounce katikati 0.2x mara mbili kisha 29x corner! 🔥',
      'Drop 8 zote zimeingia green zone! Pesa ya unga imepatikana.',
      'Nani ako high risk leo? Corners za 1000x zinaita!',
      'Plinko drop yangu ya 100 bob imenilipa 2,600 KES pap kwa wallet.',
      'Rapid auto drop mode on, let\'s watch the pins cascade!'
    ],
    highMult: [
      'CORNER HIT!! 1000x KWA PLINKO! WAAAH MUNGU WANGU! 🚀💥',
      'Mpira imeanguka 130x pin! Hongera bro umekula mzigo wa wiki!',
      'Corner ya pili leo! Plinko leo inapeana cash bila huruma!',
      'Pesa ya Krismasi imepatikana kwa disc moja tu! 💰'
    ],
    lowCrash: [
      'Mpira imeingia 0.2x katikati mara tatu mfululizo 😂',
      'Bouncing katikati ni normal, corner moja inafunika zote.',
      'Next drop itaelekea pembeni, physics zikijiset.'
    ],
    countdown: [
      'Select rows zako na risk tier uanze kudrop discs!',
      'Pins ziko tayari, let the balls bounce!'
    ],
  },

  // 4. CLASSIC DICE
  dice: {
    standalone: [
      'Classic Dice: Over 50.00 na stake ya 200 bob imetick safi! 🎲',
      'Mimi hucheza Under 80.00 safe bets za 1.22x nakula polepole.',
      'Nimechapa roll ya 98.4 Over 95.0 nikapiga 19.7x multiplier! 💥',
      'Provably fair seed imetick, hakuna mchezo wa chini ya maji.',
      'Rolled 12.4 on Under 20! Dice leo iko na mkono wa baraka.',
      'Strategy ya slider: 65% win chance ndio sweetest spot.',
      'Niliskip roll mbili kisha nikapiga Over 45, win mara tatu mfululizo.',
      'Instant roll speed ya hii dice inasaidia sana kufanya turnover haraka.',
      'Green target hits 5 mfululizo! Digital dice iko on fire leo.'
    ],
    highMult: [
      'ROLLED 99.1 OVER 98.0! Payout ya 49.5x imeingia wallet direct! 🎲🔥',
      'Under 2.00 imetick?! Hiyo ni 49x multiplier bro, congratulations!',
      'Sniper roll ya hali ya juu! Big win kwa dice!'
    ],
    lowCrash: [
      'Target ilikua 50.0 nikapata 49.9! Karibu sana daah 😂',
      'Roll moja nje ya target, lakini margin iko tight sana.',
      'Badilisha over/under uone bahati yako round ijayo.'
    ],
    countdown: [
      'Set target yako kwa slider kisha ubofye Roll Dice!',
      'Provably fair dice iko ready, let the numbers roll.'
    ],
  },

  // 5. TURBO COINFLIP
  coinflip: {
    standalone: [
      'Tails never fails wazee! Streak ya 4 mfululizo imenilipa 15x! 🪙',
      'Flip ya kwanza Heads, ya pili Heads, nikatoka na 3.84x safi.',
      'Nani ako kwa streak ya 5 flips leo? Coinflip iko moto.',
      'Nilijaribu kubadili Heads ikakuja Tails daah! Lakini next coin itatick.',
      'Hapa ni simple: chagua upande wako, shikilia bila kutetemeka.',
      'Flip ya 500 bob ikapiga 2 streak nikaingiza 1,920 KES safi sana.',
      'Golden Kenyan coin animation iko top tier kabisa.',
      'Pesa ya unga imepatikana kwa flips tatu tu! Hongera wakuu.',
      'Streak ya 3 inakupa karibu 8x stake yako, toka hapo mapema.'
    ],
    highMult: [
      'STREAK YA 6 FLIPS MFULULIZO! Payout ya 56x imeingia wallet! 🪙🔥',
      'Tails mara tano mfululizo! Nani mwingine alikua ndani?!',
      'Golden coin streak ya mwaka! Hongera bro umepiga jackpot!'
    ],
    lowCrash: [
      'Kwani coin imeanguka upande mbaya round hii 😂',
      'Streak imevunjika kwa flip ya 3, lakini faida tulikua tushashika.',
      'Anza streak mpya, bahati ipo upande wa Heads!'
    ],
    countdown: [
      'Chagua Heads au Tails uone kama utapiga streak ya leo!',
      'Flip the coin and double your balance!'
    ],
  },

  // 6. HI-LO CARD DUEL
  hilo: {
    standalone: [
      'Ace imetokea nikaweka Lower, ikaja 3! Easy win! 🃏',
      'Card Duel imenilipa 6 streak ya cards! High-Lo ni akili tu.',
      'King ilipotokea nikajua ni lazima iwe Lower, payout pap!',
      'Same rank card multiplier ya 12.6x imepigwa hapa! Hongera sana! 🎯',
      'Kadi 2 zilibaki nikatumia skip button, hiyo option inasaidia sana.',
      '7 ndio card ngumu zaidi kuchagua, lakini Higher imekubali.',
      'Dealer cards hapa ziko random na provably fair SHA-256 kabisa.',
      'Nilitoka na 4.5x baada ya cards 4, cashout safi bila delay.',
      'Ushauri: Kadi ikiwa 2 weka Higher, ikiwa King weka Lower.'
    ],
    highMult: [
      'SAME CARD RANK MULTIPLIER 12.61x HIT! 🃏🔥',
      'Streak ya cards 7 bila kosa! Huyu jamaa ana akili ya hesabu!',
      'Big card duel payout imeingia kwa M-Pesa!'
    ],
    lowCrash: [
      'Kadi ya 7 ndio ilinichoma nikaweka Higher ikaja 4 😂',
      'Pole kwa aliyekosa kadi ya mwisho, next round tuko imara.',
      'Tumia skip button ukiona card ngumu kama 7 au 8.'
    ],
    countdown: [
      'Kadi ya kwanza imefunguka, je itakua Higher au Lower?',
      'Predict next card and climb the card streak ladder!'
    ],
  },

  // 7. TURBO MINI-ROULETTE
  roulette: {
    standalone: [
      'Red 7 imeland! Straight up bet yangu ya 36x imeingia wazee! 🎯',
      'Zero imegonga! Wote walioweka single green wamekula mzigo wa wiki.',
      'Mimi hucheza Red na Even, balance inakua steady sana bila spikes.',
      'Mini-Roulette wheel inazunguka speed sana, no unnecessary delay.',
      'Split bet ya 17 na 20 imelipa 18x payout! M-Pesa inasoma poa.',
      'European single zero rules ndio the best for player edge.',
      'Black 22 imenisalimisha jioni ya leo, shukrani JetPesa!',
      'Kuweka chips kwa Dozen ya kwanza inalipa 3x mara kwa mara.',
      'Wheel inazunguka bila lag yoyote, graphics ziko smooth sana.'
    ],
    highMult: [
      'STRAIGHT-UP #17 NUMBER HIT! 36.00x PAYOUT! 🎯💰',
      'GREEN ZERO #0 HIT! Nani alikua na chip kwa kijani?!',
      'Roulette jackpot ya leo imeingia wallet pap! Hongera sana!'
    ],
    lowCrash: [
      'Mpira imeruka kutoka red ikaanguka black nikiwa karibu 😂',
      'Wheel imeamua kutoa nambari ya jirani, next spin itatick.',
      'Panua coverage yako kwa outside bets upate buffer.'
    ],
    countdown: [
      'Weka chips zako kwenye nambari kabla wheel haijazunguka!',
      'Place your bets on European numbers 0 through 36!'
    ],
  },

  // 8. PENALTY SHOOTOUT
  penalty: {
    standalone: [
      'Goal ya 5 kwa streak! Multiplier ya 5.2x imenilipa safi sana! ⚽',
      'GK amedive right mimi nikapiga top left corner, goli safi!',
      'Nilikosa kwa shot ya 6 goalkeeper akaokoa! Lakini cashout ya 4 shots ilikua poa.',
      'Clean sweep ya 8 shots ndio lengo langu leo, 11x jackpot!',
      'Chagua kona moja uwe consistent, usibadilishe ovyo ovyo.',
      'Penalty shootout KES ndio the most exciting game hapa.',
      'Piga chini pembeni goalkeeper hawezi fikia mpira hiyo.',
      'Shot ya 3 cashout 2.1x imeingia kwa sekunde chache kwa wallet.',
      'Kipa wa leo ana mikono ya unga, magoli yanaingia tu!'
    ],
    highMult: [
      'CLEAN SWEEP 8/8 GOALS! 11.00x JACKPOT PAYOUT! ⚽🏆🔥',
      'Shot ya 7 goli safi! Payout ya 7.5x imeingia wallet direct!',
      'Goalkeeper hakushika hata mpira moja! Hat-trick ya mwaka!'
    ],
    lowCrash: [
      'Kipa amedive sawa sawa akaokoa shot ya pili 😂',
      'Pole mkuu, next shootout piga kona ya juu hawezi fika.',
      'Haikua goli lakini next penalti tunaweka nyavuni!'
    ],
    countdown: [
      'Chagua upande wa kupiga mpira uweke nyavuni!',
      'Step up to the penalty spot and score for big multipliers!'
    ],
  },
};

// -------------------------------------------------------------
// Pre-seeded initial chat histories for instant richness on switch
// -------------------------------------------------------------
export function getGameInitialChatHistory(gameId = 'aviator') {
  const pool = GAME_CHAT_POOLS[gameId] || GAME_CHAT_POOLS.aviator;
  const standalone = pool.standalone;
  const history = [];

  const now = Date.now();
  const count = Math.min(6, standalone.length);

  for (let i = 0; i < count; i++) {
    const persona = getRandomPlayerPersona();
    const minutesAgo = (count - i) * 2;
    const msgTime = new Date(now - minutesAgo * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    history.push({
      user: persona.username,
      seed: persona.seed,
      category: persona.category,
      color: persona.color,
      msg: standalone[i],
      time: msgTime,
    });
  }

  // Add 1 withdrawal praise
  const wdPersona = getRandomPlayerPersona();
  const wdMsg = UNIVERSAL_WITHDRAWALS[Math.floor(Math.random() * UNIVERSAL_WITHDRAWALS.length)];
  history.push({
    user: wdPersona.username,
    seed: wdPersona.seed,
    category: wdPersona.category,
    color: wdPersona.color,
    msg: wdMsg,
    time: new Date(now - 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  return history;
}

// -------------------------------------------------------------
// Dynamic Chat Message Synthesizer
// -------------------------------------------------------------
export function generateDynamicLobbyChat(context = {}) {
  const {
    gameId = 'aviator',
    currentMultiplier = 1.0,
    isBettingPhase = false,
    hasCrashed = false,
    crashPoint = 2.0,
  } = context;

  const pool = GAME_CHAT_POOLS[gameId] || GAME_CHAT_POOLS.aviator;
  let chosenMessage = '';
  let attempts = 0;

  while (attempts < 8) {
    attempts++;
    const randType = Math.random();

    // 1. Contextual triggers:
    if (isBettingPhase && pool.countdown && randType < 0.35) {
      chosenMessage = pool.countdown[Math.floor(Math.random() * pool.countdown.length)];
    } else if (hasCrashed && crashPoint < 1.40 && pool.lowCrash && randType < 0.40) {
      chosenMessage = pool.lowCrash[Math.floor(Math.random() * pool.lowCrash.length)];
    } else if (!hasCrashed && currentMultiplier >= 5.0 && pool.highMult && randType < 0.50) {
      chosenMessage = pool.highMult[Math.floor(Math.random() * pool.highMult.length)];
    } else if (randType < 0.15) {
      // Universal payment or withdrawal satisfaction
      chosenMessage = UNIVERSAL_WITHDRAWALS[Math.floor(Math.random() * UNIVERSAL_WITHDRAWALS.length)];
    } else if (pool.standalone && pool.standalone.length > 0) {
      // 2. Standalone authentic game-specific messages
      chosenMessage = pool.standalone[Math.floor(Math.random() * pool.standalone.length)];
    } else {
      const op = UNIVERSAL_OPENERS[Math.floor(Math.random() * UNIVERSAL_OPENERS.length)];
      chosenMessage = `${op}, round hii inalipa vizuri sana hapa JetPesa! 🔥`;
    }

    if (!hasBeenSaidRecently(chosenMessage)) {
      break;
    }
  }

  rememberMessage(chosenMessage);

  const persona = getRandomPlayerPersona();
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    user: persona.username,
    seed: persona.seed,
    category: persona.category,
    color: persona.color,
    msg: chosenMessage,
    time,
  };
}
