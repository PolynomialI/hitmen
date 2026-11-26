# Session context (for the next chat)

This file carries over the conversation that built this repo, so a new Claude chat (on any account) can continue
without the original transcript. Read it together with:

- [`HANDOFF.md`](../HANDOFF.md): architecture, how to run/test/deploy, cards, modes, shop and inventory, gotchas.
- [`docs/REFERENCE_ANALYSIS.md`](REFERENCE_ANALYSIS.md): a second-by-second breakdown of the owner's reference video.
- [`docs/screenshots/`](screenshots/): what the game looks like right now.

## Starter prompt for a new chat

Paste this into the new chat (in a Claude Code session with the `PolynomialI/hitmen` repo attached):

> Continue building "The Hooded Hand" in this repo. First read `HANDOFF.md`, `docs/SESSION_CONTEXT.md` and
> `docs/REFERENCE_ANALYSIS.md`, run `npm install && npm test && npm run typecheck`, then tell me what you plan to
> do next. Keep the same quality bar, commit and push to `main` often, and keep everything original (no names,
> art or characters copied from the reference game).

## What the owner asked for (verbatim, in order)

1. > Ignore emojiRp. I am going to ask you to copy (not in your own way obviously) the roblox game known as hitmen
   > card game. Everything from the animations, games, cards, art and features should be like the original game.
   > Don't complete this task yet, i will provide a ton of materials to help you know what style and look to aim for
   > (after this message). I hope you realize that I don't want a cheap game, cheap style, cheap animations, I want
   > a genuinely incredibly made game with an incredible atmosphere that will be built on a new render blueprint
   > (for multiplayer ability) and this needs to function on a chromebook and everything should be pushed to github
   > repo hitmen to ensure that another chat on another claude account can take over (because the pro on this
   > account is running out).
2. > if I gave you a video woudl you be able to understand it?
3. > how can I get this chat to have my 123mb video file

   (Answer used: upload it as a GitHub release asset. It is the `reference-video` release on this repo.)
4. > Ok so I uploaded the video. The video essentiually goes over three main things: The Shop, Play, and The
   > Inventory. For now I want you to only build the play section, we will work on the inventory and shop later.
   > But the jist of the game's atmopshere is to have an incredible shader esque medieval look to the menu a smooth
   > look around system to make the menus seem immersive. Each art you make of this should be incredibly well
   > thought out and similar to the game. Then copy (in your own style but maintaining the intention and esque of
   > the menus in the original game) make a play menu and then the full game setup. In the full game set up I went
   > over the tutorial to show exactly what the animations and environemtn looks like. I went over the attack
   > another player animation, hitmen select, hitmen death, angel savior, and all of these animations. The game
   > menu sdhould also ahve that immersive look around menu feel to it but the deck on the table being immerisviely
   > attached to it. Everything about this game should look incredible, ask me questions for clarifications and
   > make srue you take apart the video very slowly and carefully, do not constrain your thoguht process based on
   > limits, use as much as you possibly can. However always be ready for me to halt your progress and make you
   > submit everything to the repo.
5. Answers to clarifying questions:
   - Setting: **Medieval tavern**. Name: **The Hooded Hand**.
   - Players: "1 bot mode 1v1 for now. We will set up the render multiplayer later"
   - Modes: "Again, we will set up the render.com multiplayer later, just for now add support for multiplayer but
     only have a mode for 1v1 bots to test." plus **Original** and **Tutorial**.
6. > make more, do more to the game, make animations, make everything better. make sure you have every card and
   > feature in hitmen card game and then after all of that start building the shop and inventory from the video.
   > Do not cheap out on anything
7. > push everything including context and hand offs to github for another chat to continue

Second chat (continuing from this file):

8. The starter prompt below ("Continue building ... tell me what you plan to do next ...").
9. > do whatever you can possiblt do without me creating a render blueprint for this yet but note that github is
   > blocked on our managed Chromebook so don't build anything to access or refernce from tbere
10. GUI feedback (screenshot of the play bar): icons too small inside their circles, the rectangle behind them looks
    barren; same for all text; remove unnecessary text; better sizing; much better menu textures.
11. Table feedback: the name text drew over the Hooded Hand card; heavily improve animations (drawing, attacking,
    scrying, shuffling, pulling a card); up to 5 bots; a large clock in front of whoever's turn it is that travels
    clockwise to the next player; white target arrows for all bots; icons for turns owed; attack stacking; drawing
    the Hand resets turns.
12. More table feedback: no hands resting on the table (players only hold their cards); equal spacing; much better
    player textures; deck larger and turned right; held cards larger, upright, matching real counts; great
    animations for playing, gaining and burning cards.
13. > I created a new render.com account, give me all the steps to connect github and whatever else to do to set up
    > multiplayer. Make sure you do everything on your part and set up actually good multiplayer/private rooms

## How the requests were interpreted

- **Originality.** A 1:1 copy of another game's name, art and characters is not something we ship. The agreed
  approach: same genre, mechanics, pacing, camera language, menu structure and feature set, with an original
  name, setting, card names, card art and characters. Every reference card has an original equivalent (see the
  card table in HANDOFF.md). Keep it that way.
- **"Render blueprint"** = Render.com `render.yaml` Blueprint (one Node web service: static client + WebSocket
  server). It is in the repo and works; the owner will set up the Render account and online UI later.
- **"Ignore emojiRp"**: the cloud session was started on another repo (`emojiRP`); ignore it. All work goes to
  `PolynomialI/hitmen`, branch `main`.
