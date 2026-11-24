// Cosmetic catalogue: sleeves (card backs), playmats (table felt), impacts (card-play effects),
// charms (a trinket at your place), seats (your chair) and banners. All art is generated in code.

export type Category = 'sleeve' | 'playmat' | 'impact' | 'charm' | 'seat' | 'banner';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'contraband';
export type Mutation = 'basic' | 'gilded' | 'mosaic' | 'prismatic';

export interface Item {
  id: string;
  cat: Category;
  name: string;
  rarity: Rarity;
  /** Price in coins; rubies for ruby-only wares. */
  price: number;
  rubies?: number;
  blurb: string;
  /** Style parameters consumed by the art generators. */
  style: Record<string, string>;
  /** Not sold in the shop (default or reward only). */
  hidden?: boolean;
}

export const RARITY: Record<Rarity, { name: string; color: string; price: number }> = {
  common: { name: 'Common', color: '#9a9488', price: 600 },
  uncommon: { name: 'Uncommon', color: '#5aa04a', price: 1200 },
  rare: { name: 'Rare', color: '#3a8ae0', price: 2500 },
  epic: { name: 'Epic', color: '#a04ae0', price: 5000 },
  legendary: { name: 'Legendary', color: '#e0a830', price: 10000 },
  contraband: { name: 'Contraband', color: '#e03a3a', price: 20000 },
};

export const MUTATIONS: Record<Mutation, { name: string; odds: number; color: string }> = {
  basic: { name: 'Basic', odds: 0.65, color: '#b8a47c' },
  gilded: { name: 'Gilded', odds: 0.2, color: '#f0c860' },
  mosaic: { name: 'Mosaic', odds: 0.1, color: '#60b0e0' },
  prismatic: { name: 'Prismatic', odds: 0.05, color: '#ff7ae0' },
};

export const CATEGORY: Record<Category, { name: string; plural: string; where: string }> = {
  sleeve: { name: 'Sleeve', plural: 'Sleeves', where: 'The backs of every card in the deck.' },
  playmat: { name: 'Playmat', plural: 'Playmats', where: 'The felt of the card table.' },
  impact: { name: 'Impact', plural: 'Impacts', where: 'What bursts from the pile when you play a card.' },
  charm: { name: 'Charm', plural: 'Charms', where: 'A trinket that sits at your place at the table.' },
  seat: { name: 'Seat', plural: 'Seats', where: 'The chair you sit in. Rivals will notice.' },
  banner: { name: 'Banner', plural: 'Banners', where: 'Your colours, hung over your place at the table.' },
};

const it = (id: string, cat: Category, name: string, rarity: Rarity, blurb: string, style: Record<string, string>, extra: Partial<Item> = {}): Item => ({
  id,
  cat,
  name,
  rarity,
  price: RARITY[rarity].price,
  blurb,
  style,
  ...extra,
});

