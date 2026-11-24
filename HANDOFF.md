# The Hooded Hand — handoff notes

Read this first if you are a new Claude session (or a new developer) picking up the project.

## What this is

A browser 3D card game in the "don't draw the bomb" genre, built for the owner's Chromebook and designed to become
multiplayer on Render. It is **inspired by** a Roblox game the owner showed in a reference video (see
`docs/REFERENCE_ANALYSIS.md`), but it is an **original** game: original name, setting (medieval tavern), card names,
card art, characters and look. Do not copy the reference game's name, art, characters or UI look. Matching its
*mechanics, pacing, camera language and quality bar* is the goal.

Decisions the owner made:

- Setting: **medieval tavern**. Name: **The Hooded Hand**.
- Scope right now: **only the Play section** (main menu → play menu → full match). Shop, Inventory and Challenges are
  visible in the main menu but show "coming soon"; they are next.
- Modes: **Original (1v1 vs bot)** and **Tutorial**. Online play is wired in code (server + `WsTransport`) but not
  exposed in the UI; the owner will set up Render later.
- Must run well on a **Chromebook** (adaptive resolution and quality tiers are built in).
- Push everything to `PolynomialI/hitmen` on `main`.

## Run it

```bash
npm install
npm run dev            # client only (bot games), http://localhost:5173
npm test               # headless rules simulation: 300 bot-vs-bot games + scripted tutorial
npm run build          # client -> dist/, server -> dist-server/
npm start              # serves dist/ and the WebSocket game server on :8787 (Render runs this)
npx tsx scripts/serverSmoke.ts   # with the server running: two WS players play a full online game
```

Useful URL parameters (client):

| Param | Effect |
|---|---|
| `?start=original` / `?start=tutorial` | Skip menus, jump straight into a match |
| `?station=menu\|play\|table\|intro` | Dev: open at a camera station |
| `?q=low\|medium\|high` | Force a quality tier (otherwise auto-detected and adapted at runtime) |
| `?dtcap=0.4` | Test only: allow big frame steps so slow headless renderers finish animations |

## Deploy

- **GitHub Pages (bot games only):** `.github/workflows/pages.yml` builds and publishes `dist/` on every push to `main`.
  One-time: repo Settings → Pages → Source: **GitHub Actions**. URL: `https://polynomiali.github.io/hitmen/`.
- **Render (online-ready):** `render.yaml` is a Blueprint for one Node web service (`npm ci && npm run build`, then
  `npm start`, health check `/healthz`). Free plan sleeps when idle (first visit waits ~1 min).

## Architecture

```
src/shared/        Pure TypeScript, runs in browser AND on the server
  cards.ts         Card catalogue (names, text, colours, playable/instant/targeted flags, deck mix)
  engine.ts        Authoritative rules engine: state, actions, timers, events (with per-player secrets)
  host.ts          Runs a match: engine + bots + filtered event delivery to listeners
  bot.ts           Bot AI (sees only what a player would; remembers scried cards; human-like delays)
  tutorial.ts      Stacked deck + scripted rival for the tutorial
  match.ts         createBotMatch() for Original/Tutorial 1v1
  timing.ts        Presentation durations (DUR) the host reserves per event so clients can animate
src/client/
  main.ts          Boot, loading screen, navigation (title → menu → play → match)
  app.ts           Render loop, screen management
  core/            gfx.ts (renderer + post: bloom, ACES, grade/danger/holy/grain, vignette, adaptive res),
                   cameraRig.ts (stations, look-around, glides, shake), tween.ts, picker.ts (3D hover/click)
  gfx/             noise, procedural textures (wood, stone, plaster, felt, iron), flame shaders (candles, hearth)
  world/           tavern.ts (room, bar, hearth, notice board, card den, lights, stations), figure.ts (hooded
                   characters), props.ts, materials.ts, fonts3d.ts
  art/             cardArt.ts + emblems.ts: all card art as procedural SVG → canvas textures (no image files)
  cards/           cardTextures.ts (texture cache + data URLs for HTML previews)
  match/           matchScreen.ts (event queue → animations, input, tutorial hints, results),
                   tableView.ts (deck, pile, hourglass, rival, boards, sign, marker, ring), handView.ts (3D hand
                   parented to the camera), cardMesh.ts, fx.ts (sparks, feathers, flashes)
  screens/menus.ts Title, main menu (floating 3D labels over props), play menu (notice board tickets,
                   create-table mode picker, codex)
  audio/audio.ts   100% procedural WebAudio: Karplus-Strong lute music + drone, fire ambience, every SFX
  net/transport.ts LocalTransport (in-browser host for bot games), WsTransport (online, not yet in UI)
  ui/              styles.css, dom helpers, HUD, local profile (name/coins in localStorage)
server/index.ts    Static file server + WebSocket rooms (join/ready/action), same Host as the browser
scripts/           sim.ts (rules tests), serverSmoke.ts (online smoke test)
```