- **"github is blocked on our managed Chromebook"**: the game must never load anything from GitHub (or a CDN that
  mirrors it) at runtime, and GitHub Pages is useless to the owner, so it was removed (CI only). The only runtime
  dependency was troika's fallback-font CDN, now impossible (glyph-safe 3D text + CSP). The game will be played
  from Render. Docs and dev scripts may still mention GitHub (the repo lives there).
- **"without me creating a render blueprint yet"**: everything that does not need the owner's Render account was
  built: online tables (server + UI + reconnect), tested locally with the real server and several browsers.
- **Chromebook**: everything is procedural (no big asset files), with adaptive resolution, quality tiers
  (`?q=low|medium|high`), static mesh batching and a modest post-processing stack.
- **Quality bar**: the owner repeatedly asked for nothing "cheap". Every new feature got its own art, animation,
  sound and UI polish, and was checked in a real browser before being pushed.

## What was built (commit history, oldest first)

1. Reference video analysis (frame sheets via ffmpeg, see REFERENCE_ANALYSIS.md).
2. Vite + TypeScript + three.js scaffold, Render blueprint.
3. Shared rules engine, bot AI, tutorial script, match host.
4. Procedural SVG card art and card back.
5. 3D tavern: post-processing (bloom, ACES, colour grade with danger/holy states, grain, vignette), procedural
   textures, candle/hearth flame shaders, hooded figures, bar, hearth, notice board, card den.
6. Title screen, main menu with floating 3D labels and look-around, notice-board play menu, mode picker, codex,
   HUD, fully procedural audio (lute music, drone, fire, every SFX).
7. The match: 3D hand and table, deal/draw/play/parry/scry/bounty/shuffle/steal animations, red doom state, angel
   rescue, hide slider, death sequence, Missing poster, results, tutorial.
8. WebSocket server with rooms + smoke test, GitHub Pages workflow.
9. Chromebook pass: static batching (~3x fewer draw calls).
10. Engine v2: 11 new cards, 2–6 players, teams, turn direction, locks, wards, victim-chooses Pickpocket.
11. Card art for the 11 new cards.
12. Multi-seat table (2–6), animations for every new card, intro sweep, results with XP/levels/ranked/challenges.
13. Play menu v2: six tables, table-size picker, ranked badge and ladder, spectating, codex by set, winter decor.
14. Shop, Inventory and cosmetics (45 items, 6 categories, mutations, spin wheel, reforging, challenges board).
15. Rival body language (lean, flinch, stare, recoil, look at the empty chair).
16. Handoff docs + Playwright e2e scripts.

Second chat:

17. Self-hosted only: CSP, glyph-safe 3D text and names, e2e fail on off-origin requests, Pages → CI workflow.
18. Table framing like the reference (camera further back and higher, tiny downward look, sign/boards/rival/deck/pile
    all above the hand), readable rival name tags, hide step polish, tutorial parry made timing-proof.
19. Online tables: server rooms (create/join/rejoin/team/start/again/leave, open-table list API, rate limits),
    OnlineSession + WsTransport, waiting room and Join a Table UI, instant replay on reload, Back to the table.
20. Emotes; shimmering top-rarity sleeves; leaving a match no longer blanks the tavern.
21. Name tags depth-tested; surviving the Hand ends all owed turns (rules test in the sims).
22. Table rework: equal seats, clockwise order, held cards upright and larger, hold pose, larger turned deck, turn
    clock (timer + owed-turns medallion); aiming holds the view still (targets e2e).
23. Animations: draw suspense, plays from the row to the middle, attack bolt, scry cascade, aerial riffle, gains, burn.
24. GUI: medallion play bar, tickets, less text, icons that fill their medallions; wool/leather for players; detailed
    wood, plaster, metals, leather, velvet, parchment.
25. Render-ready multiplayer: invite links, unique names, host kick, graceful deploys, render.yaml on current fields.

## How work was verified

- `npm test`: ~560 bot-vs-bot games across every mode and table size, card-conservation checks, event coverage,
  plus a scripted tutorial student. Passes locally and in GitHub Actions.
- `scripts/e2e/*.cjs`: headless Chromium plays the tutorial, full 4-player original / teams / winter tables and the
  shop buy-equip-spin flow, clicking real 3D objects, with zero page errors. Screenshots were reviewed by eye.
- `scripts/serverSmoke.ts` (real sockets against the dev or bundled production server) and
  `scripts/e2e/online.cjs` (three headless browsers: create, list, join by code, start, play, reload mid-match,
  results, another round) cover online tables.
- **Not verified:** a real Chromebook (only headless SwiftShader), a real Render deployment (the bundled server was
  run locally), whether the managed Chromebook can reach `*.onrender.com`, sound by ear (audio is generated, never
  listened to).

## Owner's open to-dos / known state

- **Render:** the owner created an account (Nov 25). Steps are in HANDOFF.md → Deploy (route A via a device where
  GitHub opens, or route B with the public repo URL). Until it is live, the game only runs where someone runs
  `npm start` (or `npm run dev` for bot tables).
- Online tables are built and tested locally; they unlock automatically when the page is served by the server.
- The Leaderboard is the local ranked ladder; a real one needs server-side accounts.
- Coins/items live in the browser's localStorage (also for online tables); move them server-side if they must be
  trusted.

## Working style the owner expects

- Ask clarifying questions when a choice is genuinely theirs (setting, name, scope); otherwise make a good call
  and keep going.
- Commit and push to `main` frequently with descriptive messages; the owner may stop the session at any moment.
- Keep the owner informed with short progress notes; finish with a plain summary of what was done, what was
  tested, and what they need to do (e.g. creating the Render service).
