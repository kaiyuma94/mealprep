import type { StoreId, SupermarketSection } from '../types';

export const STORES: { id: StoreId; name: string; short: string }[] = [
  { id: 'lidl', name: 'Lidl', short: 'Lidl' },
  { id: 'ah', name: 'Albert Heijn', short: 'AH' },
  { id: 'jumbo', name: 'Jumbo', short: 'Jumbo' },
];

export const storeName = (id: StoreId) => STORES.find((s) => s.id === id)?.name ?? id;
export const storeShort = (id: StoreId) => STORES.find((s) => s.id === id)?.short ?? id;

/**
 * Typical walking route per supermarket. These are editorial approximations of
 * common Dutch store layouts — individual stores differ.
 */
export const STORE_SECTION_ORDER: Record<StoreId, SupermarketSection[]> = {
  // Lidl: groente & fruit bij de ingang, dan brood, koeling, houdbaar, diepvries achterin.
  lidl: ['produce', 'herbs', 'bakery', 'chilled', 'fish', 'dairy-eggs', 'pasta-rice-grains', 'canned-jarred', 'world-foods', 'oils-sauces', 'spices', 'baking', 'nuts-dried', 'frozen', 'other'],
  // AH: AGF, dan vega/koeling en zuivel langs de wand, brood, daarna de houdbare gangpaden.
  ah: ['produce', 'herbs', 'chilled', 'fish', 'dairy-eggs', 'bakery', 'pasta-rice-grains', 'world-foods', 'canned-jarred', 'oils-sauces', 'spices', 'baking', 'nuts-dried', 'frozen', 'other'],
  // Jumbo: AGF, brood, koeling en zuivel, diepvries vaak halverwege, dan houdbaar.
  jumbo: ['produce', 'herbs', 'bakery', 'chilled', 'fish', 'dairy-eggs', 'frozen', 'pasta-rice-grains', 'world-foods', 'canned-jarred', 'oils-sauces', 'spices', 'baking', 'nuts-dried', 'other'],
};

/** Default order (Lidl). */
export const SECTION_ORDER = STORE_SECTION_ORDER.lidl;

export const SECTION_LABELS: Record<SupermarketSection, { label: string; icon: string }> = {
  produce: { label: 'Groente & fruit', icon: '🥕' },
  herbs: { label: 'Verse kruiden', icon: '🌿' },
  bakery: { label: 'Brood', icon: '🥖' },
  chilled: { label: 'Koeling & vega', icon: '🧊' },
  'dairy-eggs': { label: 'Zuivel, kaas & eieren', icon: '🧀' },
  'pasta-rice-grains': { label: 'Pasta, rijst & granen', icon: '🍝' },
  'canned-jarred': { label: 'Conserven & potten', icon: '🥫' },
  'world-foods': { label: 'Wereldkeuken', icon: '🥢' },
  'oils-sauces': { label: 'Olie, sauzen & bouillon', icon: '🫒' },
  spices: { label: 'Kruiden & specerijen', icon: '🧂' },
  baking: { label: 'Bakken & suiker', icon: '🍯' },
  'nuts-dried': { label: 'Noten & gedroogd fruit', icon: '🥜' },
  frozen: { label: 'Diepvries', icon: '❄️' },
  fish: { label: 'Vis & garnalen', icon: '🐟' },
  other: { label: 'Overig', icon: '🛒' },
};