export const ITEMS: Item[] = [
  // ---- sleeves
  it('sleeve_oxblood', 'sleeve', 'House Oxblood', 'common', 'The tavern\'s own deck. Worn soft by a thousand nervous thumbs.', { field: '#5a1016', shade: '#16040a', accent: '#e6c56a', pattern: 'lattice', crest: 'hooded' }, { hidden: true, price: 0 }),
  it('sleeve_midnight', 'sleeve', 'Midnight Vigil', 'uncommon', 'Silver moons on a field of deep night.', { field: '#18284a', shade: '#060a16', accent: '#c8d4e8', pattern: 'stars', crest: 'moon' }),
  it('sleeve_verdant', 'sleeve', 'Greenwood', 'uncommon', 'For those who prefer the forest to the town.', { field: '#1f4a24', shade: '#071808', accent: '#d8c070', pattern: 'vines', crest: 'stag' }),
  it('sleeve_raven', 'sleeve', 'Ravenmark', 'rare', 'Bone-white, with the bird that always arrives first.', { field: '#d8ccb0', shade: '#8a7a5a', accent: '#1b110b', pattern: 'lattice', crest: 'raven' }),
  it('sleeve_royal', 'sleeve', 'Royal Decree', 'rare', 'Purple and gold. Officially frowned upon.', { field: '#4a1a5a', shade: '#160620', accent: '#f0c860', pattern: 'fleur', crest: 'crown' }),
  it('sleeve_ember', 'sleeve', 'Dragonfire', 'epic', 'Black lacquer licked by painted flame.', { field: '#1a0a06', shade: '#000000', accent: '#ff7a2a', pattern: 'flames', crest: 'dragon' }),
  it('sleeve_frost', 'sleeve', 'Frostbound', 'epic', 'Cold to the touch, somehow.', { field: '#9ac0d8', shade: '#2a4a6a', accent: '#ffffff', pattern: 'snow', crest: 'snowflake' }),
  it('sleeve_sun', 'sleeve', 'Gilded Dawn', 'legendary', 'Hammered gold over black enamel.', { field: '#1a1206', shade: '#000000', accent: '#f6d270', pattern: 'sunburst', crest: 'sun' }, { rubies: 30 }),
  it('sleeve_eye', 'sleeve', 'The Watching Hand', 'contraband', 'Banned in three kingdoms. The eyes follow you.', { field: '#0a0204', shade: '#000000', accent: '#ff3a1a', pattern: 'eyes', crest: 'eye' }, { rubies: 60 }),
  // ---- playmats
  it('mat_baize', 'playmat', 'Tavern Baize', 'common', 'Green, worn and honest.', { base: '#1a4a2e', ring: '#d6aa50', print: 'arcs' }, { hidden: true, price: 0 }),
  it('mat_crimson', 'playmat', 'Crimson Velvet', 'uncommon', 'Deep red, like everything else here.', { base: '#5a1418', ring: '#e6c56a', print: 'arcs' }),
  it('mat_midnight', 'playmat', 'Night Sky', 'rare', 'Play beneath painted constellations.', { base: '#101c3a', ring: '#c8d4e8', print: 'stars' }),
  it('mat_leather', 'playmat', 'Tooled Leather', 'rare', 'Saddle leather, stamped with knotwork.', { base: '#5a3a20', ring: '#e0b060', print: 'knots' }),
  it('mat_royal', 'playmat', 'Royal Purple', 'epic', 'Fit for a duke who cheats.', { base: '#3a1450', ring: '#f0c860', print: 'fleur' }),
  it('mat_map', 'playmat', 'Cartographer\'s Map', 'epic', 'An old map of somewhere that may not exist.', { base: '#c8b088', ring: '#6a3a14', print: 'map' }),
  it('mat_runes', 'playmat', 'Obsidian Runes', 'legendary', 'Black stone felt and runes that glow faintly.', { base: '#0c0a0c', ring: '#ff4a2a', print: 'runes' }, { rubies: 25 }),
  it('mat_frost', 'playmat', 'Hoarfrost', 'epic', 'Pale ice-blue with a rime of silver.', { base: '#6a90a8', ring: '#ffffff', print: 'snow' }),
  // ---- impacts
  it('impact_dust', 'impact', 'Tavern Dust', 'common', 'A puff of dust and old crumbs.', { fx: 'dust', color: '#ffd9a0' }, { hidden: true, price: 0 }),
  it('impact_embers', 'impact', 'Embers', 'uncommon', 'Sparks leap from the pile.', { fx: 'embers', color: '#ff8a3a' }),
  it('impact_smoke', 'impact', 'Pipe Smoke', 'uncommon', 'A lazy curl of grey smoke.', { fx: 'smoke', color: '#8a7a6a' }),
  it('impact_frost', 'impact', 'Frost', 'rare', 'A breath of winter on every card.', { fx: 'frost', color: '#bfe6ff' }),
  it('impact_gold', 'impact', 'Crown Coins', 'epic', 'Coins spill from your cards.', { fx: 'gold', color: '#ffd76a' }),
  it('impact_ravens', 'impact', 'Raven Feathers', 'epic', 'Black feathers, from somewhere above.', { fx: 'ravens', color: '#202020' }),
  it('impact_holy', 'impact', 'Holy Light', 'legendary', 'Every card you play is blessed. Probably.', { fx: 'holy', color: '#fff2c0' }, { rubies: 25 }),
  // ---- charms
  it('charm_none', 'charm', 'Bare Table', 'common', 'Nothing but your elbows.', { model: 'none' }, { hidden: true, price: 0 }),
  it('charm_die', 'charm', 'Lucky Die', 'common', 'It always rolls a six. Allegedly.', { model: 'die' }),
  it('charm_horseshoe', 'charm', 'Horseshoe', 'uncommon', 'Nailed upright, so the luck stays in.', { model: 'horseshoe' }),
  it('charm_goblet', 'charm', 'Golden Goblet', 'rare', 'Empty. That is the problem.', { model: 'goblet' }),
  it('charm_skull', 'charm', 'Skull Candle', 'rare', 'A former player, still lighting the way.', { model: 'skull' }),
  it('charm_crystal', 'charm', 'Seer\'s Crystal', 'epic', 'It hums when the Hand is near.', { model: 'crystal' }),
  it('charm_raven', 'charm', 'Raven Statue', 'epic', 'Carved from blackwood. Watches the deck.', { model: 'raven' }),
  it('charm_dragon', 'charm', 'Little Wyrm', 'legendary', 'A brass dragon that breathes real smoke.', { model: 'dragon' }, { rubies: 25 }),
  // ---- seats
  it('seat_oak', 'seat', 'Oak Chair', 'common', 'Four legs, mostly level.', { model: 'oak' }, { hidden: true, price: 0 }),
  it('seat_stool', 'seat', 'Three-legged Stool', 'common', 'Keeps you alert.', { model: 'stool' }),
  it('seat_velvet', 'seat', 'Velvet Armchair', 'rare', 'Deep purple cushions. Hard to stand up from.', { model: 'velvet' }),
  it('seat_iron', 'seat', 'Iron Seat', 'rare', 'Cold, hard, and very difficult to steal.', { model: 'iron' }),
  it('seat_bone', 'seat', 'Bone Chair', 'epic', 'Assembled from previous losers.', { model: 'bone' }),
  it('seat_throne', 'seat', 'Gilded Throne', 'legendary', 'For the patron who has outlived everyone.', { model: 'throne' }, { rubies: 40 }),
  // ---- banners
  it('banner_plain', 'banner', 'Plain Linen', 'common', 'Unmarked. Mysterious, or just poor.', { field: '#d8c8a0', charge: 'none', accent: '#6a4a2a' }, { hidden: true, price: 0 }),
  it('banner_wolf', 'banner', 'Grey Wolf', 'uncommon', 'Stay with the pack.', { field: '#5a6a7a', charge: 'moon', accent: '#e8e8f0' }),
  it('banner_stag', 'banner', 'Greenwood Stag', 'uncommon', 'Proud antlers on forest green.', { field: '#1f4a24', charge: 'stag', accent: '#e0c870' }),
  it('banner_raven', 'banner', 'Raven Black', 'rare', 'A black bird on bone white.', { field: '#e0d6c0', charge: 'raven', accent: '#1b110b' }),
  it('banner_crown', 'banner', 'Usurper\'s Crown', 'epic', 'Gold crown on royal purple.', { field: '#4a1a5a', charge: 'crown', accent: '#f0c860' }),
  it('banner_dragon', 'banner', 'Dragon Rampant', 'epic', 'Fire on black.', { field: '#140806', charge: 'dragon', accent: '#ff7a2a' }),
  it('banner_hand', 'banner', 'The Hooded Hand', 'contraband', 'Only the house is supposed to fly this.', { field: '#5a1016', charge: 'hooded', accent: '#e6c56a' }, { rubies: 50 }),
];

