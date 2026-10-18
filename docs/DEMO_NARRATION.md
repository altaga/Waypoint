# Demo narration and project context

Text only. Read it as written, at an easy pace (about 2.5 words a second). Total about 410 words, 2:46 with the typing and the pauses on screen. The beats and the exact sentences to type are in `docs/DEMO_SCRIPT.md`.

## What Waypoint is today

Waypoint is a travel-readiness assistant for Amazon Alexa+, built as a self-hosted MCP server. A traveler (or a group, each person with their own passport) says where and when they are going, and Waypoint answers what a trip needs before departure: whether each passport needs a visa, what is illegal to bring, how to pay, which ride and shopping apps work, which card opens the metro, the usual weather, a packing list, a day plan from real places, and who owes whom in the group. Every answer says who published it, when it was checked, and how sure it is. Where nothing official exists it says "no verified data" and does not guess.

- **MCP server:** TypeScript on Node 22, MCP spec 2025-11-25, Streamable HTTP at `/mcp`, stateless, 24 tools with output schemas and annotations, one MCP App (the trip panel). MIT license, 406 offline tests, CI on every push.
- **Simulated Alexa+ host:** a web page that acts as a real MCP client (`initialize`, `tools/list`, `tools/call`), with an Echo Show screen, a phone layout, English and Spanish, and a protocol log. It is labelled as simulated and is not affiliated with Amazon.
- **Autopilot:** one sentence creates the trip and runs nine real tool calls (profile, entry, local rules, climate, essentials, places, day plan, packing, readiness), each with its time and source. The day plan goes through a rule-based verifier before it is saved.
- **Data, with its honesty labels:** passport matrix for entry rules; 13 curated country packs whose rules are checked word for word against the quoted official source (compiled by us, not yet reviewed by a person); payment methods for 197 countries, 18 of them from official sources and the rest labelled as reported by guides and travelers; ride, delivery and shopping apps that work in the country, from each company's own list or reported by the press and marked as not confirmed (an app with no data is never called unavailable); 13 metro systems and whether a bank card opens the gates; the usual weather from NASA POWER; real places from Wikidata and Wikipedia.
- **Memory:** the trip, the travelers and the open tasks survive a new session (DynamoDB when deployed, a file locally).
- **AWS:** Lambda with a function URL, DynamoDB, an optional Bedrock concierge (Strands) and Polly for the voice. The same server backs a classic Alexa custom skill, checked against the Alexa Skill Simulation API.
- **Not done, and said so:** the Alexa skill is not run on a device; the Japan pack and the highlights are not reviewed by a person; there is no purchasing flow; payment text in English exists for the 18 official countries only.

## Narration

**1 · Title, 0:00–0:09**
Who needs a visa? What can't you bring? How do you pay? Three friends, three passports, one trip. This is Waypoint.

**2 · Passports, 0:09–0:27**
This is a simulated Alexa+ host. Waypoint is a self-hosted MCP server, and this page is a real MCP client. I tell it who is traveling, one person at a time, with their passport. Ana, Mexican. Sam, American. Priya, Indian. Each traveler keeps their own passport.

**3 · Autopilot and panel, 0:27–0:57**
Now one sentence: get me ready for Japan, December third to tenth. Waypoint creates the trip, then runs nine real tool calls: the group, entry rules, local laws, climate, essentials, real places, a day plan and a packing list. Every step shows its tool, its time, and the publisher behind the answer. It even checks its own plan before saving it. Then it opens its own panel, an MCP app, with the group's routes on the globe.

**4 · Entry per passport, 0:57–1:08**
Do we need a visa? Ana and Sam, no visa for up to ninety days. Priya needs an e-visa before she travels. Three passports, three answers, one question.

**5 · Rules, 1:08–1:19**
What can't I bring? Each rule is checked against its quoted official source before it is served. And the card says it plainly: compiled by us, not yet reviewed by a person.

**6 · Payments, 1:19–1:37**
How do I pay in Japan? Cash still matters, cards work in cities, and PayPay and LINE Pay are the QR apps, from official sources, with the date. And crypto? No official source says, so Waypoint says exactly that. Where it only has guides and traveler reports, it labels them as not official.

**7 · Apps and metro, 1:37–1:51**
Which apps will work? Only the ones that do: apps on the company's own list, and apps the press reports, marked as not confirmed. Where there is no data, it never says an app is unavailable. And the metro: bank cards work only partly in Tokyo, and the cards to look for are Suica and PASMO.

**8 · Day plan, 1:51–2:02**
A day plan from real places. A verifier checks it by rule, so invented stops, the wrong country and overloaded days are rejected.

**9 · Group money, 2:02–2:16**
How far is twenty thousand pesos? About [read the yen figure on screen], adjusted for local prices. And the group dinner: nine hundred pesos, paid by Ana. Sam and Priya each square up with Ana, to the cent.

**10 · Protocol, 2:16–2:26**
Under the hood, real MCP over Streamable HTTP, protocol 2025-11-25. Twenty-four tools, and these are the actual requests.

**11 · Memory and close, 2:26–2:46**
New session. Same trip, same travelers, same open tasks, nothing re-entered. One MCP server on AWS, behind this host and behind a classic Alexa skill, open source under the MIT license. That's Waypoint.

## Delivery notes

- Say "simulated" once, in beat 2. Do not say that Alexa+ calls Waypoint.
- Say "usual weather", never "forecast". Do not say the rules are reviewed.
- In beat 9 read the yen figure that is on screen; it moves with the exchange rate.
- The Logos switch stays off for the take: the video rules do not allow third-party trademarks without permission.
- If the take runs over 2:55, drop beat 7 or beat 8, never beat 3.
