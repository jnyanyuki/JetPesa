/**
 * JetPesa Natural Language Chat Synthesis Engine
 * Generates continuous, hyper-realistic, non-repeating community chat messages
 * with live game-state awareness (countdown, climbing flight, post-crash, high multipliers).
 */

const ANIMAL_SEEDS = [
  'shark', 'lion', 'falcon', 'cheetah', 'rhino', 'eagle', 'mamba', 'hawk',
  'panther', 'fox', 'cobra', 'viper', 'lynx', 'buffalo', 'jaguar', 'leopard',
  'tiger', 'gazelle', 'wolf', 'badger', 'orca', 'kestrel', 'condor'
];

const PHONE_PREFIXES = ['070***', '071***', '072***', '079***', '011***', '074***', '075***', '076***', '078***'];

// LRU memory buffer to prevent redundant repetition (keeps last 75 messages)
const recentMessagesMemory = [];
const MAX_MEMORY = 75;

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
// Combinatorial Components for Natural Sheng / Swahili / English
// -------------------------------------------------------------
const OPENERS = [
  'Wazee', 'Wakuu', 'Manze', 'Bana', 'Aiseee', 'Kusema ukweli', 'Wueh', 'Yooh',
  'Honestly', 'Wah', 'Enyewe', 'Round hii', 'Hii game', 'Today', 'Hapa JetPesa',
  'Guys', 'Kaka', 'Mimi leo', 'Pilot wetu', 'Bro', 'Acha nikuambie', 'Watu wangu',
  'Mazee', 'Basi sasa', 'Kweli kabisa', 'Sikilizeni wakuu'
];

const GENERAL_THOUGHTS = [
  'nimepiga cashout safi sana',
  'Deck A imenilipa vizuri leo jioni',
  'nilicash out 2.4x safi nikapata float',
  'cashout yangu imeingia M-Pesa pap bila delay',
  'niliweka stake ya 100 bob nikatoka 3.5x',
  'hii ndege leo inaruka na nguvu sana',
  'nilicash out haraka kabla haijatua',
  'nimeweka auto cashout ya 2x na inalipa bila stress',
  'hapa ni kufuata discipline tu bila tamaa',
  'round iliyopita nimekula faida poa sana',
  'Deck B ndio inatokea na ushindi mkubwa',
  'pilot anapaa kama amekunywa supersonic fuel',
  'nimecheza 50 bob nikachukua faida mzuri',
  'pesa imeingia kwa wallet haraka sana',
  'nimeshika payout yangu vizuri sana leo',
  'acha nichukue hii ndogo kwanza ningoje kubwa',
  'rain drop imenisaidia kuongeza salio kwa wallet',
  'leo market iko na form ya kipekee',
  'strategy ya auto cashout ndio working formula',
  'nimejaribu Deck zote mbili na zote zimetick',
  'withdrawals za JetPesa ndio fastest kwa game zote',
  'niliweka target ya 1.8x na imelipa safi',
  'kila mtu ajiwekee stop loss na cashout mapema',
  'hapa nina furaha na profit nimepata leo'
];

const TAIL_REACTIONS = [
  'tuko locked in! 🔥',
  'let\'s gooo 🚀🚀',
  'pesa ya unga imepatikana leo.',
  'polepole ndio mwendo hapa.',
  'acha nijaribu tena round ijayo.',
  'kazi safi sana!',
  'bado tuko ngangari 💪',
  'hapo sawa kabisa.',
  'hakuna kulala leo usiku!',
  'hawa pilots wana roho safi 😂',
  'shukran sana JetPesa 🙏',
  'mambo ni moto hapa!',
  'alhamdullilah kwa hii win.',
  'tutarudi round inayofuata na stake poa.',
  'mungu mbele kila wakati.',
  'cheza kwa akili si kwa tamaa.',
  'pesa iko hapa maze.',
  'tuko site hadi asubuhi!'
];

// Standalone real-player observations
const STANDALONE_POOL = [
  'Admin, lini mnaweka rain ingine ya free bets? Tunangoja hapa! 🙏',
  'Hii JetPesa ndio the real deal Kenya mzima, withdrawals instant kabisa.',
  'Ushauri wangu kwa wote: usikae sana kwa ndege, toka mapema 1.5x au 2x.',
  'Leo niko na luck poa sana, wacha niongeze stake kwa Deck B.',
  'Kwani huyu pilot leo anaenda moja kwa moja angani bila brake? 🚀😂',
  'M-Pesa balance inasoma vizuri jioni ya leo shukrani kwa JetPesa!',
  'Niliweka auto-cashout 1.60x, kila round napata profit bila kuhema.',
  'Kila mtu aweke target yake bila greed, hapo ndipo siri ya ushindi iko.',
  'Pongezi kwa waliohold hadi round ilipofika mbali! Big win! 🙌',
  'Withdrawal yangu imeingia kwa sekunde chache tu, big up JetPesa team!',
  'Wale wa 10 bob na 20 bob tupo pamoja, kidogo kidogo ndio inajaza kibaba!',
  'Round hii naona ikipanda vizuri sana, nani ako ndani?',
  'Nashukuru sana nilicash out kwa wakati kabla haijafly away!',
  'JetPesa inapeana odds poa sana kulingana na platforms zingine.',
  'Tumeanza flight nyingine, kila mtu aweke seatbelt tayari kwa kuruka!',
  'Multiplier ya leo inanikumbusha siku nilipiga 45k hapa JetPesa.',
  'Nani mwingine anatumia strategy ya Deck A safe na Deck B high target?',
  'Mchezo uko clean sana, hakuna lag, graphics ziko smooth sana.',
  'Acha nitulie kidogo ningoje high multiplier iingie vizuri.',
  'Mimi hutoa 1.7x mara nne mfululizo kisha nachukua mapumziko.',
  'Leo lazima tuoe rent na faida ya hapa. Let\'s make money wazee!',
  'Rain drop ilinisaidia kuingia kwa round hii bila kutumia yangu.',
  'Kaka zangu kuweni na discipline, profit ndogo mara kumi ni pesa mob.',
  'Hii UI ya JetPesa ni clean sana, radar inaonekana crystal clear.',
  'Nimeona jamaa amecash out 15,000 bob hapo juu! Hongera bro!',
  'Platform iko on point, no hidden charges kwa payouts zetu.',
  'M-Pesa pay-in ilikua smooth, chini ya sekunde tatu balance ikasoma.'
];

