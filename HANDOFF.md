# The Hooded Hand — handoff notes

Read this first if you are a new Claude session (or a new developer) picking up the project. Then read
[`docs/SESSION_CONTEXT.md`](docs/SESSION_CONTEXT.md) (the owner's requests verbatim, decisions, a starter prompt) and
look at [`docs/screenshots/`](docs/screenshots/) to see the current state.

## What this is

A browser 3D card game in the "don't draw the bomb" genre, built for the owner's Chromebook and designed to become
multiplayer on Render. It is **inspired by** a Roblox game the owner showed in a reference video (see
`docs/REFERENCE_ANALYSIS.md`), but it is an **original** game: original name, setting (medieval tavern), card names,
card art, characters and look. Do not copy the reference game's name, art, characters or UI look. Matching its
*mechanics, pacing, camera language, feature set and quality bar* is the goal.

Decisions the owner made:

- Setting: **medieval tavern**. Name: **The Hooded Hand**.
- Every card and mode of the reference game has an original equivalent (table below), plus Shop, Inventory,
  Challenges and levels.
- **Players only, no bots.** Every match is online against real players: Duel and Teams queues, Create Table, Join
  Table, Watch Table, a server-wide Leaderboard. The bot AI, the tutorial and local matches are **kept in the code**
  (the owner may bring bots back) but nothing in the game reaches them; `?start=` opens a local bot table on
  localhost only, for tests. Ranked, the tutorial, the Renown ladder and emotes were removed from the game.
- Online play needs the game server (`npm start`, i.e. Render). On a bare static host the board says the tavern is
  closed.
- **GitHub is blocked on the owner's managed Chromebook.** Nothing the game loads at runtime may come from GitHub
  (github.com, github.io, raw.githubusercontent) or a CDN that mirrors it: the page is fully self-hosted by whatever
  serves it. A Content-Security-Policy (`index.html`) only allows fetch/WebSocket to the page's own origin, and the
  e2e scripts fail on any off-origin request. GitHub Pages was dropped for this reason (CI only now); the game will
  be played from Render.
- Must run well on a **Chromebook** (adaptive resolution and quality tiers are built in).
- Push everything to `PolynomialI/hitmen` on `main`. The owner may halt work at any moment, so commit and push often.

## Run it

```bash
npm install
npm run dev            # client, http://localhost:5173 (online play also needs `npm run server:dev`)
npm test               # rules simulation: ~560 bot games over every mode/size + scripted tutorial (engine tests)
npm run typecheck
npm run build          # client -> dist/, server -> dist-server/
npm start              # serves dist/ and the WebSocket game server on :8787 (Render runs this)
npm run server:dev     # the game server alone (tsx watch); with `npm run dev`, Vite proxies /ws and /api to it
npx tsx scripts/serverSmoke.ts   # with a server running (BASE=http://localhost:8787): the online protocol end to end
```

To try online tables locally: `npm run build && npm start`, then open http://localhost:8787 in two browser windows
(use a private window for the second player, since the profile lives in localStorage).

Browser end-to-end tests (Playwright + Chromium; with `npm run dev` running in another terminal). They print page
errors, save screenshots to `e2e-shots/` (gitignored) and exit non-zero on any page error. The match, tutorial and
shop scripts use local bot tables (`?start=`, localhost only), which players can no longer reach:

```bash
node scripts/e2e/tutorial.cjs                 # plays the whole tutorial by clicking cards in the 3D scene
node scripts/e2e/match.cjs original 3 orig    # auto-plays a 4-player table: <mode> <rivals> <shot prefix>
node scripts/e2e/match.cjs teams 3 teams
node scripts/e2e/match.cjs winter 3 winter
node scripts/e2e/shop.cjs                     # buys + equips a daily ware, spins Fate's Wheel, checks it in a match
# Online (needs the game server serving the build: npm run build && npm start):
BASE=http://localhost:8787 node scripts/e2e/online.cjs   # create, Join Table, invite link, Begin (2 players),
                    # Watch Table, reload mid-match, results, another round; then a Duel from the queue where one
                    # player closes the tab and is knocked out after 30 s
```

Tip: the dev server hot-reloads, so editing `src/` while a long e2e run uses it reloads the test's pages. For long
runs, test a frozen build instead: `npx vite build --outDir /tmp/snap && npx vite preview --outDir /tmp/snap --port
5174`, then `BASE=http://localhost:5174`. Likewise, do not rebuild `dist/` while `online.cjs` runs against it.

On a fresh machine run `npx playwright install chromium` once. Headless runs use SwiftShader, which is slow; the
scripts pass `?q=low&dtcap=0.4` so animations still complete.

Useful URL parameters (client):

| Param | Effect |
|---|---|
| `?start=<mode>` | Tests only (localhost/dev): a local match against bots. Modes: `original`, `tutorial`, `teams`, `winter`, `ranked`, `scrimmage` |
| `&rivals=N` | With `start`: number of bot rivals (1–5; teams needs 3 or 5) |
| `?station=play\|shop\|inventory` | Dev: open straight at that station (after the title card) |
| `?q=lowest\|low\|medium\|high\|ultra` | Force a quality tier (overrides Settings; otherwise auto-detected and adapted at runtime) |
| `?dtcap=0.4` | Test only: allow big frame steps so slow headless renderers finish animations |

To reset a local profile: devtools → Application → Local Storage → delete `hooded-hand-profile-v2`.

## Deploy

- **Render (where the game is played):** `render.yaml` is a Blueprint for one free Node web service that serves the
  client and the online tables from one origin: build `npm ci --include=dev && npm run build`, start `npm start`,
  health check `/healthz`, `autoDeployTrigger: checksPass` (a push goes live only after the CI checks pass). During a
  deploy new players reach the new version at once; the old server gives matches in progress 25 s, tells their players
  the tavern is being updated, then exits (`shutdown()` in server/index.ts). Render kills a free service 30 s after
  SIGTERM; `maxShutdownDelaySeconds` (up to 300) is refused by the Blueprint on the free plan, so on a paid plan add it
  and set `SHUTDOWN_GRACE_MS` a little below it. Region is `virginia` (US East, the owner's choice) and
  cannot be changed after creation.

  Owner setup, route A (recommended; updates go live by themselves). GitHub is blocked on the Chromebook, so do
  steps 1-3 on a phone or another computer:
  1. dashboard.render.com → avatar → Account Settings → Account Security → Git Deployment Credentials → Add
     credential → GitHub → authorize.
  2. When GitHub asks which repositories Render may use, choose "Only select repositories" → PolynomialI/hitmen.
     (Later: github.com/apps/render/installations/new.)
  3. Dashboard → New → Blueprint → Connect next to PolynomialI/hitmen → branch `main` → name it → Deploy Blueprint.
     The first build takes a few minutes; the Events tab shows "Deploy live".
  4. On the Chromebook open the service URL (https://the-hooded-hand.onrender.com, or whatever the dashboard shows
     under the service name). Join a Table is unlocked when the page talks to the server.

  Route B (no GitHub login at all; manual updates): New → Web Service → Public Git Repository →
  `https://github.com/PolynomialI/hitmen` → Connect; Name `the-hooded-hand`, Language Node, Branch main, Region
  Virginia (US East), Build Command
  `npm ci --include=dev && npm run build`, Start Command `npm start`, Instance Type Free; Advanced → Health Check Path
  `/healthz`, environment variable `NODE_VERSION` = `22`. Updates only go live with Manual Deploy → Deploy latest
  commit.

  Free plan facts (Render docs, Nov 2026): it sleeps after 15 minutes with no HTTP requests or WebSocket messages and
  takes about a minute to wake (first visitor waits on Render's loading page); 750 free instance hours a month; Render
  may restart a free service at any time, which ends tables in memory (players see "the tavern is being updated" or
  "that table has closed"). If `*.onrender.com` is blocked on the Chromebook, a custom domain can be added in the
  service's Settings → Custom Domains.
- **CI:** `.github/workflows/ci.yml` runs typecheck, the sims and a full build on every push. There is no GitHub
  Pages deploy (github.io is blocked on the owner's Chromebook).

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

| Paper | What it does |
|---|---|
| Duel | Queue: matched with the next player waiting, 1v1 (engine mode `ranked`: Duel deck with Privateer/Sands) |
| Teams | Queue: four players, dealt 2v2 with the sides alternating round the table |
| Join Table | Open tables waiting for players (or type a code) |
| Create Table | Original, Teams, Scrimmage (half rewards) or Winter Feast; 2–6 seats; open or private |
| Watch Table | Matches being played at open tables: watch from any player's chair (arrows), their cards under a brown film |
| Leaderboard | Server-wide wins and games by name (in memory: resets when the server restarts) |

Winter Feast (`world/winter.ts`, Create Table only): the den under snow (floor, drifts, the table's rim and felt,
every chair, window sills, the stage floor), icicles on the valance, frosted windows, a snowy night painted on the
stage backdrop, snow falling through the room, a colder ambient light, and every player in a pale frosted cloak with
white fur trim and collar and snow on the hood and shoulders.

A table can begin once two players sit (in Teams, once both sides have one). Bots (`src/shared/bot.ts`) are kept
for later but never seated.

## Progression, Shop and Inventory

- Profile (`src/client/ui/profile.ts`, localStorage `hooded-hand-profile-v2`, migrates v1): coins (start 2500),
  rubies, XP/level (each level: +400 coins, +1 ruby; every 5 levels a Reforge token), stats, ranked rating,
  owned cosmetics with **mutations** (basic / gilded / mosaic / prismatic), equipped loadout.
- Results ledger (`src/client/match/results.ts`): coins per line item, XP bar with level-ups,
  daily/weekly challenges (`src/client/ui/progression.ts`) with claim buttons (also on the main menu board).
- **Shop** — the Peddler's Cart (`src/client/screens/shop.ts`, camera station `shop`): weekly featured bundle, daily
  wares with a refresh countdown, ruby wares, Fate's Wheel (token spin with reel animation and mutation roll), item
  detail modal with buy / equip. Tiles show only the art, the name and the price (rarity is the border colour); the
  owner asked for no explanatory text. Thumbnails are trimmed to their drawn content (`trimmedSVG` crops an icon's
  viewBox, `trimmedURL` crops a canvas) so the art fills its tile.
- **Inventory** — corkboard chest (station `inventory`): category tabs, owned items with mutation frames, hover for a
  live preview on the 3D display table (felt, card back, charm, chair, banner), reforge a mutation with a token.
- Cosmetics (`src/client/cosmetics/`): `catalog.ts` (~45 items, 6 rarities from common to contraband),
  `art.ts` (procedural sleeves, playmats, banners, impact/charm/seat icons, 3D charms and chairs),
  `apply.ts` (applies the loadout to card backs, table felt, banners; `lookFromProfile()` is sent with the player's
  seat so other clients/bots can render it). Categories: card sleeve, playmat, death impact (dust, embers, gold,
  frost, ravens, holy, smoke), table charm, chair, banner. Bots wear random looks.
- Legendary and contraband sleeves (and any prismatic one) **shimmer**: a band of light in the sleeve's accent colour
  sweeps across every card back every few seconds (`backGlint` / `addGlint` in `match/cardMesh.ts`, switched in
  `applyCosmetics`, so shop/inventory previews show it too).

## Architecture

```
src/shared/        Pure TypeScript, runs in browser AND on the server
  cards.ts         Card catalogue, deck mixes, pool sizes
  engine.ts        Authoritative rules engine: phases (turn, reaction, give, scry, rescue, hide, over), direction,
                   locks, wards, teams, timers, events with per-player secrets (teammates share secrets)
  host.ts          Runs a match: engine + bots + filtered event delivery to listeners
  bot.ts           Bot AI
  tutorial.ts      Stacked deck + scripted rival for the tutorial
  match.ts         createLocalMatch() for every mode (bots, kept for later), createTableMatch() for online
                   tables (players only, teams seated alternately), named RIVALS, seeded bot looks
  online.ts        Online protocol types (ClientMsg / ServerMsg / LobbyInfo), modes and seat options
  text.ts          safeGlyphs() / cleanName(): 3D text only uses glyphs the bundled fonts have (else troika would
                   fetch fallback fonts from a CDN); names are cleaned to that set on client and server
  timing.ts        Presentation durations (DUR) the host reserves per event so clients can animate
  types.ts         GameMode, SeatInfo (with team, look), Action, GameEvent, PlayerView
src/client/
  main.ts          Boot, loading screen, navigation (title → menu → play/shop/inventory → match)
  app.ts           Render loop, screen management
  core/            gfx.ts (renderer + post: bloom, ACES, grade/danger/holy/grain, vignette, SMAA on high; quality
                   tiers, pixel budget, adaptive resolution, shadow-map scheduling; see "Performance"),
                   cameraRig.ts (stations, look-around, glides, shake), tween.ts, picker.ts (3D hover/click)
  gfx/             noise, procedural textures (wood, stone, plaster, felt, iron), flame shaders
  world/           tavern.ts (room, bar, hearth, notice board, card den, merchant stall + display table, festive
                   decor, stations), figure.ts (hooded characters: breathe, blink, reach, lean, flinch, look at),
                   props.ts, materials.ts, fonts3d.ts, batch.ts (static mesh merging: batchStatic per quarter
                   of the room, mergeLocal for things that move as one), lightBudget.ts (live-light selection)
  art/             card art (SVG → canvas textures)
  cards/           cardTextures.ts (texture cache + data URLs for HTML previews)
  cosmetics/       catalog, art, apply (see above)
  match/           matchScreen.ts (event queue → animations for every card, input, aim mode, give UI, tutorial
                   hints, rival body language), tableView.ts (2–6 seats around the table, chairs, hands, name
                   tags, wards, turn glow, order ring, chains, boards, hourglass), handView.ts (3D hand parented to
                   the camera, lock overlay), results.ts, cardMesh.ts, fx.ts
  screens/         menus.ts (title, main menu, play menu: the six papers, Create Table, Leaderboard),
                   lobby.ts (waiting room, Join Table, the Duel/Teams queue, Watch Table), settings.ts (+ the Card
                   Codex button), codex.ts, shop.ts (Shop, Inventory, Challenges board)
  audio/audio.ts   100% procedural WebAudio: lute music + drone, fire ambience, every SFX
  net/transport.ts LocalTransport (in-browser host for bot games), WsTransport (online, over an OnlineSession)
  net/online.ts    OnlineSession: one same-origin WebSocket per table, auto-reconnect, resume after reload
                   (seat token in localStorage for 35 s), queue / watch sessions, event buffer; serverAvailable(), listRooms(),
                   liveTables(), leaderboard() via /api
  ui/              styles.css, dom helpers, HUD (level, coins, rubies), profile, progression
server/index.ts    Static files + /api/info + /api/rooms + WebSocket rooms (see "Online tables"), same Host as the browser
scripts/           sim.ts (rules tests), serverSmoke.ts (online smoke test), e2e/ (Playwright browser tests),
                   perf.cjs (per-scene frame stats), hitches.cjs (late shader compiles and long frames in a match)
```

Flow of a match: `Transport` delivers `GameEvent`s (already filtered for this player) → `MatchScreen.pump()` plays them
one at a time (`handle()` per event type, each animation fits inside the event's `dur`) → the UI only allows actions
when the queue is idle. If events back up, `tweens.scale` speeds animations up.

The world is one continuous tavern: camera "stations" are defined in `Tavern.stations` (intro, menu at the bar, play
at the notice board, table at the card den, shop at the merchant stall, inventory at the corkboard). Menus glide
between them; the match fades in at the table.

## Online tables

How it plays: the board's papers. **Duel** and **Teams** join a matchmaking queue (a dot per chair fills as players
arrive; the match deals itself when it is full). **Create Table** picks a mode and seats and whether the table is
open (listed) or private (code only), and opens the table's **waiting room** (code + Copy, seats, team chips in
Teams). Others come in from **Join Table** (open tables, or a code) or the waiting room's **Copy invite link**
(`https://<host>/?join=CODE`). The host clicks **Begin** once two players sit (both sides in Teams). The host can ask
a player to leave (✕) before the start. Two players with the same name become "Name" and "Name II".

In a match, a player who drops out (closed tab, lost connection) has **30 s** to come back: everyone else sees
"Name lost their connection · 27s to return" counting down, then "Name is back", or the player is knocked out (the
engine forfeits their seat, which counts as slain). Reloading or reopening the page within that time takes the seat
back: the seat token is kept in localStorage with a timestamp (refreshed every 5 s while connected), the server sends
the match so far and the match screen replays it instantly (`tweens.instant`, `audio.suppressed`). In the waiting
room a seat is held for 20 s. After the results, **Back to the table** returns everyone to the waiting room for
another round; if the host starts it while you are still on the results, you are sat down automatically. Leaving an
online match gives up the seat. When you are slain you watch the rest from the living players' chairs.

**Watch Table** lists open matches in play (`/api/live`); a watcher gets the match from the start (no hands), then
every event, and switches between the players' chairs.

Server (`server/index.ts`): rooms keyed by a 5-letter code; `create` / `join` / `rejoin {token, since, round}` /
`team` / `start` (host only) / `kick` (host only, waiting) / `again` / `leave` / `action` / `queue {mode}` /
`unqueue` / `watch {room}`; replies `welcome {you, token}`, `lobby {LobbyInfo}`, `event`, `history {evs, from}` (events
missed since `since`, or the whole match when `from` is 0), `result`, `presence {graceMs}`, `queued {waiting, need}`,
`error {fatal?}`. HTTP: `/api/info`, `/api/rooms` (open tables waiting), `/api/live` (matches to watch),
`/api/leaderboard`. Names are cleaned (`cleanName`), looks are reduced to short ids, messages are
rate-limited, at most 300 rooms, finished tables close after 5 min. Rewards are still granted client-side from the
local profile (see Next steps).

## Next steps (suggested order)

1. Owner: deploy the latest `main` on Render; check it on the managed Chromebook (quality tiers, timings, camera).
2. A server-side profile/economy if coins and the leaderboard must be trusted (today coins live in localStorage and
   the leaderboard is by name, in memory).
3. Bots back as an option (the AI is still in `src/shared/bot.ts`; `createLocalMatch` still works).
4. More cosmetics and seasonal wares; per-player sleeves at the table (today every back shows your own sleeve).

## Performance

Budget: smooth on a school Chromebook (small integrated GPU, 2-4 core CPU). What keeps it there:

- **Quality tiers** (`TIERS` in `core/gfx.ts`; Settings or `?q=` pick one, else Auto): ultra / high / medium /
  low / lowest. `guessQuality` (Auto) starts software rendering and the weakest Chromebooks on lowest, other
  Chromebooks on low, other integrated GPUs on medium, the rest on high (ultra is opt-in). Per tier: pixel budget
  (5.5 / 2.4 / 1.4 / 0.85 / 0.45 MP; bigger screens are upscaled), render-density cap (2 with supersampling / 1.5 /
  1.25 / 1 / 0.85), bloom levels (8 / 7 / 5 / 4 / off), shadows (soft 2048 / soft / hard / off / off), shadow redraw
  every 1st / 1st / 2nd / 3rd frame, anisotropy 16 / 8 / 4 / 2 / 1, live point + spot lights 4+2 / 3+1 / 3+1 / 2+1
  / 1+0, SMAA (high preset / medium / none) below 1.4 render pixels per CSS pixel, velvet sheen on ultra and high.
  (4x MSAA on the half-float buffer used to cost ~40% of a frame.)
- **Adaptive quality** (`Gfx.adapt`): judged on frame intervals against the display's refresh period (10th
  percentile of the last 90 frames; a 30 FPS cap sets the floor). Slow: drop a tier's cheap extras first (ultra/high
  → next tier), then resolution, then lower tiers. Keeping up: creep resolution back up; a step up that proves too
  slow is rolled back and not retried. A tier or resolution the player fixed in Settings is left alone. Auto tier
  changes never switch shadows or light counts (that rebuilds every shader); a tier picked in Settings does
  (`applyQuality(true)`, `Tavern.applyTier`): one short hitch.
- **Settings** (gear, top left; `screens/settings.ts`, saved in localStorage `hooded-hand-settings-v1`,
  `ui/settings.ts`): quality (Auto + 5 tiers), resolution (Auto, 100/85/70/50% of native), show frame rate (fps, tier
  and render size), limit to 30 FPS, sound on/off, master / music / effects / ambience volume. All apply at once.
- **Light budget** (`world/lightBudget.ts`): every lit shader pays for every live light on every pixel. A fixed
  number of point and spot lights is live, chosen by what the camera looks at, with fades when they swap. Counts never
  change, so swaps never recompile shaders. Lights must exist when the Tavern constructor builds the budget.
- **Shadows**: only the table spot casts. `renderer.shadowMap.autoUpdate` is off; `Gfx` redraws the map while
  `gfx.shadowFocus` (the card table) is on screen. Surfaces outside the spot's cone don't receive shadows (no
  per-pixel shadow filtering where it can't show). Cards cast from the back plane only (`shadowSide` double).
- **Draw calls** (the CPU cost on Chromebooks): static tavern meshes merge per material per quarter of the room
  (`batchStatic`), so off-screen quarters are culled; figures, chairs, charms and the turn clock merge their static
  parts with `mergeLocal` (animated parts listed in `keep`).
- **Hitches**: production builds skip three.js shader error checks (a synchronous stall per compile); the tavern's
  shaders compile behind the loading screen, the table's in the background as a match starts
  (`renderer.compileAsync`).

Measuring (software GPU in this container, so compare runs with each other, not with real hardware):
`npx vite build --minify false --outDir /tmp/perf && npx vite preview --outDir /tmp/perf --port 5174 --strictPort &`,
then `BASE=http://localhost:5174 node scripts/perf.cjs` (fps, CPU ms per frame, draw calls, triangles, lights,
shaders; `TOP=1` adds JS hot spots, `Q=low|medium|high`) and `node scripts/hitches.cjs` (plays a match from the board).

## Gotchas

- Cards are textured planes with alpha-tested rounded corners; `CardMesh` has 'table' (lit) and 'hand' (self-lit)
  material variants. Use 'hand' for anything held in front of the camera.
- troika-three-text: when an outline is set its `material` becomes an array; change colour via `text.color`.
- Overlay CSS: nested `.layer` elements must stay `pointer-events: none` or they block the 3D canvas. The default
  `pointer-events: auto` for UI children has zero specificity (`:where`), so a class's own `pointer-events: none`
  wins (the turn countdown and captions used to swallow clicks meant for the table).
- `THREE.Color` converts hex to linear; for canvas drawing parse hex yourself (see `feltCanvas` in cosmetics/art.ts).
- SVG art: duplicate attributes break rasterisation (`dedupeAttrs` in cardArt.ts).
- Fonts: fontsource packages, loaded before card textures are rasterised (`loadFonts()`).
- The merchant stall is built after static batching, so it can be animated and re-skinned.
- The reference video is the `reference-video` release asset on this repo; see `docs/REFERENCE_ANALYSIS.md`.
- Runtime is same-origin only (CSP `connect-src 'self'`). Any new 3D text goes through `makeText` (which applies
  `safeGlyphs`); text set directly on a troika `Text` must stay within the bundled fonts' glyphs (Latin-1).
- Table camera: `Station.look` takes an optional third value, the downward pitch limit (the table stations keep it
  tiny so the Your Turn sign never leaves the frame while the pointer is over the hand).
- Online match screen: a `start` event arriving at a screen that already started means a new round; the handler
  returns false (event stays queued in the session) and a fresh MatchScreen takes it.
