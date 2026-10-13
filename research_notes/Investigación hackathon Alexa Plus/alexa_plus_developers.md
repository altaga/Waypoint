# Alexa+ Developer Offerings (as of October 2026)

Research date: 2026-10-13. Amazon's developer docs cited below carry "last updated" dates from July to August 2026. Anything dated 2025 is labeled **[2025]**.

## 1. What the Action SDK, Web Action SDK, Multi-Agent SDK and MCP support are, their status, and how to apply

### Takeaway
The three SDKs Amazon announced in February 2025 (Action, Web Action, Multi-Agent) have been replaced in Amazon's current developer materials by the **"Alexa+ for Builders"** add-on platform. It has three paths: the **MCP Toolkit**, the **Category SDK** and the **Smart Home AI Toolkit**. The paths are in **Preview** and limited to **select partners**, with no public application form. The MCP Toolkit is **US-only**.

### Cited Findings
- **[2025]** On Feb 26, 2025 Amazon announced three "AI-native SDKs":
  - **Alexa AI Action SDK**: "reliable real-time API calls."
  - **Alexa AI Web Action SDK**: "self-directed internet navigation to complete tasks on the customer's behalf" through low-code workflows on existing websites, for partners without externalized APIs.
  - **Alexa AI Multi-Agent SDK**: a preview that puts a partner's own agent, with its own personality, alongside Alexa.
  - All three were early access through an "Apply here" form. Launch partners were OpenTable, GrubHub, Yelp, Tripadvisor, Viator and Fodor's. Suno and Wolfram were cited as Multi-Agent examples, and Thumbtack as a Web Action example.
  - [Amazon Dev Blog, Feb 2025](https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2025/02/new-alexa-announce-blog)
