# Demo script (under 3 minutes, English)

Target: 2 min 40 s. No music, no third-party logos. The voice is the presenter's own.

| Time | Scene | What the viewer sees | Line |
|---|---|---|---|
| 0:00–0:15 | Hook | Title card: "Three friends, three passports, one trip." | "Who needs a visa? Can you bring your vape? Your cold medicine?" |
| 0:15–0:50 | Group onboarding | Simulated Echo Show. Click **Demo group**; the traveler cards appear (MX, US, IN) | "Waypoint takes the whole group, not one traveler." |
| 0:50–1:20 | Mixed-passport readiness | Say: "Trip to Vietnam, December 3 to 10." The MCP App dashboard fills in: a traffic light per traveler | "Each traveler gets their own entry answer, using their best passport." |
| 1:20–1:45 | Local rules with citations | Say: "Can I bring vapes to Singapore?" The card shows the vape rule with its source | "Every rule has a verbatim quote and a source. If there is no verified rule, Waypoint says so." |
| 1:45–2:05 | Elicitation | Clear a passport and ask for a new traveler. A form appears; answer it by voice or typing | "When something is missing, Waypoint asks for exactly that." |
| 2:05–2:25 | Memory across sessions | Click **New session**, then say: "What's left for my trip?" | "The trip survives the session. This is a second Alexa+ conversation, not a fresh start." |
| 2:25–2:45 | Under the hood | Protocol log: `initialize`, `tools/list`, `tools/call`, `elicitation/create` | "Real MCP 2025-11-25 over Streamable HTTP, with output schemas, annotations and an MCP App." |
| 2:45–2:58 | Impact and open source | `oss/travel-entry-packs` on screen | "The packs are open source. Rules change; verify with the official source before you travel." |

## Before recording

1. `npm ci && npm start`, then open `http://127.0.0.1:3000`.
2. Run `npm run smoke:web` once to confirm the path works.
3. Clear the browser's localStorage so the viewer id is fresh.
4. Keep the protocol log open on the right.

## Known gaps to avoid showing

- Do not show the Bedrock brain as working: it has not run against Bedrock.
- Do not show `find_events` or the ES summaries of rules: they are not implemented.
- Do not claim the rules are reviewed: tier B packs are machine-extracted.
