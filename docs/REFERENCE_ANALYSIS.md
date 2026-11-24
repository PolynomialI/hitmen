# Reference video analysis

Source: the `reference-video` release on this repo (`Recording.2026-11-23.221429.mp4`, 1918x1078, 30 fps, 114.6 s).
The video is gameplay of an existing Roblox game in the "don't draw the bomb" card genre. **We do not copy its
name, art, characters or look.** We study it for: flow, pacing, mechanics, camera language, and the quality bar.
Everything we ship (art, card names, characters, setting) is original.

To re-extract frames (ffmpeg is installed in the cloud container):

```bash
curl -sL -o ref.mp4 https://github.com/PolynomialI/hitmen/releases/download/reference-video/Recording.2026-11-23.221429.mp4
ffmpeg -i ref.mp4 -vf "fps=1,scale=480:-1,drawtext=text='%{pts\:hms}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=4x3" sheets/s%02d.jpg
ffmpeg -ss 79 -i ref.mp4 -frames:v 1 frame.jpg   # single full-res frame
```

Audio: nearly silent in the recording (-55..-65 dB RMS). One usable cue: the background audio drops to silence
the moment the deadly card is drawn (~1:19) and stays silent through the death sequence.

## Timeline

| Time | What happens |
|---|---|
| 0:00-0:05 | Main menu. 3D bar interior, camera gently follows the mouse. Floating 3D words: SHOP / PLAY / INVENTORY / CHALLENGES. Hover turns a word red and outlines the linked prop (inventory = briefcase). |
| 0:06-0:23 | Shop and Inventory (out of scope for now). |
| 0:24-0:26 | PLAY clicked: camera glides to a second spot in the same world (theatre box with red curtains, brass lamps). |
| 0:26-0:31 | Play menu: room list, create room, join private room, card index, leaderboard, ranked. |
| 0:32-0:37 | Create room -> mode picker: ORIGINAL / TEAMS / SCRIMMAGE / FESTIVE (seasonal) / TUTORIAL. Selected row expands to show a one-line description ("Learn to play."). CLOSE / CHOOSE. |
| 0:38-0:41 | Fade to black (loading). |
| 0:42-0:44 | Match intro. Cards deal from the deck one at a time, each flying up to the camera, shown big with name and description, then dropping into the hand. Deck counter ticks down (10 -> 4). |
| 0:44-0:46 | Big title text "DON'T DRAW THE [deadly card]" over the scene. |
| 0:47 | "YOUR TURN" marquee lights up (bulbs around neon text). |
| 0:47-0:51 | Hovering a hand card lifts it and shows a large preview on the right: title (display serif), card, 2-line description. |
| 0:51-0:55 | "See the future" card: top 3 cards fly out of the deck and stand in the air, FINISH button, then fly back. |
| 0:55-1:01 | Drawing: click the deck, card flies to camera, then into hand. Death-chance board updates (25% -> 34%). |
| 1:02-1:04 | Hover the "attack" card: "Skip your turn. A player you choose must take 2 turns." |
| 1:04-1:07 | Targeted card: camera tilts to a top-down view of the table, "Select your opponent." Opponent seat shows a white arrow that turns green on hover. Click -> camera returns, opponent gets a "x2 turns" badge. |
| 1:07-1:18 | Opponent turn: cancel card used, etc. Small "last played" card icon with the player's face floats above the marquee. |
| 1:18-1:19 | You draw the deadly card: card flies up, flips, whole scene floods red, marquee turns red, music cuts. A 3-2-1 count shows on the card. |
| 1:19-1:24 | Rescue window: deck and the deadly card stand side by side, a countdown (8..1) between them. Play the rescue card (drag it onto the deadly card). |
| 1:24-1:30 | Rescue card goes to the discard pile, lighting stays red. |
| 1:31-1:40 | "HIDE THE [deadly card]!" panel: vertical slider TOP OF DECK / SECOND / ... / BOTTOM, numeric position, CONFIRM. Hint: "No one will know where you hide it, put it on top." Card slides back into the deck at that position, lighting returns to normal. |
| 1:41-1:48 | Opponent draws it. Scene goes red, deadly card stands on the discard pile with a countdown. No rescue. |
| 1:46 | Death: the opponent's character is flung off the seat and tumbles past the camera. |
| 1:49-1:50 | A "MISSING!" poster slams in (oversized, then settles with a slight tilt): photo silhouette, name, a joke epithet, "last seen near ...". |
| 1:51-1:54 | Results: card with reward lines counting up one by one (Played match +10, Played cards x4 +40, Cancelled cards +10, Survived +10, ...), challenges panel (daily/weekly progress), END button. Rotating neon ring sign above. |

## Table layout (in-match)

- Camera sits in the player's seat looking across a round felt table to the opponent(s), with a stage behind them.
- Behind the opponent: three framed neon boards: **DEATH CHANCE %** (red), **[DEADLY] LEFT** (yellow), **PLAYERS LEFT** (green). Above them a marquee sign with bulbs reading YOUR TURN (dark when it's not your turn).
- On the table: deck (left of centre) with "N CARDS LEFT" label, discard pile (centre), a brass pocket watch (turn timer) at the near edge, curved arrows printed on the felt showing turn direction.
- Hand: 3D cards fanned at the bottom of the screen, overlapping, tilted. Hover lifts.
- Opponent: seated avatar, name tag above, small hand-count badge beside them, effect badges (e.g. x2 turns).
- Tutorial text: italic, underlined, left side, fades in/out.

## Cards seen in the tutorial (mechanics only)

| Role | Colour | Effect |
|---|---|---|
| Deadly card | red | Drawing it eliminates you unless you play the rescue card. |
| Rescue | green | Saves you when you draw the deadly card; you then hide it back in the deck anywhere. |
| See future | purple | Secretly view the top 3 cards. |
| Cancel (instant, lightning icon) | red | Cancel the effect of a card that was just played. Can be played out of turn. |
| Attack (target icon) | orange | End your turn without drawing; the chosen player must take 2 turns. |
| Skip | lime | End your turn without drawing. |

Card icons: "lightning" corner badge = instant (playable anytime), "target" corner badge = requires choosing a player.
Death chance = deadly cards in deck / cards in deck.

## Visual language

- Warm practical lights (bulbs, lamps, candles) against deep shadow, heavy bloom on light sources, vignette,
  shallow depth of field on menus, slight film softness. Saturated card colours pop against the dark scene.
- Danger state: global red colour grade + darkened scene + desaturated background.
- Menu UI: parchment/wood panels with display serif titles; tickets for room list.