export function item(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function rollMutation(r = Math.random()): Mutation {
  let acc = 0;
  for (const [m, d] of Object.entries(MUTATIONS) as Array<[Mutation, { odds: number }]>) {
    acc += d.odds;
    if (r < acc) return m;
  }
  return 'basic';
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's wares: deterministic by date. */
export function dailyWares(key: string): Item[] {
  const pool = ITEMS.filter((i) => !i.hidden && !i.rubies);
  let s = hash(key);
  const out: Item[] = [];
  const cats: Category[] = ['sleeve', 'impact', 'charm', 'playmat', 'banner', 'seat'];
  for (const c of cats) {
    const of = pool.filter((i) => i.cat === c && !out.includes(i));
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (of.length) out.push(of[s % of.length]);
  }
  // Two extra random wares.
  for (let k = 0; k < 2; k++) {
    const rest = pool.filter((i) => !out.includes(i));
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (rest.length) out.push(rest[s % rest.length]);
  }
  return out;
}

/** The weekly featured bundle: one sleeve, playmat and impact that share a theme, at a discount. */
export const BUNDLES = [
  { id: 'bundle_frost', name: 'The Frostbound Collection', items: ['sleeve_frost', 'mat_frost', 'impact_frost'], price: 9000 },
  { id: 'bundle_dragon', name: 'Wyrm\'s Hoard', items: ['sleeve_ember', 'banner_dragon', 'impact_embers'], price: 8000 },
  { id: 'bundle_royal', name: 'The Usurper\'s Set', items: ['sleeve_royal', 'mat_royal', 'banner_crown'], price: 9500 },
  { id: 'bundle_raven', name: 'Murder of Crows', items: ['sleeve_raven', 'impact_ravens', 'charm_raven', 'banner_raven'], price: 11000 },
];

export function featured(weekKey: string) {
  return BUNDLES[hash(weekKey) % BUNDLES.length];
}

/** Ruby wares: legendary and contraband items always on offer. */
export function rubyWares(): Item[] {
  return ITEMS.filter((i) => i.rubies);
}
