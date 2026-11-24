# The Hooded Hand — handoff notes

Read this first if you are a new Claude session (or a new developer) picking up the project.

## What this is

A browser 3D card game in the "don't draw the bomb" genre, built for the owner's Chromebook and designed to become
multiplayer on Render. It is **inspired by** a Roblox game the owner showed in a reference video (see
`docs/REFERENCE_ANALYSIS.md`), but it is an **original** game: original name, setting (medieval tavern), card names,
card art, characters and look. Do not copy the reference game's name, art, characters or UI look. Matching its
*mechanics, pacing, camera language, feature set and quality bar* is the goal.

Decisions the owner made:

- Setting: **medieval tavern**. Name: **The Hooded Hand**.
- Every card and mode of the reference game has an original equivalent (table below), plus Shop, Inventory,
  Challenges, levels and ranked.
- Online play: wired in code (server + `WsTransport`) but **not exposed in the UI yet**. The owner will set up Render
  later; until then all tables are vs bots ("support for multiplayer, but bot tables to test").
- Must run well on a **Chromebook** (adaptive resolution and quality tiers are built in).
- Push everything to `PolynomialI/hitmen` on `main`. The owner may halt work at any moment, so commit and push often.

## Run it

```bash
npm install
npm run dev            # client only (bot games), http://localhost:5173
npm test               # rules simulation: ~560 bot games over every mode/size + scripted tutorial
npm run typecheck
npm run build          # client -> dist/, server -> dist-server/
npm start              # serves dist/ and the WebSocket game server on :8787 (Render runs this)
npx tsx scripts/serverSmoke.ts   # with the server running: two WS players play a full online game
```

Browser end-to-end tests (Playwright + Chromium; with `npm run dev` running in another terminal). They print page
errors, save screenshots to `e2e-shots/` (gitignored) and exit non-zero on any page error:

```bash
node scripts/e2e/tutorial.cjs                 # plays the whole tutorial by clicking cards in the 3D scene
node scripts/e2e/match.cjs original 3 orig    # auto-plays a 4-player table: <mode> <rivals> <shot prefix>
node scripts/e2e/match.cjs teams 3 teams
node scripts/e2e/match.cjs winter 3 winter
node scripts/e2e/shop.cjs                     # buys + equips a daily ware, spins Fate's Wheel, checks it in a match
```

On a fresh machine run `npx playwright install chromium` once. Headless runs use SwiftShader, which is slow; the
scripts pass `?q=low&dtcap=0.4` so animations still complete.

Useful URL parameters (client):

| Param | Effect |
|---|---|
| `?start=<mode>` | Skip menus, jump straight into a match. Modes: `original`, `tutorial`, `teams`, `winter`, `ranked`, `scrimmage` |
| `&rivals=N` | With `start`: number of bot rivals (1–5; teams needs 3 or 5) |
| `?station=play\|shop\|inventory` | Dev: open straight at that station (after the title card) |
| `?q=low\|medium\|high` | Force a quality tier (otherwise auto-detected and adapted at runtime) |
| `?dtcap=0.4` | Test only: allow big frame steps so slow headless renderers finish animations |

To reset a local profile: devtools → Application → Local Storage → delete `hooded-hand-profile-v2`.

## Deploy

- **GitHub Pages (bot games only):** `.github/workflows/pages.yml` builds, runs the sims, and publishes `dist/` on
  every push to `main`. **One-time, owner only:** repo Settings → Pages → Source: **GitHub Actions** (until then the
  deploy step fails while build and tests pass). URL: `https://polynomiali.github.io/hitmen/`.
- **Render (online-ready):** `render.yaml` is a Blueprint for one Node web service (`npm ci && npm run build`, then
  `npm start`, health check `/healthz`). Free plan sleeps when idle (first visit waits ~1 min).

## Cards

All card art is procedural SVG (`src/client/art/emblems.ts`, `emblems2.ts`, `cardArt.ts`) — no image files.
Catalogue: `src/shared/cards.ts` (`CARD_DEFS`, deck mixes in `DECKS`, pool size ≈ 10 + 8 × players).

