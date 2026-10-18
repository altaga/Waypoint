# Demo script (under 3 minutes, English)

Target: 2 min 45 s (165 s planned). No music, no third-party logos. The presenter narrates the lines. Waypoint's own replies are not spoken in this take (Read aloud is off), which keeps the timing. `tools/demo-recorder/` has a scripted take of an earlier, shorter cut (nine scenes, about 100 s); this table is the current plan.

## What the rules ask for the video

Source: the official Rules and FAQ of the hackathon, and the organizer's forum post 45058 (read 2026-10-18).

- The simulated Alexa+ experience is an accepted entry. A web page that acts as a real MCP client (`initialize`, `tools/list`, `tools/call` over Streamable HTTP) satisfies the requirement.
- The video must be under three minutes, in English, uploaded publicly to YouTube or Vimeo, and linked on the submission form.
- The video must clearly show the simulated experience working. The simulation is labelled "simulated Alexa+ host" on screen, and the presenter says so once.
- Voice input and output are not required (forum post 45058). This take does not use them.

## Scenes

Eleven beats, 165 s (2:45), which leaves 15 s of margin under the limit. Typed text is exact: the local router reads these phrases.

| Time | Beat | What you type, what the viewer sees | Line |
|---|---|---|---|
| 0:00–0:08 | Title | Title card: "Three friends, three passports, one trip." | "Who needs a visa? What can't you bring? How do you pay? Waypoint answers, with a source for every line." |
| 0:08–0:28 | Passports | Click **EN**. Type "Add Ana, Mexican passport", then "Add Sam, American passport", then "Add Priya, Indian passport". The profile card grows to three travelers with their countries | "This is a simulated Alexa+ host. I register the group by talking to it. Each traveler carries their own passport." |
| 0:28–0:58 | Autopilot and panel | Type "Get me ready for Japan, December 3 to 10". The trip is created, then nine real tool calls run in phases, each with its time and its source. Press **View panel**: the MCP app with the globe and the three routes | "One sentence. Waypoint creates the trip and runs nine real tool calls across services, and every step names its source. Then it opens its own panel, an MCP app." |
| 0:58–1:09 | Entry per passport | Press **Close panel**. Type "Do we need a visa for Japan?" Ana and Sam: no visa up to 90 days. Priya: e-visa | "Ana and Sam need no visa. Priya needs an e-visa before she travels." |
| 1:09–1:21 | Rules | Type "What can't I bring?" Two rules with severity. The footer says compiled by us, not yet reviewed by a person | "Each rule is checked against its quoted source before it is served. This pack has not been reviewed by a person yet, and Waypoint says so." |
| 1:21–1:41 | Payments | Type "How do I pay in Japan?" (cash, cards, QR apps, ATMs, official sources with date). Then "Can I pay with crypto in Japan?" | "How do you pay? Cash still matters, cards work in cities, PayPay and LINE Pay are the QR apps. And crypto? No official source says, so Waypoint says exactly that." |
| 1:41–1:54 | Apps | Type "Can I use Uber in Japan?" Three tiers: on the company's list (Uber), reported by press (DiDi, Mercari), no verified data (Rappi) | "Which apps work? It separates what the company lists itself, what the press reports, and what nobody has verified." |
| 1:54–2:06 | Day plan | Type "Plan my days: food and temples". Three day cards, Tokyo and Kyoto, real places | "A day plan from real places. The verifier rejects invented stops, wrong country and overloaded days." |
| 2:06–2:20 | Group money | Type "How much is 20,000 pesos there?" (about 172,900 yen, with a purchasing-power line). Then "I spent 900 pesos on dinner, paid by Ana", and press **Group money**: Ana +600.00, Sam −300.00, Priya −300.00 MXN | "Budget in yen, adjusted for local prices. And the group's dinner: Sam and Priya each square up with Ana, to the cent." |
| 2:20–2:30 | Protocol | Open "For developers: MCP protocol log": `initialize`, `tools/list`, `tools/call` | "Real MCP over Streamable HTTP, protocol 2025-11-25. Twenty-four tools, and these are the actual requests." |
| 2:30–2:45 | Memory | Click **New session**, then type "What's left for my trip?" The same trip, travelers and open tasks return | "New session. Same trip, same travelers, same open tasks. Nothing re-entered. One server, behind this host and behind a classic Alexa skill." |

If a beat must go, drop **Apps** or **Day plan**, never the Autopilot.

## Before recording

1. Run the app locally with the deterministic router: `WAYPOINT_OFFLINE=1 npm start`, with `WAYPOINT_BRAIN` unset. Open `http://127.0.0.1:3000` at 1440 × 900 or larger. On the deployed site, typed sentences that are not Autopilot phrases go to Bedrock first, and those answers are not verified, so the take is not recorded there.
2. Use a fresh browser profile, so the viewer has no earlier trip or passports. Type "What's left for my trip?" once to confirm it says there is no trip, then click **New session**.
3. Keep **Read aloud** off for the take.
4. Open the protocol details before the beat (the mode line "Assistant: local router, no AWS needed." is inside them).
5. After each answer, scroll so the card is below the sticky header. Press **View panel** and **Close panel** with the page scrolled to the buttons.
6. Rehearse each typed sentence once. The offline router reads exactly the phrases in the table; other wordings may not be understood.
7. Measure the readiness figure on the take and use the number on screen. The 36% in the table is what the example trip showed on 2026-10-18, not a promise.

## What the app does not do, so do not show or say it

- The passport form that the server can request (MCP elicitation) does not appear over the web host's stateless HTTP connection. Registering a traveler without a passport answers "I still need the passport for Sam", and you give it with "Sam's passport is American". Do not say the form appears.
- The climate is the usual weather for the dates (NASA POWER normals), not a forecast. Say "usual weather".
- Do not claim the rules are reviewed: the Japan pack is curated, and the card says no person has reviewed it.
- Payments: 18 of 197 countries have official sources (Japan is one), 179 are reported by guides and travelers and are labelled so. English text exists for the 18 official countries; for the others the English answer says the detail is written in Spanish. Never claim crypto is accepted anywhere.
- Apps: the card says what each company lists itself. "On the company's list" is not a promise that it works in every city.
- The Bedrock concierge is not in this video. Its answers are not verified by an offline test.
- The Alexa skill is not run on a device. Do not say Alexa+ invokes Waypoint; the host is simulated.
- There is no purchasing flow.
- A country with no entry gets "no data", never a guess.
