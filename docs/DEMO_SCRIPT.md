# Demo script (under 3 minutes, English)

Target: 2 min 46 s (166 s planned). No music, no third-party logos. The presenter narrates the lines. Waypoint's own replies are not spoken in this take (Read aloud is off), which keeps the timing. `tools/demo-recorder/` has a scripted take of an earlier, shorter cut (nine scenes, about 100 s); this table is the current plan.

## What the rules ask for the video

Source: the official Rules and FAQ of the hackathon, and the organizer's forum post 45058 (read 2026-10-18).

- The simulated Alexa+ experience is an accepted entry. A web page that acts as a real MCP client (`initialize`, `tools/list`, `tools/call` over Streamable HTTP) satisfies the requirement.
- The video must be under three minutes, in English, uploaded publicly to YouTube or Vimeo, and linked on the submission form.
- The video must clearly show the simulated experience working. The simulation is labelled "simulated Alexa+ host" on screen, and the presenter says so once.
- Voice input and output are not required (forum post 45058). This take does not use them.

## Scenes

Eleven beats, 166 s (2:46), which leaves 14 s of margin under the limit. Typed text is exact: the local router reads these phrases.

| Time | Beat | What you type, what the viewer sees |
|---|---|---|
| 0:00–0:09 | Title | Title card: "Three friends, three passports, one trip." |
| 0:09–0:27 | Passports | Click **EN**. Type "Add Ana, Mexican passport", then "Add Sam, American passport", then "Add Priya, Indian passport". The profile card grows to three travelers with their countries |
| 0:27–0:57 | Autopilot and panel | Type "Get me ready for Japan, December 3 to 10". The trip is created, then nine real tool calls run in phases, each with its time and its source. Press **View panel**: the MCP app with the globe and the three routes |
| 0:57–1:08 | Entry per passport | Press **Close panel**. Type "Do we need a visa for Japan?" Ana and Sam: no visa up to 90 days. Priya: e-visa |
| 1:08–1:19 | Rules | Type "What can't I bring?" Two rules with severity. The footer says compiled by us, not yet reviewed by a person |
| 1:19–1:37 | Payments | Type "How do I pay in Japan?" (cash, cards, QR apps, ATMs; official sources with date). Then "Can I pay with crypto in Japan?" |
| 1:37–1:51 | Apps and metro | Type "Can I use Uber in Japan?" (only the apps that work: on the company's list, or reported by the press and marked not confirmed). Then "How does the metro work in Tokyo?" (bank cards only partly; Suica and PASMO) |
| 1:51–2:02 | Day plan | Type "Plan my days: food and temples". Three day cards, Tokyo and Kyoto |
| 2:02–2:16 | Group money | Type "How much is 20,000 pesos there?" Then "I spent 900 pesos on dinner, paid by Ana", and press **Group money**: Ana +600.00, Sam −300.00, Priya −300.00 MXN |
| 2:16–2:26 | Protocol | Open "For developers: MCP protocol log": `initialize`, `tools/list`, `tools/call` |
| 2:26–2:46 | Memory and close | Click **New session**, then type "What's left for my trip?" The same trip, travelers and open tasks return |

The words to say for each beat are in `docs/DEMO_NARRATION.md`.

If a beat must go, drop **Apps and metro** or **Day plan**, never the Autopilot.

## Before recording

1. Run the app locally with the deterministic router: `WAYPOINT_OFFLINE=1 npm start`, with `WAYPOINT_BRAIN` unset. Open `http://127.0.0.1:3000` at 1440 × 900 or larger. On the deployed site, typed sentences that are not Autopilot phrases go to Bedrock first, and those answers are not verified, so the take is not recorded there.
2. Start with no earlier trip or passports: click **Reset my data** twice (the first click asks for another one), or use a fresh browser profile. Type "What's left for my trip?" once to confirm it says there is no trip. **New session** does not erase anything; it is the beat at the end.
3. Keep **Read aloud** off for the take.
4. Open the protocol details before the beat (the mode line "Assistant: local router, no AWS needed." is inside them).
5. The device screen has a fixed size (Echo Show 16:10, phone 9:19.5) and scrolls inside. After each answer, scroll inside the screen if the card is cut off; the page itself does not need to move. Press **View panel** and **Close panel** from the hero buttons at the top of the screen.
6. Rehearse each typed sentence once. The offline router reads exactly the phrases in the table; other wordings may not be understood.
7. Measure the readiness figure on the take and use the number on screen. The 36% in the table is what the example trip showed on 2026-10-18, not a promise.

## What the app does not do, so do not show or say it

- Keep the **Logos** switch off for the take. The hackathon rules say the video must not include third-party trademarks without permission; with the switch off, the cards show flat icons and the names only. Do not use screenshots with logos on in the submission images either.

- The passport form that the server can request (MCP elicitation) does not appear over the web host's stateless HTTP connection. Registering a traveler without a passport answers "I still need the passport for Sam", and you give it with "Sam's passport is American". Do not say the form appears.
- The climate is the usual weather for the dates (NASA POWER normals), not a forecast. Say "usual weather".
- Do not claim the rules are reviewed: the Japan pack is curated, and the card says no person has reviewed it.
- Payments: 18 of 197 countries have official sources (Japan is one), 179 are reported by guides and travelers and are labelled so. English text exists for the 18 official countries; for the others the English answer says the detail is written in Spanish. Never claim crypto is accepted anywhere.
- Apps: the card shows only the apps that work there, as each company lists them or as the press reports them (marked not confirmed). "On the company's list" is not a promise that it works in every city. The others are one count in the subtitle.
- The Bedrock concierge is not in this video. Its answers are not verified by an offline test.
- The Alexa skill is not run on a device. Do not say Alexa+ invokes Waypoint; the host is simulated.
- There is no purchasing flow.
- A country with no entry gets "no data", never a guess.
