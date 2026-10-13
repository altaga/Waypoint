# AWS Resources for an Agentic, Voice-First MCP Travel Concierge (as of Oct 13, 2026)

## 1. Amazon Bedrock AgentCore: Runtime, Gateway, Memory, Identity, Observability (status, pricing, regions, limits, TypeScript)

### Takeaway
AgentCore is a full set of production services, each billed separately by usage. It can host a streamable-HTTP MCP server directly (Runtime, protocol=MCP, `0.0.0.0:8000/mcp`, OAuth/JWT inbound auth). Gateway can turn Lambdas, OpenAPI and Smithy APIs into MCP tools. At hackathon scale the costs are tiny: Gateway costs $0.005 per 1K calls and Runtime about $0.09 per vCPU-hour. All core services are in us-east-1.

### Cited Findings
**Pricing (USD, from the official pricing page; the page does not say which region the rates apply to)**
- Pricing is consumption-based with no minimums. Each service (Runtime, Gateway, Policy, Identity, Memory, Observability, Evaluations, Browser, Code Interpreter) can be used on its own. — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Runtime pricing:
  - microVMs v1: $0.0895 per vCPU-hour and $0.00945 per GB-hour.
  - microVMs v2 consumption: $0.1276 per vCPU-hour and $0.0169 per GB-hour.
  - Billing is per second with a 1-second minimum and a 128 MB memory minimum.
  - An "Instances" option charges EC2 On-Demand plus a management fee.
  - — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Gateway pricing: $0.005 per 1,000 API invocations, $0.025 per 1,000 Search API calls, and $0.02 per 100 tools indexed per month. — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Identity pricing: $0.010 per 1,000 token or API-key requests for non-AWS resources. There is no charge when Identity is used through AgentCore Runtime or Gateway. — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Memory pricing:
  - Short-term memory was $0.25 per 1,000 new events through Oct 5, 2026. From Oct 6, 2026 it is $1.00 per GB ingested, $0.20 per GB retrieved and $0.10 per GB-month stored.
  - Long-term memory with built-in strategies costs $0.75 per 1,000 records per month. Override or self-managed strategies cost $0.25 per 1,000 records per month.
  - Long-term retrieval costs $0.50 per 1,000 retrievals.
  - — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Observability has no separate AgentCore fee. Spans, logs and metrics are billed at Amazon CloudWatch rates. — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Policy costs $0.025 per 1,000 authorization requests. Evaluations with built-in evaluators cost $0.0024 per 1K input tokens and $0.012 per 1K output tokens. — [AWS AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Third-party pricing guides repeat the same Runtime rates. — [CloudBurn](https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing)

**Regions**
- In US East (N. Virginia), us-east-1, all of these are available: AgentCore harness, Runtime microVMs and Instances, Memory, Gateway, Identity, Built-in Tools, Observability, Policy, Evaluations, AWS Agent Registry and the Web Search Tool. — [AgentCore supported regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)
- Memory and harness are not available in some regions, such as US West (N. California) and Milan. us-east-1 and us-west-2 have the widest coverage. — [AgentCore supported regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)

**Runtime as an MCP host**
- When a Runtime is configured with protocol MCP, AgentCore expects the server at `0.0.0.0:8000/mcp`.
- It supports stateless streamable HTTP (`stateless_http=True`, recommended) and stateful mode. Stateful mode is needed for elicitation, sampling and progress notifications.
- The platform injects `Mcp-Session-Id` into requests that lack one.
- — [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md)
- The invocation URL format is `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{URL-encoded ARN}/invocations?qualifier=DEFAULT`, called with an `Authorization: Bearer <JWT>` header.
  - Inbound auth is `CUSTOM_JWT`, set up with a discovery URL and allowed clients. The examples use Cognito or Auth0, and Auth0 supports Dynamic Client Registration.
  - A request without a token gets a 401 with `WWW-Authenticate: Bearer resource_metadata=...` for OAuth protected-resource discovery.
  - — [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md)
- Deployment tooling is the AgentCore CLI, installed with `npm install -g @aws/agentcore`. The workflow is `agentcore create`, then `agentcore add agent --protocol MCP --authorizer-type CUSTOM_JWT ...`, then `agentcore deploy`. — [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md)
- The official MCP hosting sample is in `awslabs/amazon-bedrock-agentcore-samples`, under `01-features/02-host-your-agent/01-runtime/02-hosting-tools/01-mcp-server-basics`. — [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md)

**Runtime limits**
- Request timeout: 15 minutes.
- Maximum payload: 100 MB. Streaming chunks: up to 10 MB.
- Streaming and WebSocket connections: up to 60 minutes. WebSocket frames: 64 KB maximum, at no more than 250 frames per second.
- Idle session timeout: 15 minutes (adjustable). Maximum session length: 8 hours.
- Each session gets up to 2 vCPU and 8 GB.
- New sessions can be created at 25 TPS. Data-plane calls are limited to 1,000 TPS.
- Up to 5,000 active sessions are allowed in us-east-1 and us-west-2.
- A WebSocket API (`InvokeAgentRuntimeWithWebSocketStream`) exists.
- — [AgentCore quotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)

**Gateway**
- Gateway converts APIs, Lambda functions and existing services into MCP-compatible tools.
  - Supported tool input types are OpenAPI, Smithy and Lambda. Passthrough targets also cover A2A and HTTP services.
  - It offers model-based routing of inference requests and 1-click integrations with Salesforce, Slack, Jira, Asana and Zendesk.
  - It handles both inbound and outbound authentication, including OAuth flows, token refresh and credential storage.
  - Semantic tool search lets agents find the right tool among many.
  - It works with Strands, LangGraph, CrewAI and LlamaIndex.
  - — [AgentCore Gateway docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)
- Gateway limits:
  - 100 targets per gateway and 1,000 tools per target.
  - Invocation timeout: 15 minutes.
  - Tool calls and tool listing: 200 TPS per gateway or account. Search-based tool calls: 25 per minute.
  - Maximum payload: 6 MB.
  - Endpoint format: `https://{gateway-Id}.gateway.bedrock-agentcore.{Region}.amazonaws.com`.
  - — [AgentCore quotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)

**Memory**
- Raw conversation events are written with `CreateEvent`, which is short-term memory. Strategies attached to a memory resource then extract long-term records automatically. Without strategies, no long-term records are extracted.
- There are three strategy types:
  - Built-in: fully managed, but storage costs more.
  - Built-in overrides: custom prompts, using Bedrock models that run in your account.
  - Self-managed: you run the full pipeline yourself.
- Built-in and custom strategies can be combined in one memory resource.
- — [Memory strategies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html)
- Memory limits:
  - 150 memory resources per region and 6 strategies per resource.
  - Events can expire after 7 to 365 days.
  - `CreateEvent` is limited to 5 requests per second per actor per session.
  - `RetrieveMemoryRecords` is limited to 30 TPS.
  - Long-term extraction is capped at 150K tokens per minute. Episodic extraction has its own cap of 50K tokens per minute per session, which shows that an episodic strategy exists.
  - — [AgentCore quotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)

**Identity**
- Identity supports up to 50 OAuth2 credential providers and 50 API-key credential providers per region for outbound access.
- Payment credential providers also exist.
- `GetResourceOauth2Token` is limited to 200 TPS.
- — [AgentCore quotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)
- AgentCore payments is available in us-east-1. — [AgentCore supported regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)
- Since Oct 7, 2025, AgentCore uses a service-linked role for workload-identity permissions when OAuth is used. — [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md)

**TypeScript**
- The CLI is distributed through npm and takes a `--language` flag.
- The official MCP walkthrough is written in Python.
- AWS's Nx Plugin for AWS documents a TypeScript Strands agent connecting to a TypeScript or Python MCP server, with both deployed through AgentCore.
- — [Runtime MCP doc](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.md); [Nx Plugin for AWS – TS agent to MCP](https://awslabs.github.io/nx-plugin-for-aws/es/guides/connection/ts-agent-mcp)
- An open-source AgentCore MCP server, a developer tool for building and deploying agents, was announced Oct 2, 2025. — [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/10/open-source-mcp-server-amazon-bedrock-agentcore)

### Inferences
- **Simplest hackathon path:** write the travel MCP server in Python FastMCP or the TypeScript MCP SDK, in stateless streamable HTTP mode, and deploy it to AgentCore Runtime with Cognito JWT auth. The Runtime's 401 plus protected-resource-metadata behavior matches how MCP clients discover OAuth, which suits an Alexa+ connection. Whether Alexa+'s auth flow works with Cognito as-is is unverified.
- **Using Gateway instead:** you can wrap existing Lambdas (flight search, hotels, weather) as tools without writing MCP protocol code. Outbound OAuth through Identity is free when called via Gateway.
- **Rough demo cost:** at demo scale, roughly 1K tool calls and a few hours of Runtime, AgentCore should cost under $1–2. Model tokens will dominate the bill.
- **Memory pricing change:** the change on Oct 6, 2026 means short-term memory is now billed per GB, not per event. Documentation dated earlier may still show the per-event price.

### Gaps
- I did not find the formal GA announcement date for AgentCore in this session. Everything is documented as production, with quotas and per-service pricing, but no "preview" label appears on the pages I read.
- The names and behavior of the built-in memory strategies (semantic, summary, user preference, episodic) were not confirmed from the built-in-strategies page. Only "episodic" is confirmed, via the quota page.
- Whether Runtime officially supports TypeScript/Node containers with protocol MCP was not confirmed. Since Runtime runs any container on port 8000 at `/mcp`, it probably works.
- No free tier specific to AgentCore was found, apart from Agent Registry and Policy allowances.

## 2. Strands Agents SDK (Python and TypeScript)

### Takeaway
Strands TypeScript reached v1.0 on Apr 30, 2026 as `@strands-agents/sdk`. It includes a native `McpClient`, uses Bedrock as the default provider, streams with `agent.stream()`, and supports three multi-agent patterns: agents-as-tools, Graph and Swarm. It runs in Node.js and in the browser. Python Strands has an experimental bidirectional (bidi) streaming module with a Nova Sonic model adapter for voice.

### Cited Findings
- **TS v1.0 release:**
  - Announced April 30, 2026. The package is `@strands-agents/sdk`, with subpath imports `@strands-agents/sdk/models/bedrock` and `@strands-agents/sdk/multiagent`.
  - Bedrock is the default model provider. OpenAI, Anthropic, Google and Vercel AI SDK providers are also supported.
  - Streaming uses `agent.stream()`.
  - The multi-agent patterns are agents-as-tools, Graph and Swarm.
  - The post says the SDK "runs natively in the browser with no server required."
  - — [Strands blog: TypeScript v1](https://strandsagents.com/blog/strands-agents-typescript-v1/)
- **MCP in TypeScript:** an `McpClient` object is passed directly into the agent's `tools` array. — [Strands blog](https://strandsagents.com/blog/strands-agents-typescript-v1/); [DEV: side-by-side guide](https://dev.to/aws/strands-agents-now-speaks-typescript-a-side-by-side-guide-12b3)
- **TS preview:** the TypeScript preview was announced at re:Invent in Dec 2025 as v0.1, with support for Bedrock, OpenAI, MCP, A2A and OTEL. — [AWS What's New (es)](https://aws.amazon.com/es/about-aws/whats-new/2025/12/typescript-strands-agents-preview/)
- **Later TS releases:**
  - typescript/v1.8.0 added loading MCP servers from JSON (#2947).
  - typescript/v1.9.0 exposed a `client_name` parameter on `MCPClient` (#3113).
  - The repository appears to be `strands-agents/harness-sdk`, a monorepo.
  - — [newreleases v1.8.0](https://newreleases.io/project/github/strands-agents/harness-sdk/release/typescript%2Fv1.8.0); [newreleases v1.9.0](https://newreleases.io/project/github/strands-agents/harness-sdk/release/typescript%2Fv1.9.0)
- **Python voice:** Python Strands has an experimental bidi module, `strands.experimental.bidi.models.nova_sonic`, which is a Nova Sonic model adapter for bidirectional voice agents. — [Strands API reference (search listing)](https://mono-repo-docs.strandsagents.com/docs/api/python/strands.experimental.bidi.models.nova_sonic/). The 1.x URL returned 404 when fetched.

### Inferences
- **TypeScript stack:** a TS-only stack is viable. The Strands TS agent connects through `McpClient` to an MCP server hosted on AgentCore Runtime or Gateway and uses a Claude model on Bedrock.
- **Voice in Python:** Strands Python bidi with Nova Sonic currently looks like the most direct "agent framework + speech-to-speech" option. It is experimental, so expect API changes.

### Gaps
- I did not find the current Python Strands version number or the exact latest TypeScript version (only that v1.9.0 exists).
- I did not find whether TypeScript Strands has bidi/voice support. The v1 post does not mention it.

## 3. Bedrock models in us-east-1, browser speech-to-speech with Nova 2 Sonic, and Polly/Transcribe

### Takeaway
Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) is in us-east-1 and works through `InvokeModelWithBidirectionalStream`. Input is 16 kHz, 16-bit mono LPCM in base64 and output is 24 kHz. Each connection is limited to 8 minutes, and AWS publishes a session-continuation pattern. Browsers cannot call it directly with SigV4 in the documented samples, so you need a relay (Node or Java WebSocket server, or AgentCore Runtime WebSocket). Recent Claude models (Opus 5, Opus 4.x, Haiku 4.5, Fable 5) are reached in us-east-1 mostly through `us.` or `global.` cross-region inference profiles.

### Cited Findings
**Nova 2 Sonic**
- Model ID is `amazon.nova-2-sonic-v1:0`, with us-east-1 as the default region. The API is `invoke_model_with_bidirectional_stream`.
- The event sequence is sessionStart, then promptStart, then a system-prompt contentStart/textInput/contentEnd block, then audio contentStart, audioInput chunks, contentEnd, then promptEnd and sessionEnd.
  - sessionStart carries `inferenceConfiguration` and `turnDetectionConfiguration.endpointingSensitivity`.
  - promptStart sets `voiceId`, for example "matthew".
- Audio input is 16 kHz LPCM, 16-bit, mono, base64. Output is 24 kHz.
- — [Nova 2 Sonic getting started](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.md)
- There is an 8-minute connection limit. A session-continuation pattern is at `aws-samples/amazon-nova-samples/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/session-continuation`. — [Nova 2 Sonic getting started](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.md)
- The official code examples include:
  - basic Python
  - full Python with barge-in
  - tool use
  - text plus audio
  - WebSocket implementations in Java and Node.js, with C# also listed
  - — [Nova 2 Sonic code examples](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-code-examples.html) (via search summary)
- **Capabilities:**
  - Languages: English, French, Italian, German, Spanish, Portuguese and Hindi.
  - Polyglot voices such as Tiffany can switch languages mid-conversation.
  - Regions: us-east-1, us-west-2 and ap-northeast-1.
  - Voice and text can be mixed in one session.
  - Voice activity detection sensitivity is configurable.
  - Async tool calling: the model keeps talking while tools run.
  - Integrations: Amazon Connect, Vonage, Twilio, AudioCodes, LiveKit and Pipecat.
  - — [AWS News Blog: Introducing Nova 2 Sonic](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai)
- **Pricing:** AWS says it keeps Nova Sonic's price-performance and does not list rates in the blog. A third-party estimate puts it at about $3 per 1M speech input tokens and $12 per 1M speech output tokens, roughly $0.015 per minute. — [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-nova-2-sonic-real-time-conversational-ai); third-party: [techplained](https://www.techplained.com/amazon-nova-2) (unverified)
- **Unconfirmed reports:**
  - A third-party alert reports a "Nova 2.5 Sonic" in four regions, adding Stockholm. — [aiweekly](https://aiweekly.co/alerts/amazons-nova-25-sonic-voice-model-hits-bedrock-in-four-regions) (not confirmed by an AWS source)
  - Sources disagree on the context window: one summary says 1M tokens and the Nova 2.5 article says 256K.

**Browser audio**
- A third-party write-up recommends Web Audio API or WebRTC on the browser side for echo cancellation and latency. — [HKU aihub write-up](https://aihub.hkuspace.hku.hk/?p=6144)

**Claude on Bedrock (Oct 2026)**
- Claude Opus 5: model ID `anthropic.claude-opus-5`, launched Jul 24, 2026, lifecycle Active. Cross-region profiles are `us.`, `eu.`, `au.` and `global.`, and there is no in-region option. — [Bedrock model card: Claude Opus 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5.html)
- Opus 4.8 (launched May 28, 2026) and Opus 4.7 use `us.` and `global.` profiles. — [Opus 4.8 card (docs.aws.eu mirror)](https://docs.aws.eu/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html); [Opus 4.7 card](https://docs.aws.eu/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-7.html)
- Haiku 4.5: `anthropic.claude-haiku-4-5-20251001-v1:0`, with `us.` and `global.` profiles. — [Haiku 4.5 card](https://docs.aws.eu/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html)
- Claude Fable 5: `us.anthropic.claude-fable-5`. In us-east-1 it is available in-region and through geo and global profiles. — [Fable 5 card](https://docs.aws.eu/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html)
- Claude Sonnet 4 is Legacy, with end of life on Oct 14, 2026. Do not build on it. — [Sonnet 4 card](https://docs.aws.eu/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4.html)

### Inferences
- **Recommended voice architecture:**
  1. The browser captures mic audio with Web Audio, downsamples it to 16 kHz PCM16 and sends it over a WebSocket.
  2. A relay forwards the audio to Nova 2 Sonic over the bidirectional stream. The relay can be the Node.js WebSocket sample on a small container, or AgentCore Runtime's WebSocket support: 60-minute streams, 64 KB frames, 250 frames per second.
  3. The relay plays back the 24 kHz PCM from Sonic.
  4. Sonic's tool use calls the travel MCP tools, or hands off to a Claude-powered Strands agent for complex planning.
  - Because of the 8-minute limit, the relay must implement session continuation.
- **Choosing a Claude model:**
  - For latency-sensitive voice turns, Haiku 4.5 or Fable 5 (in-region in us-east-1) are reasonable picks.
  - Opus 5 suits deep itinerary planning.
  - Use the `us.` or `global.` profile IDs.
- **Polly/Transcribe:** Amazon Transcribe streaming plus a Claude agent plus Amazon Polly is the classic cascaded alternative. It is easier to debug but has more latency.

### Gaps
- Amazon Polly and Transcribe pricing and features were not researched in this session. I found no sources, so check the Polly and Transcribe pricing pages.
- No official browser-only (JavaScript client) Nova Sonic sample was confirmed. The Node.js WebSocket example is the closest.
- Official Nova 2 Sonic per-token pricing was not retrieved from the Bedrock pricing page.
- The current Claude Sonnet model on Bedrock (beyond Sonnet 4) was not confirmed.
- I did not check the Nova 2 text models (Lite/Pro) in us-east-1.

## 4. Hosting a remote MCP server on Lambda, plus samples (including Alexa+)

### Takeaway
AWS's options for Lambda-hosted MCP are the awslabs `run-model-context-protocol-servers-with-aws-lambda` library and the `aws-samples/sample-serverless-mcp-server` sample. The library supports streamable HTTP via API Gateway, via AgentCore Gateway, or via Function URLs with SigV4. The sample uses TypeScript on Node.js 20+ with API Gateway and chunked streamable HTTP. Alexa+ uses MCP through the Alexa+ MCP Toolkit, which needs a streamable-HTTP MCP server on spec 2025-11-25 and is US-only. I found no AWS sample combining Alexa+ and AgentCore.

### Cited Findings
- The awslabs library runs MCP servers, including stdio-based ones, inside Lambda functions.
  - Transports: streamable HTTP via API Gateway, streamable HTTP via AgentCore Gateway, custom streamable HTTP with SigV4 for Lambda Function URLs, and a custom Lambda Invoke transport.
  - Auth: OAuth or IAM.
  - Examples are deployed with CDK.
  - — [awslabs/run-model-context-protocol-servers-with-aws-lambda (docsearch mirror)](https://docsearch.algolia.com/mcp/docs/repo/awslabs/run-model-context-protocol-servers-with-aws-lambda); [mcp.so listing](https://mcp.so/server/run-model-context-protocol-servers-with-aws-lambda/awslabs) (secondary sources; check the GitHub README)
- `aws-samples/sample-serverless-mcp-server` adapts the official TypeScript MCP server to Lambda behind API Gateway.
  - It streams responses using chunked transfer, per MCP's 2025-03-26 streamable HTTP spec.
  - It uses Serverless Framework and needs Node.js 20+.
  - The README does not describe client auth.
  - — [sample README](https://cdn.jsdelivr.net/gh/aws-samples/sample-serverless-mcp-server@main/README.md)
- AWS's catalog of official MCP servers is `awslabs/mcp`. — [github.com/awslabs/mcp](https://github.com/awslabs/mcp)
- Community guides cover Lambda Function URLs and Lambda Web Adapter for MCP, and OAuth 2.1. — [hidekazu-konishi guide](https://hidekazu-konishi.com/entry/mcp_server_aws_lambda_complete_guide.html); [DEV: nearly free Lambda MCP](https://dev.to/zhizhiarv/hosting-remote-mcp-server-on-aws-lambda-for-nearly-free-2h8j)
- **Alexa+ MCP Toolkit:**
  - Alexa+ acts as the MCP client. It handles language understanding, response generation and UI rendering, and your server returns standard MCP responses.
  - Transport is streamable HTTP, on MCP spec 2025-11-25.
  - MCP Apps are supported for interactive UIs.
  - You deploy the add-on with the Alexa AI CLI (`alexa-ai deploy`) or the add-on Agent Skill.
  - Authentication and account linking are covered on separate pages.
  - The toolkit is available in the United States.
  - — [Alexa+ MCP Toolkit overview](https://developer.amazon.com/en-US/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
- The official AgentCore samples repo has MCP-hosting tutorials, for example `01-tutorials/01-AgentCore-runtime/02-hosting-MCP-server`. — [search summary referencing awslabs/amazon-bedrock-agentcore-samples](https://docs.aws.amazon.com/bedrock-agentcore/index.md)

### Inferences
- **Hosting choice for an Alexa+ entry:**
  - AgentCore Runtime with protocol MCP gives the least friction for auth (built-in JWT and OAuth metadata) and supports stateful features like elicitation.
  - A Lambda Function URL with response streaming, or API Gateway plus Lambda, is the cheapest option.
  - Either way, the server must speak MCP 2025-11-25 streamable HTTP for Alexa+. Check SDK versions.
- **Stateless servers on Lambda:** keep the server stateless (no session affinity), since Lambda does not guarantee the same instance between requests.

### Gaps
- No `aws-samples` or `awslabs` repo combining Alexa+ and MCP, or Alexa+ and AgentCore, was found.
- I did not read the Alexa+ auth and account-linking requirements, for example whether OAuth 2.1 with DCR is required.
- I did not confirm from AWS docs whether Lambda Function URL response streaming is supported for Node and Python runtimes as of Oct 2026.

## 5. AWS credits and hackathon offers

### Takeaway
The Amazon Developer Hackathon 2026 ("Build, Ship, Shape") has an Alexa+ track for Agent Skills, MCP-based experiences or simulated Alexa+ experiences. Its submissions close Oct 23, 2026 at 12:00 PM PT, and its prizes include cash plus AWS credits. Separately, new AWS accounts get up to $200 in Free Tier credits, and Bedrock usage earns part of that bonus.

### Cited Findings
- **Amazon Developer Hackathon 2026:**
  - Tracks: Fire TV, Alexa+, Bee and Ring.
  - Dates: starts Aug 31, 2026. Submissions are due Oct 23, 2026 at 12:00 PM PT. Judging runs Nov 9–20, and winners are announced around Dec 3.
  - Alexa+ prizes: 1st place gets $25,000, AWS credits and a meeting with the Amazon Developer team. 2nd gets $15,000 plus AWS credits. 3rd gets $4,000 plus AWS credits.
  - Total prize pool is up to $138,000. The listing gives no specific AWS credit amounts.
  - — [Internshala listing: Build, Ship, Shape – Amazon Developer Hackathon 2026](https://internshala.com/competitions/?p=11209) (third-party host; confirm on Amazon's official page)
- **AWS Free Tier:** new customers get $100 in credits at sign-up and can earn $100 more by using services including Amazon EC2 and Amazon Bedrock. The free plan lasts 6 months or until the credits run out. — [AWS What's New, Jul 2025](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)
  - Coverage says each of five onboarding activities earns $20, and Bedrock is one of them. — [Techzine](https://www.techzine.eu/news/applications/133095/aws-renews-free-tier-with-credit-up-to-200/)
  - The AgentCore pricing page repeats "up to $200 in Free Tier credits." — [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- **Other programs:**
  - AWS Activate gives startup credits. Third-party sources disagree on amounts, from $1K–$100K up to $200K. — [reskilll blog](https://blogs.reskilll.com/free-cloud-credits-hackathons-aws-gcp-azure-student-programs-2026/)
  - Other AWS agentic hackathons, such as AWS Community Day Bay Area (Sep 29 to Oct 11, 2026), gave credit prizes but appear to be closed. — [Meetup AWS Community Bay Area](https://www.meetup.com/aws-community-bay-area)

### Inferences
- **Fit with the hackathon:** this project matches the Alexa+ track's "MCP-based experiences." The Oct 23 deadline is 10 days from now, which argues for the lowest-setup path: an MCP server on AgentCore Runtime or Lambda, with a Strands or Claude agent.
- **Budget:** a fresh AWS account's $100–$200 in credits should cover a hackathon-scale build, including Bedrock tokens and AgentCore.

### Gaps
- I did not find the official Amazon/Devpost page for the hackathon, the AWS credit amounts per prize, or the judging criteria.
- I did not find whether the free account plan allows all Bedrock models, including Anthropic models that require Marketplace access, and AgentCore, or whether a paid plan is needed.
- I found no AWS-sponsored credits specific to hackathons that individuals can request.
