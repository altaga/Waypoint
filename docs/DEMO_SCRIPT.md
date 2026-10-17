# Demo script (under 3 minutes, English)

Target: 2 min 45 s. No music, no third-party logos. The presenter's voice for the lines; Waypoint's own (Amazon Polly) for its replies.

| Time | Scene | What the viewer sees | Line |
|---|---|---|---|
| 0:00–0:12 | Hook | Title card: "Three friends, three passports, one trip." | "Who needs a visa? What's the weather? What can't you bring?" |
| 0:12–0:28 | The group | Simulated Echo Show. Click **Demo group**: Ana (Mexico), Sam (United States), Priya (India) | "Waypoint takes the whole group, not one traveler." |
| 0:28–0:55 | The trip | Say: "We're going to Japan from December 3 to 10." The hero opens: the globe turns to Japan and three routes rise from Mexico, the US and India; the climate chip reads 11° / 3°; the ring shows how ready the group is | "Each traveler gets their own entry answer. Priya needs an e-visa; Ana and Sam don't." |
| 0:55–1:35 | Autopilot | Tap **Get me ready**. The mission card runs live: the profile, then entry, rules, climate, essentials and places at once, then the verified day plan and the packing list (with a coat), then readiness. The ring rises. Waypoint says the summary | "One sentence. Nine real MCP tool calls, five in parallel, each with its time and its source. The day plan is checked by a verifier before it is saved." |
| 1:35–1:55 | Rules with citations | Say: "What can't I bring?" The card lists Japan's rules with severity and source | "Every rule has a verbatim quote and an official source. If there is no verified rule, Waypoint says so." |
| 1:55–2:15 | The concierge | Say: "How much are 20,000 pesos there, and what should I pack?" The trace shows several tools in one turn | "On Amazon Bedrock, the concierge chains tools in a single turn and answers in a few spoken sentences." |
| 2:15–2:30 | Memory | Click **New session**, then say: "What's left for my trip?" | "The trip survives the session. This is a second conversation, not a fresh start." |
| 2:30–2:42 | Under the hood | Click **View panel** (the MCP App), then open the protocol log: `initialize`, `tools/list`, `tools/call` | "Real MCP 2025-11-25 over Streamable HTTP, with output schemas, annotations and an MCP App, on AWS Lambda." |
| 2:42–2:55 | Impact and open source | `oss/travel-entry-packs` on screen | "The packs are open source. Rules change; verify with the official source before you travel." |

## Before recording

1. `npm ci && npm start`, then open `http://127.0.0.1:3000` (or the deployed URL, for the Bedrock concierge and the Polly voice).
2. Run `npm run smoke:web` once to confirm the path works.
3. Log the shared dinner so the group money has something to show: "Gasté 900 pesos de la cena, pagó Ana."
4. Open **View panel** before **New session**. After a new session the button comes back only when a tool shows the panel again.
5. Keep **Read aloud** on.
6. Record at 1440 × 900 or larger; the autopilot card scrolls into view by itself.

## Known gaps to avoid showing

- The climate is the usual weather for the dates (NASA POWER normals), not a forecast: do not call it a forecast.
- Do not claim the rules are reviewed: tier B packs are machine-extracted.
- Payment methods cover 197 countries in `data/world/payments.json`, compiled from the TravelPay payment database. 49 are official (each with its source and date). The other 148 come from travel guides and traveler reports, and the agent says they are not officially confirmed. Do not present the 148 as official, and do not claim crypto is accepted anywhere. A country with no entry gets "no data", never a guess.