Flow of a match: `Transport` delivers `GameEvent`s (already filtered for this player) → `MatchScreen.pump()` plays them
one at a time (`handle()` per event type, each animation fits inside the event's `dur`) → the UI only allows actions
when the queue is idle. If events back up, `tweens.scale` speeds animations up.

The world is one continuous tavern: camera "stations" are defined in `Tavern.stations` (intro, menu at the bar, play
at the notice board, table at the card den). Menus glide between them; the match fades in at the table.

## Game rules (as implemented)

- Each player gets 1 Guardian Angel + 4 action cards. The deck holds the rest of the action pool, (players − 1)
  Hooded Hands and 1 spare Angel. Death's odds = Hands in deck / cards in deck.
- On your turn play any number of cards, then draw to end your turn. Draw the Hooded Hand → play a Guardian Angel
  within 8 s, then hide the Hand anywhere in the deck, or be slain.
- Cards: Parry (cancel the last played card; any time; parries chain), Scrying Orb (see top 3), Bounty (end turn
  without drawing; marked player takes 2 turns, stacks), Slip Away (end turn without drawing), Tavern Brawl (shuffle),
  Pickpocket (steal a random card from a marked player), Back Door (draw from the bottom).
- After any played card there is a 2.4 s window in which anyone may Parry.

## Status

Done and tested (headless Chromium + Playwright runs of the full tutorial and full Original matches, plus rules sims):

- Loading screen, title card, main menu at the bar with floating 3D labels and hover glow, camera look-around.
- Play menu at the notice board: table tickets (Original, Tutorial, locked Online/Ranked), Create Table mode picker,
  Card Codex, name entry, locked Private Table / Leaderboard.
- Full match: deal, intro banner, turn sign with candle "bulbs", three boards (death's odds, Hands left, souls left),
  hourglass turn timer, 3D hand with hover lift + preview panel, play/draw flights, opponent card reveal, Parry clash
  with sparks + reaction ring, Scrying Orb vision, Bounty targeting (top-down aim view + marker), shuffle, pickpocket,
  Hand drawn (red grade, music cut, stinger, 3-2-1 dread count), Angel rescue (holy flash, feathers, choir), hide slider,
  death sequence (candles snuffed, slash, rival flung from the chair / your view falls to the floor), Missing poster,
  results ledger with coins, tutorial hints.
- WebSocket server with rooms and bots filling empty seats; Render blueprint; Pages workflow.

Next steps (suggested order):

1. Owner review on a real Chromebook; tune quality tiers / timings / camera framing from feedback.
2. Online play UI: lobby (create/join private room code via `WsTransport`), seats for 2–6 players (TableView currently
   lays out one rival; generalise seats around the table), reconnect using `Host.history()`.
3. Shop and Inventory (card sleeves, chair/table cosmetics), Challenges board.
4. More cards / modes (Teams, seasonal table), ranked.

## Gotchas

- Cards are textured planes with alpha-tested rounded corners; `CardMesh` has 'table' (lit) and 'hand' (self-lit)
  material variants. Use 'hand' for anything held in front of the camera.
- troika-three-text: when an outline is set its `material` becomes an array; change colour via `text.color`.
- Overlay CSS: nested `.layer` elements must stay `pointer-events: none` or they block the 3D canvas.
- Fonts: fontsource packages, loaded before card textures are rasterised (`loadFonts()`).
- The reference video is the `reference-video` release asset on this repo; see `docs/REFERENCE_ANALYSIS.md`.
