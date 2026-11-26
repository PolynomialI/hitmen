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
  Challenges, levels and ranked.
- **Online tables are built** (create a table, open-tables list, join by code, waiting room, bots fill empty chairs,
  reconnect/resume after a reload, another round). They appear whenever the page is served by the game server
  (`npm start`, i.e. Render); on a bare static host they stay locked and every table is vs bots. The owner will create
  the Render service from `render.yaml` later.
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
npm run dev            # client only (bot games), http://localhost:5173
npm test               # rules simulation: ~560 bot games over every mode/size + scripted tutorial
npm run typecheck
npm run build          # client -> dist/, server -> dist-server/
npm start              # serves dist/ and the WebSocket game server on :8787 (Render runs this)
npm run server:dev     # the game server alone (tsx watch); with `npm run dev`, Vite proxies /ws and /api to it
npx tsx scripts/serverSmoke.ts   # with a server running (BASE=http://localhost:8787): the online protocol end to end
```

To try online tables locally: `npm run build && npm start`, then open http://localhost:8787 in two browser windows
(use a private window for the second player, since the profile lives in localStorage).

Browser end-to-end tests (Playwright + Chromium; with `npm run dev` running in another terminal). They print page
errors, save screenshots to `e2e-shots/` (gitignored) and exit non-zero on any page error:

```bash
node scripts/e2e/tutorial.cjs                 # plays the whole tutorial by clicking cards in the 3D scene
node scripts/e2e/match.cjs original 3 orig    # auto-plays a 4-player table: <mode> <rivals> <shot prefix>
node scripts/e2e/match.cjs teams 3 teams
node scripts/e2e/match.cjs winter 3 winter
node scripts/e2e/shop.cjs                     # buys + equips a daily ware, spins Fate's Wheel, checks it in a match
# Online (needs the game server serving the build: npm run build && npm start):
BASE=http://localhost:8787 node scripts/e2e/online.cjs   # 3 players: create, open-tables list, join by code,
                                                         # start, play, reload mid-match, results, another round
```

Tip: the dev server hot-reloads, so editing `src/` while a long e2e run uses it reloads the test's pages. For long
runs, test a frozen build instead: `npx vite build --outDir /tmp/snap && npx vite preview --outDir /tmp/snap --port
5174`, then `BASE=http://localhost:5174`. Likewise, do not rebuild `dist/` while `online.cjs` runs against it.

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

