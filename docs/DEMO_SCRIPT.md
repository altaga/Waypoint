# Demo script (under 3 minutes, English)

Target: 2 min 45 s (165 s planned). No music, no third-party logos. The presenter narrates the lines. Waypoint's own replies are not spoken in this take (Read aloud is off), which keeps the timing.

## What the rules ask for the video

Source: the official Rules and FAQ of the hackathon, and the organizer's forum post 45058 (read 2026-10-18).

- The simulated Alexa+ experience is an accepted entry. A web page that acts as a real MCP client (`initialize`, `tools/list`, `tools/call` over Streamable HTTP) satisfies the requirement.
- The video must be under three minutes, in English, uploaded publicly to YouTube or Vimeo, and linked on the submission form.
- The video must clearly show the simulated experience working. The simulation is labelled "simulated Alexa+ host" on screen, and the presenter says so once.
- Voice input and output are not required (forum post 45058). This take does not use them.

## Scenes

| Time | Scene | What the viewer sees | Line |
|---|---|---|---|
| 0:00–0:10 | Title | Title card: "Three friends, three passports, one trip." | "Who needs a visa? What can't you bring?" |
| 0:10–0:25 | The group | The simulated Alexa+ host (Echo Show view, "simulated Alexa+ host" label). Click **EN**, then **Example group**: Ana (Mexico), Sam (United States), Priya (India) | "Waypoint takes the whole group. Each traveler carries their own passport." |
| 0:25–1:01 | Autopilot and panel | Type "Get me ready for Japan, December 3 to 10". The trip is created, then the mission card runs nine real tool calls in phases, each step with its time and its source. Then press **View panel** | "I type one dated sentence. It runs a fixed nine-step sequence, then I open the panel." |
| 1:01–1:15 | Entry per passport | Type "Do we need a visa for Japan?" Ana and Sam: no visa for stays up to 90 days. Priya: e-visa required. The source line names the passport matrix | "Ana and Sam need no visa for stays up to 90 days. Priya needs an e-visa before she travels." |
| 1:15–1:33 | Rules with citations | Type "What can't I bring?" Two Japan rules, each with severity. The card says "compiled by us, not yet reviewed by a person" | "Each rule is checked against its quoted source before Waypoint serves it. This pack has not been reviewed by a person yet." |
| 1:33–1:51 | Group money | Type "I spent 900 pesos on dinner, paid by Ana." Open **Group money**: Ana +600.00 MXN, Sam −300.00 MXN, Priya −300.00 MXN | "Sam and Priya each square up with Ana, to the cent." |
| 1:51–2:05 | Protocol | Open "For developers: MCP protocol log": `initialize`, `tools/list`, `tools/call` | "Real MCP, protocol 2025-11-25, over Streamable HTTP. Twenty-four tools, and these are the actual requests." |
| 2:05–2:21 | New session | Click **New session**, then type "What's left for my trip?" The same trip, travelers and open tasks return | "New session. Same trip, same travelers, same open tasks. Nothing re-entered." |
| 2:21–2:45 | Close | The schema section of `docs/OPEN_SOURCE.md` on screen, then the MIT license. Do not open `oss/` examples: they do not match the Japan pack the app serves | "The pack format is MIT licensed. The same MCP server also backs a classic Alexa skill. This video shows the simulated Alexa+ experience." |

## Before recording

1. Run the app locally with the deterministic router: `WAYPOINT_OFFLINE=1 npm start`, with `WAYPOINT_BRAIN` unset. Open `http://127.0.0.1:3000` at 1440 × 900 or larger. On the deployed site, typed sentences that are not Autopilot phrases go to Bedrock first, and those answers are not verified, so the take is not recorded there.
2. Use a fresh browser profile, so the viewer has no earlier trip. Confirm that "What's left for my trip?" shows no trip before scene 1.
3. Keep **Read aloud** off for the take.
4. Open the protocol details (the mode line "Assistant: local router, no AWS needed." is inside them).
5. Confirm **View panel** is visible after the Autopilot without scrolling. If it is not, scroll up first.
6. Run `npm run smoke:web` once, and rehearse each typed sentence before the take.
7. Measure the readiness figure on the take and use the number on screen. The 27% and 36% figures are formula values, not measured.

## Known gaps to avoid showing

- The climate is the usual weather for the dates (NASA POWER normals), not a forecast. The app says "usual weather for those dates"; do not call it a forecast.
- Do not claim the rules are reviewed: the Japan pack is curated, and the card says no person has reviewed it.
- Payment methods are not in this video. 18 of 197 countries are official; 179 are reported and the app says so. The English card currently shows Spanish text. Do not claim crypto is accepted anywhere.
- The Bedrock concierge is not in this video. Its answers are not verified by an offline test, and the browser's router cannot read "20,000 pesos" (it reads 20).
- The Alexa skill is not run on a device. Do not say Alexa+ invokes Waypoint; the host is simulated.
- A country with no entry gets "no data", never a guess.
