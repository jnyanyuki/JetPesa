/**
 * JetPesa Thematic Player Personas & Seeds
 * 12 diverse categories with unique naming seeds, signature colors, and SVG glyphs.
 */

export const PLAYER_CATEGORIES = {
  fauna: {
    id: 'fauna',
    label: 'Savannah Fauna',
    color: '#f59e0b', // Amber / Gold
    names: ['Lion', 'Cheetah', 'Leopard', 'Rhino', 'Buffalo', 'Elephant', 'Giraffe', 'Hyena', 'Zebra', 'Gazelle'],
    // Paw / Animal Claw Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
        <ellipse cx="12" cy="15" rx="5" ry="4" />
        <circle cx="6.5" cy="9.5" r="2.2" />
        <circle cx="10" cy="7" r="2.2" />
        <circle cx="14" cy="7" r="2.2" />
        <circle cx="17.5" cy="9.5" r="2.2" />
      </svg>
    ),
  },
  aviator: {
    id: 'aviator',
    label: 'Birds of Prey',
    color: '#06b6d4', // Cyan
    names: ['Falcon', 'Eagle', 'Hawk', 'Kestrel', 'Osprey', 'Condor', 'Harrier', 'Swift', 'Albatross', 'Vulture'],
    // Feather / Wing Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
        <line x1="16" y1="8" x2="2" y2="22" />
        <line x1="17.5" y1="15" x2="9" y2="15" />
      </svg>
    ),
  },
  marine: {
    id: 'marine',
    label: 'Marine Predators',
    color: '#3b82f6', // Ocean Blue
    names: ['Shark', 'Orca', 'Barracuda', 'Marlin', 'Dolphin', 'Manta', 'Kraken', 'Piranha', 'Stingray', 'Nautilus'],
    // Shark Fin / Wave Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c2.5-3 5-4.5 7.5-4.5S14.5 12 17 12s4.5-4.5 5-4.5" />
        <path d="M2 18c2.5-3 5-4.5 7.5-4.5S14.5 18 17 18s4.5-4.5 5-4.5" />
        <path d="M12 4l3 5h-6z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  reptile: {
    id: 'reptile',
    label: 'Reptiles & Serpents',
    color: '#10b981', // Emerald
    names: ['Mamba', 'Cobra', 'Viper', 'Python', 'Chameleon', 'Gecko', 'Crocodile', 'Monitor', 'Alligator', 'Anaconda'],
    // Serpent Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 6a3 3 0 0 1 6 0c0 3-6 5-6 8a3 3 0 0 0 6 0" />
        <circle cx="17.5" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  flight: {
    id: 'flight',
    label: 'Aviation & Jets',
    color: '#e11d48', // Jet Red
    names: ['Pilot', 'Captain', 'Aviator', 'Topgun', 'Stealth', 'Raptor', 'Supersonic', 'Mach', 'Turbofan', 'Jetliner'],
    // Jet Fighter Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 16.8 21 21l-4.2-3.2" />
        <path d="M2.5 13.5 21 3l-8.5 18-2.7-7.3-7.3-2.7Z" />
      </svg>
    ),
  },
  cosmic: {
    id: 'cosmic',
    label: 'Cosmic & Space',
    color: '#8b5cf6', // Violet
    names: ['Cosmo', 'Astro', 'Meteor', 'Nebula', 'Galaxy', 'Nova', 'Pulsar', 'Comet', 'Orion', 'Zenith'],
    // Rocket Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      </svg>
    ),
  },
  warrior: {
    id: 'warrior',
    label: 'Warriors & Legends',
    color: '#f97316', // Orange
    names: ['Warrior', 'Titan', 'Viking', 'Ninja', 'Samurai', 'Gladiator', 'Spartan', 'Knight', 'Phoenix', 'Centurion'],
    // Shield Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  county: {
    id: 'county',
    label: 'Kenyan Landmarks',
    color: '#14b8a6', // Teal
    names: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Naivasha', 'Malindi', 'Machakos', 'Kilifi'],
    // Map Pin Landmark Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  velocity: {
    id: 'velocity',
    label: 'Speed & Nitro',
    color: '#ec4899', // Pink
    names: ['Turbo', 'Nitro', 'Apex', 'Velocity', 'Shift', 'Boost', 'Drift', 'Throttle', 'Octane', 'Piston'],
    // Speedometer / Gauge Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4" />
        <path d="m4.93 4.93 2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M12 12l4-2" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  gemstone: {
    id: 'gemstone',
    label: 'Gems & Fortune',
    color: '#a855f7', // Purple
    names: ['Diamond', 'Ruby', 'Sapphire', 'Emerald', 'Amber', 'Topaz', 'Onyx', 'Crystal', 'Platinum', 'Gold'],
    // Diamond Gem Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12l4 7-10 11L2 10l4-7z" />
        <path d="M2 10h20" />
        <path d="m10 3 2 7-4 11" />
        <path d="m14 3-2 7 4 11" />
      </svg>
    ),
  },
  element: {
    id: 'element',
    label: 'Forces of Nature',
    color: '#eab308', // Yellow
    names: ['Thunder', 'Storm', 'Blaze', 'Frost', 'Typhoon', 'Cyclone', 'Inferno', 'Lightning', 'Vortex', 'Tempest'],
    // Lightning Bolt Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  shujaa: {
    id: 'shujaa',
    label: 'Kenyan Legends',
    color: '#22c55e', // Kenyan Green
    names: ['Shujaa', 'Mwamba', 'Bazu', 'Sonko', 'Mjanja', 'Hodari', 'Kingpin', 'Champ', 'Hero', 'Simba'],
    // Crown / Champion Glyph
    icon: (s = 14) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
      </svg>
    ),
  },
};

const CATEGORY_KEYS = Object.keys(PLAYER_CATEGORIES);
const PHONE_PREFIXES = ['070***', '071***', '072***', '079***', '011***', '074***', '075***', '076***', '078***'];

/**
 * Returns a randomized, fully wired player persona across the 12 diverse categories
 */
export function getRandomPlayerPersona() {
  const catKey = CATEGORY_KEYS[Math.floor(Math.random() * CATEGORY_KEYS.length)];
  const cat = PLAYER_CATEGORIES[catKey];
  const namePrefix = cat.names[Math.floor(Math.random() * cat.names.length)];
  const prefix = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)];
  const suffix = Math.floor(Math.random() * 90 + 10);
  const username = `${namePrefix}${prefix}${suffix}`;
  const seed = namePrefix.toLowerCase();

  return {
    category: cat.id,
    label: cat.label,
    color: cat.color,
    namePrefix,
    username,
    seed,
  };
}

/**
 * Resolves category info for any existing seed string
 */
export function getPersonaBySeed(seed = '') {
  const s = String(seed || '').toLowerCase();
  for (const catKey of CATEGORY_KEYS) {
    const cat = PLAYER_CATEGORIES[catKey];
    if (cat.id === s || cat.names.some((n) => n.toLowerCase() === s)) {
      return cat;
    }
  }
  // Fallback category derived by hash
  const charSum = s.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const catKey = CATEGORY_KEYS[charSum % CATEGORY_KEYS.length];
  return PLAYER_CATEGORIES[catKey];
}