- **Render (where the game is played):** `render.yaml` is a Blueprint for one free Node web service that serves the
  client and the online tables from one origin: build `npm ci --include=dev && npm run build`, start `npm start`,
  health check `/healthz`, `autoDeployTrigger: checksPass` (a push goes live only after the CI checks pass), and
  `maxShutdownDelaySeconds: 300` (during a deploy the old server finishes matches in progress, up to 5 minutes, then
  exits; see `shutdown()` in server/index.ts; new players reach the new version at once). Region is `virginia` (US East, the owner's choice) and
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
- Legendary and contraband sleeves (and any prismatic one) **shimmer**: a band of light in the sleeve's accent colour
  sweeps across every card back every few seconds (`backGlint` / `addGlint` in `match/cardMesh.ts`, switched in
  `applyCosmetics`, so shop/inventory previews show it too).

## Emotes

The speech button beside Sound/Leave in a match (or keys 1-6) calls a phrase across the table: *Well played.*,
*Ha! Ha!*, *Mercy, I beg you!*, *Curses!*, *The Hand is coming for you.*, *A toast to the fallen!*
(`src/shared/emotes.ts`). It shows as a parchment speech bubble over the speaker's head (yours rises above your hand),
2.5 s cooldown. Tavern regulars react now and then (marked with a Bounty, drawing the Hand, surviving it, a rival
slain, winning), timed to land as the animation plays out; this lives in `Host` so bot tables and the server's
online tables behave the same. Online, emotes go through the server (`emote` message, validated and rate-limited)
to everyone else at the table. Emotes are cosmetic: never part of the rules or the event log.

## Architecture

```
src/shared/        Pure TypeScript, runs in browser AND on the server
  cards.ts         Card catalogue, deck mixes, pool sizes
  engine.ts        Authoritative rules engine: phases (turn, reaction, give, scry, rescue, hide, over), direction,
                   locks, wards, teams, timers, events with per-player secrets (teammates share secrets)
  host.ts          Runs a match: engine + bots + filtered event delivery to listeners
  bot.ts           Bot AI
  tutorial.ts      Stacked deck + scripted rival for the tutorial
  match.ts         createLocalMatch() for every mode, createTableMatch() for online tables (players + regulars,
                   teams seated alternately), named RIVALS, seeded bot looks
  online.ts        Online protocol types (ClientMsg / ServerMsg / LobbyInfo), modes and seat options
  text.ts          safeGlyphs() / cleanName(): 3D text only uses glyphs the bundled fonts have (else troika would
                   fetch fallback fonts from a CDN); names are cleaned to that set on client and server
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
  screens/         menus.ts (title, main menu, play menu: tickets, table picker incl. "who sits with you", codex,
                   ladder, spectate), lobby.ts (online waiting room, Join a Table: open tables + code),
                   shop.ts (Shop, Inventory, Challenges board)
  audio/audio.ts   100% procedural WebAudio: lute music + drone, fire ambience, every SFX
  net/transport.ts LocalTransport (in-browser host for bot games), WsTransport (online, over an OnlineSession)
  net/online.ts    OnlineSession: one same-origin WebSocket per table, auto-reconnect, resume after reload
                   (seat token in sessionStorage), event buffer; serverAvailable() / listRooms() via /api
  ui/              styles.css, dom helpers, HUD (level, coins, rubies), profile, progression
server/index.ts    Static files + /api/info + /api/rooms + WebSocket rooms (see "Online tables"), same Host as the browser
scripts/           sim.ts (rules tests), serverSmoke.ts (online smoke test), e2e/ (Playwright browser tests)
```

Flow of a match: `Transport` delivers `GameEvent`s (already filtered for this player) → `MatchScreen.pump()` plays them
one at a time (`handle()` per event type, each animation fits inside the event's `dur`) → the UI only allows actions
when the queue is idle. If events back up, `tweens.scale` speeds animations up.

The world is one continuous tavern: camera "stations" are defined in `Tavern.stations` (intro, menu at the bar, play
at the notice board, table at the card den, shop at the merchant stall, inventory at the corkboard). Menus glide
between them; the match fades in at the table.

## Online tables

How it plays: Play menu → **Create Table** → pick a mode (Original, Teams, Winter Feast) and seats, then **Who sits
with you**: *Tavern regulars* (bots, as before), *Open table* (listed for everyone) or *Private table* (code only).
That opens the table's **waiting room** (code + Copy, seats, empty chairs, team chips in Teams). Others join from
**Join a Table** (open tables, with a count badge on the button, or a code). The host clicks **Start the night**;
regulars (named bots with random looks) take the empty chairs. In a match, a dropped connection shows a
"reconnecting" chip and the seat is held (90 s in a match, 20 s in the waiting room; the turn timer keeps running,
so an absent player auto-draws). Reloading the page takes the seat back: the server sends the match so far and the
match screen replays it instantly (`tweens.instant`, `audio.suppressed`). After the results, **Back to the table**
returns everyone to the waiting room for another round; if the host starts it while you are still on the results,
you are sat down automatically. Leaving an online match gives up the seat (counts as slain). The waiting room's
**Copy invite link** gives `https://<host>/?join=CODE`, which opens the game straight into that table. The host can
ask a player to leave (✕) before the start. Two players with the same name at one table become "Name" and "Name II".

Server (`server/index.ts`): rooms keyed by a 5-letter code; `create` / `join` / `rejoin {token, since, round}` /
`team` / `start` (host only) / `kick` (host only, waiting) / `again` / `leave` / `emote` / `action`; replies `welcome {you, token}`, `lobby {LobbyInfo}`,
`event`, `history {evs, from}` (events missed since `since`, or the whole match when `from` is 0), `result`,
`presence`, `error {fatal?}`. Names are cleaned (`cleanName`), looks are reduced to short ids, messages are
rate-limited, at most 300 rooms, finished tables close after 5 min. Rewards are still granted client-side from the
local profile (see Next steps).

## Next steps (suggested order)

1. Owner: create the Render service from `render.yaml`; check it loads on the managed Chromebook; then review on the
   real device (quality tiers, timings, camera framing).
2. Online polish once real players try it: a host "kick", spectating an online table, and a server-side
   profile/economy if coins must be trusted (today they live in localStorage).
3. More cosmetics and seasonal wares; per-player sleeves at the table (today every back shows your own sleeve).
4. The Leaderboard is the local ranked ladder (named rivals); a real one needs server-side accounts.

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
- Runtime is same-origin only (CSP `connect-src 'self'`). Any new 3D text goes through `makeText` (which applies
  `safeGlyphs`); text set directly on a troika `Text` must stay within the bundled fonts' glyphs (Latin-1).
- Table camera: `Station.look` takes an optional third value, the downward pitch limit (the table stations keep it
  tiny so the Your Turn sign never leaves the frame while the pointer is over the hand).
- Online match screen: a `start` event arriving at a screen that already started means a new round; the handler
  returns false (event stays queued in the session) and a fresh MatchScreen takes it.