// High multiplier live reactions (> 5.0x, > 10.0x, > 50.0x)
const HIGH_MULT_REACTIONS = [
  'WHAAAAT?! Hii ndege haitaki kutua leo! 🚀🚀',
  'Yooh multiplier inapanda kama moshi! Nani bado ako ndani?!',
  'Mungu wangu nilitoka 2.5x ningebaki ningekua tajiri leo 😭😭',
  'Hii ni safari ya mbinguni direct! Hongera waliohold!',
  'Eeeish! Hii ndio payout ya mwaka! 💰💰',
  'Aiseee pilot hana breki leo! Multiplier ya ajabu kabisa!',
  'Wale wameshikilia hadi hapa leo mtakunywa soda kwa bill yangu! 😂',
  'Incredible flight! Multiplier ya nguvu sana hapa JetPesa!',
  'Huyu pilot anastahili promotion, amenilipa rent ya miezi miwili!',
  'Wah ningejua ningeweka 500 stake ningoje hii rocket! Congrats wote!',
  'Sky is not the limit leo! To the moon and beyond! 🚀✨',
  'Kama ulikua ndani ya hii flight hebu weka emoji ya moto kwa chat! 🔥'
];

// Post-crash comments when crashed early / low (< 1.40x)
const LOW_CRASH_COMMENTS = [
  'Aii kwani pilot amesahau kuweka mafuta? 😂',
  'Imekata mapema sana! Pole kwa waliochoma stake.',
  'Haikufika mbali lakini next round itafunguka vizuri sana.',
  'Acha ningoje round inayofuata, hii ilikua ya kufagia uwanja.',
  'Bahati mbaya haikufika 1.5x, lakini bado tuko ngangari!',
  'Hapo ndipo umuhimu wa auto cashout 1.1x unapoonekana wazee.',
  'Polepole wakuu, crash game inataka moyo wa chuma na uvumilivu.',
  'Next round tutabeba mara mbili yake, stay focused!'
];

// Countdown / pre-flight comments
const COUNTDOWN_COMMENTS = [
  'Weka stake haraka countdown inaisha wazee!',
  'Deck A 100 KES, Deck B 50 KES, ready for takeoff! 🛫',
  'Seatbelts on! Hii round naona ikitufikisha 3x kwa urahisi.',
  'Leo niko na feeling poa na round hii. Let\'s fly!',
  'All pilots on board, radar is clear, let\'s go for the gold!',
  'Lock in your bets early kabla mlango haujafungwa.',
  'Nani ako tayari kuruka na sisi round hii?'
];

export function generateDynamicLobbyChat(context = {}) {
  const { currentMultiplier = 1.0, isBettingPhase = false, hasCrashed = false, crashPoint = 2.0 } = context;

  let chosenMessage = '';
  let attempts = 0;

  while (attempts < 8) {
    attempts++;
    const randType = Math.random();

    // 1. Contextual triggers:
    if (isBettingPhase && randType < 0.45) {
      chosenMessage = COUNTDOWN_COMMENTS[Math.floor(Math.random() * COUNTDOWN_COMMENTS.length)];
    } else if (hasCrashed && crashPoint < 1.40 && randType < 0.50) {
      chosenMessage = LOW_CRASH_COMMENTS[Math.floor(Math.random() * LOW_CRASH_COMMENTS.length)];
    } else if (!hasCrashed && currentMultiplier >= 5.0 && randType < 0.65) {
      chosenMessage = HIGH_MULT_REACTIONS[Math.floor(Math.random() * HIGH_MULT_REACTIONS.length)];
    } else if (randType < 0.40) {
      // 2. Standalone authentic messages
      chosenMessage = STANDALONE_POOL[Math.floor(Math.random() * STANDALONE_POOL.length)];
    } else {
      // 3. Combinatorial generation: Opener + Observation + Reaction
      const op = OPENERS[Math.floor(Math.random() * OPENERS.length)];
      const ob = GENERAL_THOUGHTS[Math.floor(Math.random() * GENERAL_THOUGHTS.length)];
      const re = TAIL_REACTIONS[Math.floor(Math.random() * TAIL_REACTIONS.length)];
      chosenMessage = `${op}, ${ob}, ${re}`;
    }

    // Dynamic token replacement for realism:
    if (chosenMessage.includes('{mult}')) {
      const randomMult = (1.5 + Math.random() * 4.5).toFixed(2);
      chosenMessage = chosenMessage.replace('{mult}', randomMult);
    }

    if (!hasBeenSaidRecently(chosenMessage)) {
      break;
    }
  }

  rememberMessage(chosenMessage);

  // Generate believable user identity
  const seed = ANIMAL_SEEDS[Math.floor(Math.random() * ANIMAL_SEEDS.length)];
  const prefix = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)];
  const suffix = Math.floor(Math.random() * 90 + 10);
  const capitalizedSeed = seed.charAt(0).toUpperCase() + seed.slice(1);
  const user = `${capitalizedSeed}${prefix}${suffix}`;

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    user,
    seed,
    msg: chosenMessage,
    time,
  };
}