- The current "AI-native SDKs for Alexa+" landing page no longer mentions the Action, Web Action or Multi-Agent SDKs. It lists three paths instead: **Category SDK**, **MCP Toolkit** and **Smart Home AI Toolkit**. It says "Alexa+ for Builders is currently available only to select partners working directly with Amazon's team," and it has no sign-up form. — [developer.amazon.com/alexa/ai](https://developer.amazon.com/en-US/alexa/ai)
- On July 23, 2026 Amazon announced that it is "adopting the Model Context Protocol (MCP)." With Alexa+ for Builders, a brand brings its MCP server, and the tool "inspects the server, proposes an integration path, and provides a simulator-ready package." The paths are "currently available in Preview." — [Alexa+ for Builders blog, Jul 23 2026](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences)
- The same July 2026 post lists:
  - **MCP services building "later this year"**: Canva, Cengage, Crystal Dynamics, Headspace, Priceline, Viator, Virgin Atlantic, Weekend, Lyft, Brightline, FlixBus, and Greyhound (via Distribusion).
  - **Amazon Wallet checkout planned "this year"**: Atom Tickets, Cengage, Fandango, Priceline and Taskrabbit.
  - **Smart Home toolkit brands**: Bosch, iRobot, Yale, Whirlpool, TP-Link Tapo, Eufy and others.
  - [Alexa+ for Builders blog](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences)
- The Category SDK targets restaurant reservations, food ordering, home services, local booking, ticketing and ride booking. Its out-of-the-box features include real-time cart updates, interactive seat selection and menu discovery. — [developer.amazon.com/alexa/ai](https://developer.amazon.com/en-US/alexa/ai)
  - The Category-MCP add-on doc currently lists only **`ride_booking`** as a supported category. — [Create a Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)
- One integration reaches Echo, Echo Show, Fire TV, the Alexa app and Alexa.com. Payments go through Amazon Wallet, and discovery happens in the "Alexa+ Store" plus "Natural Discovery" by context and intent. — [developer.amazon.com/alexa/ai](https://developer.amazon.com/en-US/alexa/ai)
- "The MCP Toolkit is available in the United States." — [MCP Toolkit overview (updated Aug 3 2026)](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
- Key doc URLs:
  - [Add-ons home](https://developer.amazon.com/docs/alexaplus/add-ons/home.html)
  - [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
  - [MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)
  - [Category SDK overview](https://developer.amazon.com/docs/alexaplus/add-ons/overview-category-sdk.html)
  - [CX/Design guide](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide.html)
  - [Smart Home custom capabilities](https://developer.amazon.com/docs/alexaplus/smarthome/add-custom-capabilities.html)
  - Developer console: https://developer.amazon.com/alexa/console/ask/addons
- A secondary source (Byteiota, citing unconfirmed leaked "Moonraker" documents) calls the Action SDK GA and the Web Action SDK early access. Amazon has not confirmed this; treat it as unreliable. — [Byteiota](https://byteiota.com/amazon-moonraker-alexa-agentic-developer-guide/)

### Inferences
- "Alexa+ connects to MCP servers" is real and documented as of Jul–Aug 2026. Alexa+ is the MCP **client**, and the partner hosts a remote MCP server wrapped in an "add-on."
- A hackathon team almost certainly cannot ship a live production add-on, because access is select-partner Preview and US-only. The realistic goal is to *imitate* the add-on contract: a remote MCP server over Streamable HTTP, OAuth 2.1 with PKCE, MCP Apps UI, and responses under 500 ms.
- The Multi-Agent SDK (bring your own agent persona) appears to have been de-emphasized in favor of MCP tools, where Alexa keeps the voice and the persona.

### Gaps
- I found no 2026 statement on whether the Action, Web Action or Multi-Agent SDKs were formally retired, merged or are still in early access.
- I found no public waitlist URL for Alexa+ for Builders, and no pricing.

## 2. How third parties expose MCP servers or agents to Alexa+

### Takeaway
You need:
- a **remote MCP server** using **MCP spec 2025-11-25** over **Streamable HTTP** (legacy SSE is not accepted);
- **OAuth 2.1 authorization code + PKCE (S256)** with RFC 9728 Protected Resource Metadata for account linking;
- **under 500 ms round-trip latency**;
- one tool per customer intent, with honest schemas;
- deployment and submission through the `alexa-ai` CLI.

### Cited Findings
- **Architecture.** Alexa+ is the MCP client. You "return standard MCP responses," and Alexa+ handles natural-language understanding, response generation and UI rendering. The components are:
  - MCP Server
  - Alexa+ MCP Add-on (registration and protocol translation)
  - Add-on Registry
  - Alexa+ AI Reasoning
  - Orchestrator

  You can bring an MCP server you already built for other AI hosts. — [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
- **Protocol and transport.**
  - "Alexa+ for Builders supports the 2025-11-25 version of the MCP specification." — [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
  - Streamable HTTP is required. Servers on legacy SSE "must migrate before connecting to Alexa+."
  - The server "must be accessible via a remote URL." During development you can use a tunnel such as cloudflared.
  - [Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)
- **Authentication** (from the Category MCP add-on doc):
  - An unauthenticated request should get a 401 *without* a `WWW-Authenticate` header.
  - Host a Protected Resource Metadata document (RFC 9728).
  - Put auth server metadata at `/.well-known/oauth-authorization-server`.
  - `code_challenge_methods_supported` must include `S256`: "Account linking won't proceed without it."
  - Use the OAuth 2.1 authorization code flow with PKCE, and pass the `resource` parameter set to the server's canonical URI in both the authorization and token requests.
  - Send the Bearer token in the `Authorization` header, never in the query string.
  - **Not supported**: Dynamic Client Registration (DCR), Client ID Metadata Documents (CIMD), OpenID Connect (OIDC), Step-Up Authorization.
  - [Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)
- The Supported Capabilities page lists "Authentication" ("service-level and user-level authentication… using OAuth 2.1") and "Account Linking" ("so Alexa+ can act on their behalf"). It was last updated Jul 10, 2026. — [Supported capabilities](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-supported-capabilities.html)
- **Latency.** "Your MCP server must meet a round-trip query response latency of less than 500 ms." — [Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)
- **Tool design guidelines** (Jul 21, 2026):
  - "Design each tool to represent one meaningful customer intent."
  - The description "states when to call it, why it's used, and what it returns."
  - Avoid overlapping tools, which cause wrong-tool calls or unnecessary parallel calls.
  - "Declare only what you honor."
  - "Treat your schema as a promise the model will hold you to."
  - Keep structuredContent in sync with the declared schema, and don't leave extension fields undeclared.
  - Include no third-party tracking parameters or upstream deep links.
  - "Always return something" and "Always return an error response" when there is no data.
  - Return personalization data such as recent orders and bookings, saved preferences and loyalty points.
  - [Tools, Schema, and Data Design](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-tools-schema-data-design.html)
- **Lifecycle and CLI.**
  - "Alexa+ refreshes tool information only on deployment," so redeploy with `alexa-ai deploy`. After deploy, the add-on is in the development stage.
  - Test in the web simulator or on a device, then run `alexa-ai submit` for certification.
  - Example `addon.json` has `"distributionCountries": ["US"]`.
  - Store listing rules: name of 30 characters or fewer, short description of 123 or fewer, 3–4 example phrases, six icon sizes, and a 600x900 carousel image.
  - [Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)
- There is also an agentic onboarding path, the "add-on Agent Skill," as an alternative to the CLI. — [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
- Supported media codecs:
  - Audio: AAC, MP3, Opus, FLAC and others.
  - Video: H.264, HEVC, AV1, VP9 and others.
  - [Category MCP add-on](https://developer.amazon.com/docs/alexaplus/add-ons/category-sdk-create-mcp-addon.html)

### Inferences
- An "Alexa+-native" hackathon backend should be a Streamable-HTTP MCP server with a few intent-shaped tools, for example `search_hotels`, `get_trip_status` and `book_hotel`. It should return structuredContent plus an optional MCP Apps UI resource, use OAuth 2.1 + PKCE account linking, and respond in under 500 ms.

### Gaps
- I found no explicit figures for maximum payload size, tool count limits or timeouts beyond 500 ms.
- I found no explicit statement on support for MCP resources, prompts, elicitation, sampling or notifications. The overview only says servers can expose "tools, resources, and prompts."

## 3. Visuals on Echo Show (APL, cards, widgets) and multimodal guidance

### Takeaway
For MCP add-ons, Alexa+ visuals come from the **MCP Apps extension** (HTML UI in an Alexa-provided webview) or from Alexa's own **"hydrated" native rendering** of plain data. APL is not mentioned anywhere in the add-on docs.

### Cited Findings
- "Alexa+ also supports the MCP Apps extension, enabling you to render interactive UIs for MCP tools directly in the conversation view." You can onboard existing MCP Apps, which run in an Alexa+-provided webview. Examples given: maps, multi-step flows, games, learning experiences, dashboards. — [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html); MCP Apps spec: https://modelcontextprotocol.io/extensions/apps/overview
- Display modes (Jul 21, 2026):
  - **Inline** is the default. Use it for confirmations, summaries and single-decision flows.
  - **Fullscreen** is "the same experience with more room." Use it for games, maps, dense schedules and multi-step flows.
  - **Hydrated** applies when there is no UI payload: Alexa renders the data natively, through a Solutions Architect.
  - **Voice-only** is the always-on baseline. Data must make sense without visuals, with "no text formatting artifacts such as pipes."
  - Each tool declares whether it supports inline, fullscreen or both. You provide the expand controls.
  - Devices "generally respect modes you specify," and fall back to text when a mode isn't supported.
  - [Display Modes](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-display-modes.html)
- "MCP responses may include a visual and/or a spoken reply… you can't script what Alexa says." Mobile patterns don't translate directly to an Echo Show viewed from across the room. The guide has separate pages for Layout and Rendering, Visual Foundations, Components and Patterns, and Accessibility (touch targets, contrast). — [MCP Design Guide](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide.html)

### Inferences
- The UI should be a large-type, glanceable HTML card, readable at distance on an Echo Show, delivered through MCP Apps. The tool result should still carry clean, speakable data, because Alexa writes the voice reply itself.

### Gaps
- I didn't read the Layout/Rendering, Components and Accessibility pages, so I have no specific pixel sizes, breakpoints or contrast numbers.
- I found no statement on whether APL remains relevant for Alexa+ add-ons.

## 4. Alexa+ design guidelines (conversation, proactivity, memory, multi-turn, routines)

### Takeaway
The add-on CX guide focuses on task completion. Alexa owns the wording and adds context from earlier turns and the customer's preferences. Partners shape the *data*, not the script.

### Cited Findings
- Customers use Alexa+ by voice or touch while multitasking (kitchen, living room, car) and "come to finish a task." Partners "can't script what Alexa says." — [MCP Design Guide](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide.html)
- "Alexa adds its own customer context, including earlier session turns and preferences set with Alexa." Account linking enables richer personalization. — [Tools, Schema, and Data Design](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-tools-schema-data-design.html)
- Testers can "browse options, ask follow-up questions, make changes, approve payment, and complete a transaction in one conversation." — [AltexSoft](https://www.altexsoft.com/travel-industry-news/alexa-plus-starts-with-takeout-but-travel-is-the-bigger-play/)
- Amazon says Alexa+ upgraders set "2X more Routines," customers engage with integrated services "6X more," and Alexa engagement is "up 2–3X." These are vendor claims. — [Alexa+ for Builders blog](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences)

### Inferences
- Multi-turn refinement within one conversation (dates, budget, pets) is the signature Alexa+ pattern, along with confirming before payment and completing the transaction in-session.

### Gaps
- I found no add-on-level documentation on proactive notifications or reminders, developer access to Alexa memory, or how add-ons attach to Routines. The "Conversation Surface" page was not fetched.

## 5. Alexa+ availability by country and language (Oct 2026)

### Takeaway
Alexa+ is consumer-live (mostly early access) in the US, Canada, Mexico (Spanish, Jan 2026), the UK (Mar 2026), Italy (Apr 2026) and reportedly Spain, Germany and Austria, with France announced. The developer **MCP Toolkit is US-only**.

### Cited Findings
- **Mexico** is the first non-English market: Spanish with Mexican idioms, early access in waves starting Jan 22, 2026. It costs MXN 399 per month, free with Prime. Mexico is described as a template for Brazilian Portuguese, Hindi and French. — [About Amazon](https://www.aboutamazon.com/stories/amazon-alexa-plus-AI-culture-language); [TechRadar MX](https://global.techradar.com/es-mx/tech/mexico-se-convierte-en-el-primer-pais-en-recibir-a-alexa-en-espanol-y-esto-es-todo-lo-que-necesitas-saber); [Hipertextual](https://hipertextual.com/tecnologia/alexa-plus-disponible-mexico-caracteristicas-precio-amazon-prime) (features limited at first)
- **UK** early access began Mar 19, 2026, after the US, Canada and Mexico. — [MacRumors](https://www.macrumors.com/roundup/alexa)
- **Italy** early access began Apr 15, 2026. — [pasqualepillitteri.it (secondary)](https://pasqualepillitteri.it/en/news/933/alexa-plus-italy-guide-features)
- **June 2026:** France was announced, Spain, Germany and Austria were listed as live, and 10 more countries are planned for 2027 (Australia among those in 2027). — [EFTM](https://eftm.com/2026/06/alexa-rolls-out-to-more-countries-but-australia-has-to-wait-till-2027-276635). This conflicts with an April source that listed Germany and Spain as "upcoming."
- MCP Toolkit: "available in the United States"; sample `distributionCountries: ["US"]`. — [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)

### Inferences
- A Spanish-language or Mexico-focused hackathon demo is plausible for consumer UX, but a real add-on could not be distributed in MX today.

### Gaps
- I found no official Amazon country list. Exact GA vs. early-access status per country is unverified.

## 6. Classic custom skills (ASK) and Alexa+

### Takeaway
**[2025]** Classic skills keep running on original Alexa. On Alexa+, only skills Amazon selects by usage, or that developers request through a form, are directly invokable. I found no migration path from skill to add-on.

### Cited Findings
- **[2025]** Existing skills "will remain available to customers using the original Alexa experience." Developers can keep building skills there. To be considered for direct invocation on Alexa+, they must submit a form. New tools will focus on Alexa+. — [Amazon Dev Blog Feb 2025](https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2025/02/new-alexa-announce-blog)
- **[2025]**
  - Amazon said "the vast majority" of skills customers use would be supported, chosen by usage.
  - Users reported "isn't supported in Alexa+ yet" errors.
  - At the time, Amazon had published no detailed migration guidelines.
  - [Lowpass](https://www.lowpass.cc/p/amazon-alex-plus-skills-missing-voice-developer-worries); [Thurrott](https://www.thurrott.com/?p=319167)
- The 2026 add-on docs and the July 2026 blog treat ASK as a separate product and describe no skill-to-add-on migration. — [Alexa+ for Builders blog](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences)

### Gaps
- I found no 2026 official guidance on porting a custom skill to an MCP add-on.

## 7. Public partner demos (OpenTable, Uber, Ticketmaster, Expedia, travel)

### Takeaway
Travel on Alexa+ means conversational, multi-turn search with refinement ending in an in-conversation booking. Expedia hotels and Priceline, Viator, Virgin Atlantic, Lyft, FlixBus and Greyhound were announced for 2026.

### Cited Findings
- **Expedia** will "find, suggest, compare, book, and manage hotel bookings globally," with "all coming to Alexa+ in 2026." Example utterances:
  - "Alexa, I'll be in Rome in two months. What are some boutique hotels downtown for under $200 per night?"
  - "Can you find me some pet-friendly hotels for a weekend in Chicago?"
- **Yelp, Angi and Square** (home services and salons) use the same flow: compare by price, reviews and availability, then book or reschedule against the user's calendar.
- [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations)
- Expedia's inventory is reported at more than 700,000 properties, with refinements for dates, budget and pet-friendly stays. — [Travolution](https://www.travolution.com/news/technology/amazon-expands-alexa-with-four-partners-including-expedia/); [AltexSoft](https://www.altexsoft.com/travel-industry-news/amazon-brings-travel-booking-to-alexa-with-expedias-inventory/)
- **[2025]** At launch, the partners included Uber rides, OpenTable reservations and Tripadvisor, and Alexa+ could plan travel. — [Skift Feb 2025](https://skift.com/2025/02/26/amazon-alexas-ai-upgrade-book-uber-rides-and-plan-travel/)
- **2026 MCP travel partners** (Priceline, Viator, Virgin Atlantic, Lyft, Brightline, FlixBus, Greyhound) are building "later this year." Priceline is also on the Amazon Wallet checkout list. — [Alexa+ for Builders blog](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences)

### Inferences
- A hackathon travel entry should copy this pattern: natural-language trip context → refined options shown on screen with a spoken summary → follow-ups → confirm → book or pay (Wallet-style) → manage the booking later.

### Gaps
- I found no hands-on video teardown confirming the Expedia integration is live as of Oct 2026. I also found no Ticketmaster-specific Alexa+ demo; Atom Tickets and Fandango appear instead.