| Card | id | Set | When | Effect |
|---|---|---|---|---|
| The Hooded Hand | hand | core | never | Draw it and you are slain unless a Guardian Angel saves you |
| Guardian Angel | angel | core | never | Saves you from the Hand; then you hide the Hand back in the deck |
| Parry | parry | core | reaction | Cancel the card just played (parries chain) |
| Dragon's Breath | breath | core | reaction | Burn the card just played: cancelled and shuffled back into the deck |
| Misdirection | misdirect | core | reaction | Pick a new mark for a card that marks a player |
| Scrying Orb | scry | core | turn | Secretly view the top 3 cards |
| Bounty | bounty | core | turn | End turn without drawing; the mark takes 2 turns (stacks) |
| Slip Away | slip | core | turn | End turn without drawing |
| Turnabout | turnabout | core | turn | End turn without drawing and reverse order of play |
| Back Door | backdoor | core | turn | End turn by drawing from the bottom |
| Pickpocket | pickpocket | core | turn | The mark hands you a card of *their* choosing (random on timeout) |
| Tavern Brawl | brawl | core | quick | Shuffle the deck, any time, even on others' turns |
| Looking Glass | glass | core | turn | Copy the last played card; if that was an Angel it can save you |
| Shackles | shackles | core | turn | Chain the top discard's card type: nobody may play it for 3 turns |
| Aegis | aegis | teams | turn | Ward a player; the next card that marks them fizzles |
| Warband | warband | teams | turn | End turn without drawing; the rival you mark takes 3 turns |
| Privateer | privateer | ranked | reaction | Take a copy of a card someone plays; if it is cancelled they take your Privateer |
| Sands of Time | sands | ranked | turn | Take the top discard back into your hand |
| Mistletoe | mistletoe | winter | turn | Swap your whole hand with the mark |
| Yule Log | yule | winter | quick | Shuffle, then everyone sees the new top card |

Rules: each player starts with 1 Angel + action cards; the deck holds the rest of the pool, (players − 1) Hands and a
spare Angel. Play any number of cards, then draw to end your turn. After every played card there is a 2.4 s reaction
window (any player may react; "hold" extends it once per player). Death's odds = Hands in deck / cards in deck.

## Modes (Play menu at the notice board)

| Ticket | Mode | Seats | Notes |
|---|---|---|---|
| Original | `original` | 4 (table-size picker: 2–6) | Core deck |
| Duel | `original`, 1 rival | 2 | |
| Teams | `teams` | 2v2 (or 3v3) | Teammates' hands face you, team colours, Aegis/Warband, shared win |
| Winter Feast | `winter` | 4 | Festive tavern decorations (garlands, wreath, snow), Mistletoe/Yule Log |
| Ranked | `ranked` | 1v1 | Elo "renown" vs named rivals, rank medals, ladder; Privateer/Sands |
| Tutorial | `tutorial` | 1v1 | Stacked deck, scripted rival (Brother Aldric), hint captions |
| Watch a Table | spectate | 4 bots | Bottom bar; camera over the table, no hand |
| (Create Table) | any + `scrimmage` | 2–6 | Scrimmage = half rewards |

Bots: `src/shared/bot.ts` play every card with human-like delays; they only see what a player would see.

## Progression, Shop and Inventory

- Profile (`src/client/ui/profile.ts`, localStorage `hooded-hand-profile-v2`, migrates v1): coins (start 2500),
  rubies, XP/level (each level: +400 coins, +1 ruby; every 5 levels a Reforge token), stats, ranked rating,
  owned cosmetics with **mutations** (basic / gilded / mosaic / prismatic), equipped loadout.
- Results ledger (`src/client/match/results.ts`): coins per line item, XP bar with level-ups, ranked renown delta,
  daily/weekly challenges (`src/client/ui/progression.ts`) with claim buttons (also on the main menu board).
- **Shop** — the Peddler's Cart (`src/client/screens/shop.ts`, camera station `shop`): weekly featured bundle, daily
  wares with a refresh countdown, ruby wares, Fate's Wheel (token spin with reel animation and mutation roll), item
  detail modal with buy / equip.
- **Inventory** — corkboard chest (station `inventory`): category tabs, owned items with mutation frames, hover for a
  live preview on the 3D display table (felt, card back, charm, chair, banner), reforge a mutation with a token.
- Cosmetics (`src/client/cosmetics/`): `catalog.ts` (~45 items, 6 rarities from common to contraband),
  `art.ts` (procedural sleeves, playmats, banners, impact/charm/seat icons, 3D charms and chairs),
  `apply.ts` (applies the loadout to card backs, table felt, banners; `lookFromProfile()` is sent with the player's
  seat so other clients/bots can render it). Categories: card sleeve, playmat, death impact (dust, embers, gold,
  frost, ravens, holy, smoke), table charm, chair, banner. Bots wear random looks.

## Architecture

