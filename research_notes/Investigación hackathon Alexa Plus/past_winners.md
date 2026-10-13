# Past Amazon Alexa and AWS Hackathon Winners (2019–2026): What Judges Rewarded

Method note: Devpost blocks WebFetch (HTTP 403), so the data below comes from curl requests to the Devpost public API (`devpost.com/api/hackathons?search=...`), to the gallery pages (`<slug>.devpost.com/project-gallery`, where winners are listed first) and to each winning project page (prize label, "Built With" tags, video embed, links, description). I read all of these directly. YouTube would not return video durations to curl, so video lengths are listed as a gap.

## 1. Which Alexa / AWS / Nova / Kiro hackathons exist and who won?

### Takeaway
Since 2024 the big Amazon hackathons on Devpost have been about agents. They require the sponsor's newest stack (AgentCore, Strands, Nova Act or Sonic, Kiro). The Alexa Skills Challenges ran from 2017 to 2022, and the last one was "Aging & Engaging" (2022). The hackathon now open is "Build, Ship, Shape: Amazon Developer Hackathon" (amazonappdev2026). Its submission period is Aug 31 to Oct 23, 2026, it has 54,188 registrants, and it has an Alexa+ track.

### Cited Findings
**Amazon/AWS hackathons on Devpost found through the API (title, dates, registrants)** — [Devpost API search](https://devpost.com/api/hackathons?search=amazon&status[]=ended&per_page=40)
- Build, Ship, Shape: Amazon Developer Hackathon. Aug 31 to Oct 23, 2026. 54,188 registrants. Tracks: Fire TV, Alexa+, Bee, Ring, plus AWS Builder and Open Source mini-challenges — [amazonappdev2026.devpost.com](https://amazonappdev2026.devpost.com/), [rules](https://amazonappdev2026.devpost.com/rules)
- Agents for Humans Hackathon (AWS, Strands Agents SDK). Aug 10 to Sep 14, 2026. $40k. 9,923 participants. Winners due Oct 14, 2026 and not yet announced — [agentsforhumans.devpost.com](https://agentsforhumans.devpost.com/)
- Amazon Nova AI Hackathon. Feb 2 to Mar 16, 2026. $40k. 13,412 registrants. Winners announced — [amazon-nova.devpost.com](https://amazon-nova.devpost.com/)
- H0: Hack the Zero Stack with Vercel v0 and AWS Databases. May 27 to Jun 29, 2026. $80k. 9,723 registrants — [h01.devpost.com](https://h01.devpost.com/)
- AWS AI Agent Global Hackathon. Sep 8 to Oct 22, 2025. $45k. 9,465 registrants — [aws-agent-hackathon.devpost.com](https://aws-agent-hackathon.devpost.com/)
- Code with Kiro Hackathon. Jul to Sep 2025. 9,942 registrants — [kiro.devpost.com](https://kiro.devpost.com/). Kiroween. Oct to Dec 2025. 4,967 registrants — [kiroween-2025.devpost.com](https://kiroween-2025.devpost.com/)
- Agentic AI Unleashed: AWS & NVIDIA. Oct to Nov 2025 — [nvidia-aws.devpost.com](https://nvidia-aws.devpost.com/). AWS Lambda Hackathon. Jun 2025 — [awslambdahackathon.devpost.com](https://awslambdahackathon.devpost.com/). PartyRock Generative AI Hackathon. Jan to Mar 2024. 7,565 registrants — [awspartyrockhackathon.devpost.com](https://awspartyrockhackathon.devpost.com/). MCP-AWS Enterprise Agents Challenge (one-day, Jul 25, 2025) — [link](https://mcp-aws-enterprise-agents.devpost.com/). AWS MCP Agents Hackathon (May 30, 2025) — [link](https://aws-mcp-agents-hackathon.devpost.com/)
- Alexa Skills Challenges: In-Skill Purchasing (Sep to Nov 2019, $134k), Alexa Conversations (Jul to Sep 2020, $101k), Beyond Voice (Sep to Nov 2020, $97k), Aging & Engaging (Aug to Sep 2022, $45k). Earlier ones: Multimodal (2018–19, $150k), Kids, Life Hacks, Tech for Good, the original 2017 challenge — [Devpost API search "alexa"](https://devpost.com/api/hackathons?search=alexa&status[]=ended&per_page=40)

**AWS AI Agent Global Hackathon 2025 winners**, with the prize label taken from each project page
- 1st Place: **EcoLafaek**. A citizen waste-reporting agent for Dili, Timor-Leste. Built with AgentCore, Nova Pro, Titan Embed Image, S3, Lightsail, Kiro, a Flutter mobile app and a Next.js dashboard. It has a live site, a docs site and a GitHub repo. The write-up opens with a personal "as a young person living in Timor-Leste" story and cites JICA data: 300 t of waste a day, 100 t uncollected — [devpost.com/software/ecolafaek](https://devpost.com/software/ecolafaek)
- 2nd Place: **AegisAgent**. Explainable multi-agent insurance-claim review: evidence curation, policy interpretation and compliance reasoning. Built with Bedrock, Nova Pro, Titan, App Runner, ECR and Docker, and "fully developed by Kiro". Has a deployed URL — [devpost.com/software/aegisagent-an-insurance-claim-app-fully-developed-by-kiro](https://devpost.com/software/aegisagent-an-insurance-claim-app-fully-developed-by-kiro)
- 3rd Place: **Province**. A conversational tax-filing agent that extracts W2 and 1099 data, auto-fills Form 1040 and explains the calculations. Built with AgentCore, Bedrock, Strands, Lambda, DynamoDB and S3. Has a live site — [devpost.com/software/province](https://devpost.com/software/province)
- Best Amazon Bedrock Application: **Oratio**. A platform for building and deploying voice agents with Nova Sonic, AgentCore and Strands, plus LangGraph, DSPy and ECS. Has GitHub and a CloudFront demo — [devpost.com/software/oratio-merd5o](https://devpost.com/software/oratio-merd5o)
- Best Amazon Bedrock AgentCore Implementation: **AI-driven multi-agent fraud alert triage**. Built with AgentCore, LangGraph, Lambda, API Gateway, Athena and S3. Video on Vimeo — [devpost.com/software/ai-driven-multi-agent-fraud-alert-triage-system](https://devpost.com/software/ai-driven-multi-agent-fraud-alert-triage-system)
- Best Amazon Q Application: **Compliance Guardian AI** — [devpost.com/software/compliance-guardian-ai-system](https://devpost.com/software/compliance-guardian-ai-system)
- Best Amazon Nova Act Integration: **Drishti AI Navigator**. Voice-driven web navigation for accessibility, built on AgentCore, Nova and Sonic — [devpost.com/software/drishti-ai-navigator](https://devpost.com/software/drishti-ai-navigator)
- Best Strands SDK Implementation: **AgentShell**. It uses MCP as a "body interface" so that one cloud agent can control PTZ cameras (vision through Nova, voice through Polly and Transcribe, movement through ONVIF). An **Alexa trigger** starts the loop: "Alexa trigger → camera selection → conversation loop". The page includes an architecture diagram — [devpost.com/software/agent-shell](https://devpost.com/software/agent-shell)

**Amazon Nova AI Hackathon 2026 winners** (gallery order; prize labels confirmed where I checked)
- First Prize Overall: **BackstageCommercials**. Places personalized ads into the background objects of video scenes. Built with Nova, Nova Act, YOLO-seg, Flux and LoRA — [devpost.com/software/backstagecommercials](https://devpost.com/software/backstagecommercials)
- Second Place Overall: **Oracus AI**. A synthetic focus group: 100 personas, 14 market metrics, under 2 minutes, using Nova's web-search grounding. Has a live Vercel demo and GitHub — [devpost.com/software/oracus-ai](https://devpost.com/software/oracus-ai)
- Best of Agentic System: **Sai**. A voice-native macOS agent that sees the screen. Nova Lite does the routing and Nova Pro the visual reasoning. Uses a Porcupine wake word, Deepgram and ElevenLabs, and needs no DOM. The page opens with a one-line hero example: "Hey Sai, answer this LeetCode problem" — [devpost.com/software/sai-your-computer-can-finally-see](https://devpost.com/software/sai-your-computer-can-finally-see)
- Best of Multimodal Understanding: **Project Memoria**. A memory assistant for dementia patients: object recall, time-based and semantic queries, fall detection that alerts caregivers. Built with Nova 2 Lite, Nova multimodal embeddings and Strands — [devpost.com/software/project-memoria-the-dementia-assistant](https://devpost.com/software/project-memoria-the-dementia-assistant)
- Other winners: Title AI, flare (detects AWS anomalies, then **calls** the on-call engineer and acts as a voice triage assistant), SpatialMath AI, Interview Edge, Restaurant IQ, Video-MCP-RAG, Blabber Coach (full-voice mock interviews), Kisan-Mitra AI (voice-first, 15+ dialects), RoleReady, SpeakSmart, NovaSupport, Dear-Care (offline voice health assistant in 7 languages), CivicSync, SafeNaija, ReelAudit, NovaOps, Citadelle Cortex (Nova Act swarm), SonicServe (Nova Sonic restaurant phone agent), Protocol Zero, AI Anime Studio — [amazon-nova.devpost.com/project-gallery](https://amazon-nova.devpost.com/project-gallery)

**Alexa Skills Challenge: Aging & Engaging (2022)**
- Grand Prize (Best Overall): **Family Journal**. A private mini social network that lets family post photos and text to a senior's Echo Show. Built with APL, DynamoDB, CDK, Node.js and a Vue web companion. Live in the Alexa store and at familyjournal.me — [devpost.com/software/family-journal-zsl9ov](https://devpost.com/software/family-journal-zsl9ov)
- Runner-up: **VoicePT**. A multimodal physical-therapy coach. The write-up is built on the founder's own injury story — [devpost.com/software/voicept](https://devpost.com/software/voicept)
- Other winners: Brain Games, Memories, FingerString Appointments (Alexa skill plus outbound phone calls), Senior Stretch, Your Memory Challenge, Storyteller Cafe, Cash Register — [alexaskillsaging.devpost.com/project-gallery](https://alexaskillsaging.devpost.com/project-gallery)

**Alexa Skills Challenge: Alexa Conversations (2020)**
- Grand Prize: **Art Museum**. A voice-first art museum ("Show me paintings from France… ones with horses") with multi-turn refinement, built on the Art Institute of Chicago API. Uses APL and APL-A, Rekognition, Jovo and Lambda — [devpost.com/software/art-museum](https://devpost.com/software/art-museum)
- Other winners: Meeple Buddy, Refuge Restrooms, The Conspiracy Theory, date.a.voice, The Great Expedition, Smartnest Plus, Job Search, Wine Expert Plus, **Ease my trip** (travel), Coffee Club, Abhyas, and others — [alexaconversations.devpost.com/project-gallery](https://alexaconversations.devpost.com/project-gallery)

**Alexa Skills Challenge: Beyond Voice (2020) winners**: Voice Blast, Game Jam, Pirate Maths, Poptime, The Happy Index (APL), LEVOOBA Kids (live multiplayer voice quiz), The Werewolves Game, Beatbox Master, Joy Jam, Math Mountain, Home Connect My Oven Assistant — [alexabeyondvoice.devpost.com/project-gallery](https://alexabeyondvoice.devpost.com/project-gallery)

**Code with Kiro (2025) winners include**: Upload Drive-In, Denarii, cleanclik, a healthcare-worker burnout platform, Mirae Legends, and others — [kiro.devpost.com/project-gallery](https://kiro.devpost.com/project-gallery). **Kiroween winners include**: InteractionKit, UnitSet, SpookBnB, Faxi (fax-to-AI for seniors) — [kiroween-2025.devpost.com/project-gallery](https://kiroween-2025.devpost.com/project-gallery)

**H0 (Vercel v0 + AWS DBs, 2026) winners include**: Waylo (a Mac guide whose voice is "spoken aloud, step by step"), TradeWizard, Giftmaxxing, Sammy, Mnema, FarmOps, Sonar, AskSafe Home (scam protection for seniors), Kintwadi (family caregiving) — [h01.devpost.com/project-gallery](https://h01.devpost.com/project-gallery)

**Alexa Prize (university track, not Devpost)**: TaskBot Challenge 1 (2022) was won by Glasgow's GRILLBot. TaskBot Challenge 2 (2023) was won by NOVA University Lisbon's team, with a $500k prize pool — [NOVA FCT news](https://www.fct.unl.pt/en/news/2023/10/nova-fct-chatbot-wins-first-prize-alexa-prize-taskbot-challenge); [i-programmer](https://www.i-programmer.info/news/233-voice-assistants/15529-taskbot-challenge.html). A separate university competition, the Amazon Nova AI Challenge (Trusted Software Agents, 2025), had winners in two tracks. Defense: PurpCorn-PLAN (UIUC). Attack: PurCL (Purdue) — [SiliconANGLE](https://siliconangle.com/2025/07/23/amazon-nova-ai-challenge-highlights-secure-ai-development-real-attack-scenarios/)

### Inferences
- Every recent grand-prize winner names a concrete, specific problem and user: waste in Dili, insurance claims, US tax filing, ad placement, market research. None is a general-purpose assistant.
- Category prizes in the AWS hackathons go to the project that uses one sponsor service most deeply (Best AgentCore, Best Strands, Best Nova Act). Building squarely on one required service gives a second route to a prize.
- AgentShell is the nearest past analog to an Alexa+ / MCP entry: Alexa as the voice trigger, MCP tools, and a working end-to-end physical loop.

### Gaps
- The Agents for Humans winners were not out on the research date (announcement due Oct 14, 2026).
- I did not extract the prize labels for every Nova winner, only the four checked above.
- In-Skill Purchasing 2019 and Alexa Prize SocialBot/SimBot results for 2023–2024 were not found.

## 2. Winner traits: problem, AWS services, voice/multimodal use, video, README, live demo

### Takeaway
Every winner I checked had a public YouTube or Vimeo video embedded. Most had a public GitHub repo and/or a live deployed URL. Most stacked several sponsor services (AgentCore + Strands + Nova + S3/DynamoDB/Lambda). The write-ups follow Devpost's Inspiration → What it does → How we built it → Challenges format, usually with a personal origin story and hard numbers.

### Cited Findings
- **Judging weights, AWS AI Agent Global Hackathon.** Technical Execution 50% ("Must use the technology… well-architected? reproducible?"). Potential Value/Impact 20%. Creativity 10%. Functionality 10%. Demo Presentation 10% ("Does it include the end-to-end agentic workflow? demo quality and clarity"). Stage One is pass/fail on theme fit and use of the required tech. The video "should be around (3) minutes. Judges are not required to watch beyond three minutes". Submissions must include a URL to the deployed project — [aws-agent-hackathon rules](https://aws-agent-hackathon.devpost.com/rules)
- **Judging weights, Amazon Nova AI Hackathon.** Technical Implementation 60% (integration with Nova, overall architecture). Enterprise/Community Impact 20%. Creativity and Innovation 20% ("innovative use of multi-agent systems"). Bonus for social media and blog posts. Video of about 3 minutes. Categories: Agentic, Multimodal, UI Automation (Nova Act), Voice AI (Nova 2 Sonic), Freestyle — [amazon-nova rules](https://amazon-nova.devpost.com/rules)
- **Alexa Aging & Engaging rules.** Video under 3 minutes giving a "comprehensive demonstration on an Alexa device or simulator". The skill had to be submitted for certification to the US Alexa Skills Store — [alexaskillsaging rules](https://alexaskillsaging.devpost.com/rules)
- **Current Build, Ship, Shape rules** (the most relevant for an Alexa+ entry). Four criteria, **equally weighted**: Tech Implementation, Design ("complete, coherent product experience… interaction model intuitive… for the target device"), Potential Impact ("could it realistically serve an audience beyond the hackathon?") and Quality of the Idea. The rules tell judges to separate obvious from creative entries. For Alexa+, **obvious** means "single-turn Q&A bot, basic MCP wrapper around an existing API". **Creative** means "agentic workflow that orchestrates across services autonomously, context-aware add-on that maintains state across sessions, purchasing capabilities, media support (cards, carousels, etc), MCP Apps, Agent Skills". Video under 3 minutes, showing the project working on the device or simulator — [amazonappdev2026 rules](https://amazonappdev2026.devpost.com/rules)
- **Live demo and repo availability (from the winner pages).**
  - EcoLafaek: live site, docs site and GitHub; the page includes an architecture section, an agent sandbox and terminal tests — [link](https://devpost.com/software/ecolafaek)
  - AegisAgent: App Runner URL — [link](https://devpost.com/software/aegisagent-an-insurance-claim-app-fully-developed-by-kiro)
  - Province: live site — [link](https://devpost.com/software/province)
  - Oratio: GitHub and a CloudFront demo — [link](https://devpost.com/software/oratio-merd5o)
  - Oracus: Vercel demo and GitHub — [link](https://devpost.com/software/oracus-ai)
  - Family Journal and VoicePT: live Alexa Store listings — [Family Journal](https://devpost.com/software/family-journal-zsl9ov), [VoicePT](https://devpost.com/software/voicept)
- **Voice and multimodal patterns among winners.**
  - Voice as the main interface over a visual or agentic system: Sai (wake word plus screen vision), Drishti (voice web navigation), Oratio (Nova Sonic voice-agent builder), flare (an outbound phone call to the on-call engineer), SonicServe (restaurant phone agent) — [Nova gallery](https://amazon-nova.devpost.com/project-gallery); [AWS gallery](https://aws-agent-hackathon.devpost.com/project-gallery)
  - Alexa-era winners combined voice with APL screens (Family Journal, Art Museum, The Happy Index) or with channels outside Alexa: a web companion for posting, SMS ("results sent to your cell" in Job Search), email ("send the final plan to my email" in Ease my trip), phone calls (FingerString) — [Art Museum](https://devpost.com/software/art-museum); [Ease my trip](https://devpost.com/software/ease-my-trip); [Aging gallery](https://alexaskillsaging.devpost.com/project-gallery)
  - Art Museum showed multi-turn refinement with context carried across turns ("Show ones with horses… Actually, show one from Germany"). This is exactly the "stateful, conversational" pattern Alexa Conversations judges rewarded — [link](https://devpost.com/software/art-museum)
- **Write-up style.**
  - EcoLafaek's description runs about 15.6k characters, covering a personal origin story, cited stats, components and architecture — [link](https://devpost.com/software/ecolafaek)
  - Sai's runs about 16k characters and opens with a one-line demo quote and a "Every voice assistant today is blind" framing — [link](https://devpost.com/software/sai-your-computer-can-finally-see)
  - Oracus states quantified claims up front: 100 personas, 14 metrics, under 2 minutes — [link](https://devpost.com/software/oracus-ai)

### Inferences
- Technical depth carries the most weight: 50–60% in the AWS and Nova hackathons. Winners show a real architecture (a diagram, several agents, tools, memory or state, a deployed backend), not a single LLM call.
- A deployed URL or store listing plus a public repo looks close to universal among winners. It also helps with "reproducible" and "functionality".
- Demo videos are capped at about 3 minutes, and judges may stop watching after that. The end-to-end workflow has to appear inside that window, on the real device or simulator.

### Gaps
- I could not get exact video durations or minute-by-minute structure. YouTube's page did not expose `lengthSeconds` to curl. Video IDs for manual review: EcoLafaek ZWKOsdWfSsA, AegisAgent FNWsFtOX4d4, Province _ipE3EZEw40, Oratio S38T1F3W5_o, Drishti RKfreolUQr4, AgentShell Wt0n9WLfi5o, BackstageCommercials DHxJ6ZsmPDM, Oracus QildLHalMFw, Sai eDEe94kSWUQ, Family Journal d0pIz40_4NI, Art Museum iPp_Y3ILxuU, Ease my trip fmeNAElhfaA.
- I did not open the GitHub READMEs, so README quality is judged only from the Devpost write-ups.

## 3. Judge commentary / organizer blog posts

### Takeaway
I found no organizer blog post explaining the 2024–2026 winner choices. The most direct statement of judge intent is the rules text, especially the "obvious vs creative" examples in the current Build, Ship, Shape rules.

### Cited Findings
- The Build, Ship, Shape rules list "obvious" and "creative" examples for each track (quoted in Section 2). In the Ring track, for example, "non-security use case (accessibility aid, care-taking monitoring…)" counts as creative and a "basic doorbell live view" counts as obvious — [amazonappdev2026 rules](https://amazonappdev2026.devpost.com/rules)
- Older Alexa winner announcements exist on the Alexa developer blog, e.g. the 2017 Skills Challenge winners — [Alexa blog](https://developer.amazon.com/en-US/blogs/alexa/post/b5848016-aa2c-42fa-8365-903dfaaea522/announcing-the-winners-of-the-amazon-alexa-skills-challeng)
- A MiniMax post on the AWS x MiniMax MCP Agents Hackathon (June 2025) reports that a voice assistant took first place. I did not read the post in full — [MiniMax](https://www.minimax.io/news/aws-x-minimax-mcp-agents-hackathon)

### Inferences
- The Alexa+ "creative" list (multi-service agentic orchestration, state across sessions, purchasing, cards/carousels, MCP Apps, Agent Skills) can serve as a checklist. An entry should visibly hit several of these items in the video.

### Gaps
- I found no AWS or Devpost blog post with judge quotes for the AWS AI Agent Global Hackathon or the Nova AI Hackathon. Judges' feedback to individual entrants is not public.

## 4. Travel-related winning entries

### Takeaway
Travel winners are rare. The only travel prize winner found in the Alexa/AWS galleries is "Ease my trip" (Alexa Conversations 2020, Best Travel and Transportation Skill). None of the 2025–2026 AWS, Nova or Kiro winners is a travel planner, so the space is open but the entry has to be differentiated.

### Cited Findings
- **Ease my trip** won Best Travel and Transportation Skill. It builds a day-by-day itinerary by voice, takes weather and activity duration into account, and emails the final plan by voice command. Built with ASK, APL, Lambda, DynamoDB and Google Sheets. The inspiration was asking Alexa about Dubai and getting "very limited options" — [devpost.com/software/ease-my-trip](https://devpost.com/software/ease-my-trip)
- MyVoiceTravel ("the world's first voice travel agent… search, compare and even book flights") was submitted to Beyond Voice 2020 but **was not** listed as a winner — [alexabeyondvoice gallery](https://alexabeyondvoice.devpost.com/project-gallery)
- Winners next to travel: Drone SoundAware (flight-route noise planning, Lambda Hackathon) — [link](https://devpost.com/software/drone-soundaware); Angler Advisor (fishing-trip prep, PartyRock) — [PartyRock gallery](https://awspartyrockhackathon.devpost.com/project-gallery); SpookBnB (Kiroween parody of a vacation rental site) — [link](https://devpost.com/software/spookbnb-when-d)

### Inferences
- The Ease my trip win vs MyVoiceTravel loss is one anecdotal data point, not a measured result. It hints that a narrowly scoped, complete, working flow (itinerary, then email) can beat an ambitious claim ("book any flight on any airline"). That fits the "Functionality" and "Design: complete, coherent product experience" criteria.

### Gaps
- I did not search all 2024–2026 galleries in full; the keyword grep covered only the winners on the first gallery page of each hackathon.

## 5. Patterns to copy and pitfalls to avoid

### Takeaway
Copy this formula: one specific user with a painful, quantified problem, solved by an end-to-end agentic workflow that clearly uses several required services, shown working on the real device in under 3 minutes, with a live demo, a public repo and an architecture diagram. Avoid single-turn Q&A, thin API wrappers, and pitches that promise more than the demo shows.

### Cited Findings
- **Pitfalls named by the organizers:** "single-turn Q&A bot, basic MCP wrapper around an existing API" (Alexa+); "single Bedrock call for text generation" (AWS Builder) — [amazonappdev2026 rules](https://amazonappdev2026.devpost.com/rules)
- **Hard disqualifiers in the rules:**
  - The project must "function as depicted in the video".
  - Stage One fails projects that don't "reasonably apply the required APIs/SDKs".
  - Judges may stop at 3 minutes.
  - Existing projects must be "significantly modified" during the submission period and explain how.
  - Sources: [aws-agent-hackathon rules](https://aws-agent-hackathon.devpost.com/rules); [amazon-nova rules](https://amazon-nova.devpost.com/rules)
- **Recurring winning themes across years:**
  - Accessibility and older adults: Drishti, Family Journal, Storyteller Cafe, AskSafe Home, Faxi, Memoria.
  - Community and social good with local specificity: EcoLafaek (Timor-Leste), Kisan-Mitra and Dear-Care (rural India), SafeNaija.
  - Heavy B2B workflows: claims, tax, compliance, fraud, incident response.
  - Sources: the galleries cited in Section 1.
- **Voice that goes beyond the speaker:** winners send output to a phone call, email, SMS, web companion or screen (FingerString, Ease my trip, Job Search, Family Journal, flare) — [Aging gallery](https://alexaskillsaging.devpost.com/project-gallery); [Nova gallery](https://amazon-nova.devpost.com/project-gallery)

### Inferences
- For an Alexa+ travel entry under equal weights (tech, design, impact, idea), the strongest fit with past winners would be:
  - a multi-turn, stateful trip agent that coordinates several services through MCP or Agent Skills;
  - visual cards or carousels;
  - a real-world handoff (booking or purchase, email or SMS, a cross-device push to Fire TV or the phone);
  - a specific persona, e.g. a family or an older traveler;
  - a demo on a real device or simulator.
- Generic Alexa-era losers were mostly single-purpose trivia or quiz skills or broad-claim assistants (based on the many non-winning entries in the galleries). This is an inference from the gallery composition, not a stated judge opinion.

### Gaps
- I have no direct data on why specific non-winners lost. Devpost does not publish scores, and organizers did not post critiques.