```
src/shared/        Pure TypeScript, runs in browser AND on the server
  cards.ts         Card catalogue, deck mixes, pool sizes
  engine.ts        Authoritative rules engine: phases (turn, reaction, give, scry, rescue, hide, over), direction,
                   locks, wards, teams, timers, events with per-player secrets (teammates share secrets)
  host.ts          Runs a match: engine + bots + filtered event delivery to listeners
  bot.ts           Bot AI
  tutorial.ts      Stacked deck + scripted rival for the tutorial
  match.ts         createLocalMatch() for every mode, named RIVALS, random bot looks
  timing.ts        Presentation durations (DUR) the host reserves per event so clients can animate
  types.ts         GameMode, SeatInfo (with team, look), Action, GameEvent, PlayerView
src/client/
  main.ts          Boot, loading screen, navigation (title → menu → play/shop/inventory → match)
  app.ts           Render loop, screen management
  core/            gfx.ts (renderer + post: bloom, ACES, grade/danger/holy/grain, vignette, adaptive res),
                   cameraRig.ts (stations, look-around, glides, shake), tween.ts, picker.ts (3D hover/click)
  gfx/             noise, procedural textures (wood, stone, plaster, felt, iron), flame shaders
  world/           tavern.ts (room, bar, hearth, notice board, card den, merchant stall + display table, festive
                   decor, stations), figure.ts (hooded characters: breathe, blink, reach, lean, flinch, look at),
                   props.ts, materials.ts, fonts3d.ts, batch.ts (static mesh merging)
  art/             card art (SVG → canvas textures)
  cards/           cardTextures.ts (texture cache + data URLs for HTML previews)
  cosmetics/       catalog, art, apply (see above)
  match/           matchScreen.ts (event queue → animations for every card, input, aim mode, give UI, tutorial
                   hints, rival body language), tableView.ts (2–6 seats around the table, chairs, hands, name
                   tags, wards, turn glow, order ring, chains, boards, hourglass), handView.ts (3D hand parented to
                   the camera, lock overlay), results.ts, cardMesh.ts, fx.ts
  screens/         menus.ts (title, main menu, play menu: tickets, table picker, codex, ladder, spectate),
                   shop.ts (Shop, Inventory, Challenges board)
  audio/audio.ts   100% procedural WebAudio: lute music + drone, fire ambience, every SFX
  net/transport.ts LocalTransport (in-browser host for bot games), WsTransport (online, not yet in UI)
  ui/              styles.css, dom helpers, HUD (level, coins, rubies), profile, progression
server/index.ts    Static file server + WebSocket rooms (join/ready/action), same Host as the browser
scripts/           sim.ts (rules tests), serverSmoke.ts (online smoke test), e2e/ (Playwright browser tests)
```

Flow of a match: `Transport` delivers `GameEvent`s (already filtered for this player) → `MatchScreen.pump()` plays them
one at a time (`handle()` per event type, each animation fits inside the event's `dur`) → the UI only allows actions
when the queue is idle. If events back up, `tweens.scale` speeds animations up.

The world is one continuous tavern: camera "stations" are defined in `Tavern.stations` (intro, menu at the bar, play
at the notice board, table at the card den, shop at the merchant stall, inventory at the corkboard). Menus glide
between them; the match fades in at the table.

## Next steps (suggested order)

1. Owner review on a real Chromebook; tune quality tiers, timings and camera framing from feedback.
2. Online play UI (owner wants this on Render later): lobby with create/join by room code via `WsTransport`, seat
   looks from `SeatInfo.look`, reconnect using `Host.history()`, server-side profile/economy if coins must be trusted.
3. More cosmetics and seasonal wares; emotes; card-back animations for top-rarity sleeves.
4. Leaderboard and Private Table buttons in the play menu are placeholders (locked).

## Gotchas

- Cards are textured planes with alpha-tested rounded corners; `CardMesh` has 'table' (lit) and 'hand' (self-lit)
  material variants. Use 'hand' for anything held in front of the camera.
- troika-three-text: when an outline is set its `material` becomes an array; change colour via `text.color`.
- Overlay CSS: nested `.layer` elements must stay `pointer-events: none` or they block the 3D canvas.
- `THREE.Color` converts hex to linear; for canvas drawing parse hex yourself (see `feltCanvas` in cosmetics/art.ts).
- SVG art: duplicate attributes break rasterisation (`dedupeAttrs` in cardArt.ts).
- Fonts: fontsource packages, loaded before card textures are rasterised (`loadFonts()`).
- The merchant stall is built after static batching, so it can be animated and re-skinned.
- The reference video is the `reference-video` release asset on this repo; see `docs/REFERENCE_ANALYSIS.md`.
