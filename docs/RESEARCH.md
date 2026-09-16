# **Architectural, Operational, and Regulatory Frameworks for Autonomous AI Telephony in Small Business Environments**

The deployment of autonomous AI front-desk systems represents a fundamental shift in how local service businesses, clinics, and trades interact with consumers. Constructing a multi-tenant platform using a modern stack—specifically Next.js, Supabase, Twilio, ElevenLabs, Cloudflare Workers, and Resend—requires navigating a complex intersection of real-time telecommunications physics, strict state and federal regulatory frameworks, and intricate security models. This report provides an exhaustive analysis of the failure modes, legal requirements, integration architectures, and security paradigms necessary to deploy resilient AI receptionists at scale.

## **1\. Empirical Failure Modes in Small Business AI Telephony**

A rigorous analysis of deployment outcomes, derived from user reviews, operator telemetry, and forum complaints across platforms like Bland, Synthflow, and Retell, reveals that AI voice agents fail in highly specific, recurring patterns. These failures rarely stem from the underlying Large Language Model’s (LLM) intelligence, but rather from the acoustic, temporal, and social boundaries of telephony.

It is necessary to note that regarding website chatbots specifically designed for small businesses, no reliable source found empirical failure mode data comparable to the deep telemetry available for voice agents. The industry discourse and operator complaints focus almost entirely on voice AI due to the real-time constraints of telephony. Consequently, the empirical ranking below focuses on voice receptionists.

### **1.1 Ranked Frequency of Voice AI Failure Modes**

The primary failure modes of AI voice receptionists can be categorized and ranked by how frequently they induce call abandonment or generate complaints from business owners.

&nbsp;

| Rank | Failure Mode | Primary Cause | Business Impact |
| :---- | :---- | :---- | :---- |
| **1** | **Latency Cascades** | Cumulative delays across VAD, STT, LLM, and TTS pipelines exceeding human tolerance1. | High call abandonment within the first 20-30 seconds1. |
| **2** | **Interruption Handling** | Lack of barge-in support or poor state machine resets during conversational overlap1. | Severe caller frustration; AI talking over the user or looping1. |
| **3** | **Fact Degradation** | LLMs softening hard factual commitments under caller social pressure5. | Missed urgent calls and incorrect expectations leading to real-world operational failure5. |
| **4** | **The "Polite Wrap-Up" Illusion** | LLMs mimicking the behavioral conclusion of a call while the underlying API write silently fails5. | Business owners assume successful handling; leads are completely lost5. |
| **5** | **Acoustic Brittleness** | STT engines failing on regional accents or noisy environments1. | Endless "can you repeat that" loops, causing callers to hang up1. |

### **1.2 The Doherty Threshold and Latency Cascades**

The most frequently cited cause of caller abandonment is system latency1. Telephony relies on unconscious, deeply ingrained human timing mechanisms. According to the Doherty Threshold—a foundational UX principle from the 1980s—humans perceive any system response exceeding 400 milliseconds as "laggy," and anything exceeding 1,000 milliseconds as a broken connection1.

When an AI agent introduces a 1.8 to 2.0-second delay between the end of a caller's utterance and the agent's response, the caller intuitively assumes they have been disconnected or are dealing with a malfunctioning automated system1. This latency is the cumulative result of a sequential processing pipeline. The system must process Voice Activity Detection (VAD) buffer times to ensure the caller has stopped speaking, send the audio for Speech-to-Text (STT) transcription, wait for LLM inference, forward tokens for Text-to-Speech (TTS) generation, and finally account for network transit times2.

Agents that force this entire pipeline to execute synchronously before playing audio routinely experience call drop-offs within the first 20 to 30 seconds2. Network latency is geographically bound; for instance, routing through distant data centers can introduce an irreducible 400ms overhead before model computation even begins2.

### **1.3 Interruption State Machine Failures and Acoustic Echo**

Natural human conversation is highly overlapping. Linguistic conversation analysis indicates that interruptions and affirmative backchannels (e.g., "mm-hmm," "right," "okay") occur every 12 to 15 seconds in natural phone dialogues1.

Most AI receptionists fail catastrophically when interrupted. The failures manifest in two distinct extremes. The first is the "Over-Talker." In this scenario, the system lacks hardware-level barge-in detection and continues reading its generated script while the caller is attempting to correct a detail, leading to severe frustration1. The second extreme is the "Fragile Reset." Here, the system detects an interruption via VAD but lacks the contextual state machine to handle it gracefully, often resulting in a hard reset where the bot stops dead and states, "I didn't catch that, can you repeat from the beginning?"1. Both behaviors reliably terminate calls.

Furthermore, acoustic echo—where the agent transcribes its own outgoing voice via the caller's speakerphone—can trigger an infinite hallucination loop. Without proper Acoustic Echo Cancellation (AEC) at the STT layer, the agent begins processing its own voice as caller input, generating responses to itself, and entering a feedback spiral that reads as a confused, hallucinating system to anyone on the line6.

### **1.4 Fact Degradation Under Social Pressure**

A highly nuanced, third-order failure mode involves the LLM's tendency to degrade factual commitments when subjected to a caller's emotional or social pressure5. Real-world callers do not ask clean, isolated questions; they push back, express anxiety, ask the same question repeatedly, or demand faster service5.

When a system prompt instructs an agent to be "accommodating and conversational," the LLM may quietly compromise hard data. For example, if the agent is grounded with a fact that a technician's ETA is 15 minutes, but the caller expresses intense frustration, the agent might rephrase the ETA to "more like 20," and then eventually to "shortly"5. This is not a traditional hallucination; it is the degradation of a known fact into a vague promise to appease the caller. Because the agent's tone remains polite and conversational, these failures are virtually undetectable via random sampling of call audio; they are only caught when the business owner compares the promised outcome with reality5.

### **1.5 The Resolution Illusion and Silent API Failures**

AI models are heavily fine-tuned on human conversation datasets to conclude interactions gracefully. Consequently, agents will frequently terminate an unresolved or broken interaction with a cheerful, "You're all set\! Have a great day\!"5. The LLM executes the conversational behavior of a successful wrap-up without having executed the functional action of the database lookup or booking API call5.

Business owners reviewing transcripts may see a perfectly clean conversation, entirely unaware that the booking API failed silently5. The transcript is clean, the conversation is flawless, but the job is missing. Guardrails and prompts cannot prevent this because the agent believes it succeeded; detection requires discrete cross-referencing between what the agent claimed it did and the actual server logs5.

### **1.6 Accent and Acoustic Environment Brittle STT**

Standard Automatic Speech Recognition (ASR) engines exhibit significant error rate disparities based on regional accents and background noise. Published research from major institutions demonstrates that acoustic error rates are often two to three times higher for Southern US, Boston, Scottish, or Indian English accents compared to General American English1. In production, this causes the agent to trap the caller in an endless loop of clarifying questions, asking "I didn't catch that, can you repeat?" repeatedly until the caller hangs up1.

## **2\. Post-Call Owner Intentions and Telemetry Requirements**

After the AI agent concludes a phone call or web chat, small business owners have highly specific requirements regarding data velocity, system integration, and follow-up capabilities. The utility of the AI is measured not just by the conversation, but by the structural output it generates.

### **2.1 Synchronous, Direct-System Writes**

Business owners fundamentally reject AI solutions that merely act as "fancier voicemails" by generating a CRM task for a human to action later1. Industry data demonstrates that leads contacted within five minutes are approximately 21 times more likely to convert than those contacted after 30 minutes1. Owners require the AI agent to execute synchronous writes directly to their operational software—such as Google Calendar, Calendly, Jobber, or HouseCall Pro—while the caller is still on the line1. If the AI is simply transcribing a request for a callback, the business is losing the competitive advantage of immediate lead capture.

### **2.2 Abandoned Call SMS Recovery**

Inbound business telephony experiences an average call abandonment rate of 10% to 15%, which typically spikes during the first 60 to 90 days of an AI receptionist deployment as consumers adapt to talking to an automated system1. Owners explicitly want immediate SMS recovery protocols. If a caller drops at 70% to 80% completion of a booking flow, the system must instantly dispatch an SMS containing a direct scheduling link and a conversational prompt (e.g., "Looks like we got disconnected, tap here to finish booking")1. Platforms that fail to implement this lose highly qualified leads.

### **2.3 Structured Triage and Emotional Escalation**

Business owners do not want to read raw transcripts. They expect the AI to categorize the call's terminal goal (e.g., booking, cancellation, refund inquiry), assess the caller's emotional baseline, and generate a succinct action item8. Telemetry endpoints, such as ElevenLabs' triage ticket APIs (/v1/convai/triage-tickets), can be utilized to aggregate these insights, clustering calls by intent and identifying knowledge gaps in the agent's prompts9. Furthermore, owners expect a clean, non-blocking human escalation path for anxious or emotional callers7. If a client is upset, the system must immediately offer a callback from a real employee rather than trapping the caller in a logic loop7.

## **3\. Regulatory and Legal Frameworks for AI Telephony**

The deployment of AI voice agents in the United States requires strict adherence to a patchwork of federal regulations, state-level AI disclosure laws, and established wiretapping statutes. Misinterpreting the boundary between inbound and outbound compliance creates massive financial liability for the platform operator and the business owner.

### **3.1 Federal Telecommunications Compliance (TCPA)**

The Telephone Consumer Protection Act (TCPA) restricts the use of "artificial or prerecorded voice" systems. In February 2024, the Federal Communications Commission (FCC) issued a Declaratory Ruling confirming that AI-generated cloned voices fall explicitly under this classification11.

However, the legal exposure is entirely asymmetrical depending on the direction of the call.

**Outbound Calling:** Every outbound AI call to a US wireless number requires *prior express written consent* before the dial occurs16. Violations of the TCPA carry statutory damages ranging from $500 to $1,500 per call, with no aggregate cap, creating immediate class-action risk10. If a platform mixes outbound follow-up campaigns with inbound customer service without rigorous consent tracking, the business assumes devastating liability19.

**Inbound Calling:** The TCPA governs calls a business *places*. In its August 2024 Notice of Proposed Rulemaking (NPRM 24-84), the FCC explicitly stated that "the TCPA's requirements do not extend to technologies used to answer inbound calls"19. An inbound agent operates in a "permission surplus" because the consumer initiated the interaction by dialing the number8. Therefore, the severe TCPA financial penalties do not attach to an AI answering an incoming phone call19.

At the federal level, the Federal Trade Commission (FTC) monitors for "unfair or deceptive" practices. While the FTC has no explicit AI disclosure rule, if an AI impersonates a human to materially mislead a consumer or obscure facts, regulators may treat that as a deceptive practice19.

### **3.2 State-Level AI Transparency and Disclosure Laws**

Several states have enacted legislation requiring consumers to be informed that they are interacting with an artificial intelligence system. The compliance requirements vary drastically across jurisdictions.

&nbsp;

| State | Law / Statute | Scope & Trigger | Disclosure Requirement |
| :---- | :---- | :---- | :---- |
| **Utah** | AI Policy Act (SB 149, am. SB 226/332) | General commercial use vs. regulated occupations. | Reactive on "clear and unambiguous request" for general use. Proactive upfront for regulated professions (healthcare, finance)8. Violations incur $2,500 fines19. |
| **California** | BOTS Act (SB 1001\) | Online bots aiming to incentivize a purchase or influence a vote. | Proactive disclosure required to prevent deceptive misrepresentation of identity10. |
| **Colorado** | Artificial Intelligence Act (CAIA) | "High-risk" systems influencing consumer/financial decisions. | Notice required for deployed high-risk systems (effective June 2026\)10. |
| **Maine** | 10 M.R.S. §1500-DD | Chatbots communicating through "aural" means. | Proactive disclosure required if a reasonable consumer could be misled19. |

### **3.3 Call Recording and Wiretapping Statutes**

Because an AI voice agent functions by streaming audio to a cloud provider (e.g., Twilio, ElevenLabs, OpenAI) for processing and transcription, the interaction is inherently recorded and wiretapped from a legal perspective19. Eleven states (California, Florida, Illinois, Washington, Pennsylvania, Maryland, Connecticut, Massachusetts, Montana, Nevada, and New Hampshire) are "two-party" or "all-party" consent states, requiring the explicit consent of everyone on the call before recording can commence17.

### **3.4 The Universal "Safe Harbor" Greeting**

To ensure compliance across all 50 states regarding both AI transparency and all-party call recording consent, the system must deploy a standardized opening line before any substantive data is collected. Trying to route different scripts based on the caller's area code is technically fragile and legally risky.

The safest implementation requires the agent to explicitly identify itself as AI and declare the recording status in the very first sentence10. A compliant opening formulation is:

*"Hi, thanks for calling \[Business Name\]. I am their AI receptionist on a recorded line. How can I help you today?"*

This single sentence discharges the Utah regulated-occupation duty, the California BOTS duty, the Maine aural bot duty, and the multi-state all-party recording consent requirement simultaneously17.

Additionally, operators should consider utilizing cryptographic watermarking. Best practices include embedding in-band acoustic watermarks in the 18–20kHz range or attaching SIP header extensions (e.g., X-Synthetic-Audio-Signature) to mark provenance10.

## **4\. Twilio and ElevenLabs Integration Architecture**

Integrating Twilio with ElevenLabs to facilitate real-time, low-latency conversational AI requires shifting away from traditional REST APIs and TwiML verb sequences. The architecture must rely entirely on bidirectional WebSockets via Twilio Media Streams to stream raw audio frames in real-time.

### **4.1 Transport Protocols and Codec Alignment**

When a call connects, Twilio must be instructed via a \<Connect\>\<Stream\> TwiML response to open a persistent WebSocket connection to the application server24. This bypasses the severe latency of generating and downloading complete audio files, which inherently prevents real-time conversation2.

The integration demands precise codec alignment to prevent costly audio transcoding overhead. Twilio Media Streams natively encode audio in audio/x-mulaw (µ-law or G.711) at an 8,000 Hz sample rate6. Twilio transmits this audio as base64-encoded strings wrapped in JSON payloads every 20 milliseconds, resulting in 160-byte chunks24.

To minimize latency and avoid manual FFMPEG transcoding delays on the server, the ElevenLabs WebSocket API must be configured to output this exact format natively. By setting the ElevenLabs output\_format parameter to ulaw\_8000, the server receives chunks from ElevenLabs that can be directly passed into the Twilio WebSocket without intermediate processing26.

A critical configuration error frequently occurs regarding the Twilio Media Stream track parameter. By default, Twilio expects audio to only flow *from* the caller *to* the server (inbound). To allow the ElevenLabs agent's voice to be heard by the caller, the stream configuration must explicitly set track="outbound" or track="both\_tracks" in the initial payload24. Failure to set this results in a system where the AI hears the caller and transcribes the conversation, but the caller hears total silence24.

### **4.2 Latency Optimization and Overlapping Pipelines**

Achieving sub-second response times requires overlapping the LLM text generation with the TTS audio synthesis. As the LLM streams text tokens, the server must forward them to the ElevenLabs WebSocket immediately2. ElevenLabs buffers a minimal amount of text (typically around 50 characters) to establish prosodic context before streaming audio bytes back2. By opening the ElevenLabs WebSocket concurrently with the initial LLM API request, the system absorbs the WebSocket handshake latency while waiting for the LLM's first tokens, ensuring time-to-first-audio remains under the critical 400ms to 800ms window2.

ElevenLabs provides a configuration parameter called optimize\_streaming\_latency (accepting integer values from 0 to 4), which aggressively reduces inference time by bypassing certain text normalization processes26. Setting this to higher values (e.g., 3 or 4\) drastically cuts time-to-first-byte but risks mispronunciations of complex formats like dates and numbers26. This represents a deliberate architectural trade-off between absolute speed and acoustic accuracy. For environments where latency is the primary cause of call abandonment, pushing this parameter higher is often necessary26.

### **4.3 Fallback Infrastructure and Timeout Mitigation**

In the event of a primary server failure, WebSocket crash, or network congestion, Twilio provides a fallbackUrl mechanism. If the primary webhook fails to respond or returns an HTTP 500 error, Twilio automatically queries the fallback endpoint30.

The critical threshold here is Twilio's standard connection timeout. Twilio dictates that if the primary webhook does not respond within 15 seconds, the system aborts the connection attempt and routes to the fallback URL30. In an autonomous AI deployment, a 15-second silence is catastrophic; a caller will have hung up long before the fallback executes. Consequently, modern architectures must utilize Edge computing networks—such as Cloudflare Workers or Vercel Edge Functions—to ensure the initial TwiML payload is returned in single-digit milliseconds, offloading the heavy WebSocket logic to subsequent asynchronous routes30.

### **4.4 Data Privacy and Zero Retention Mode (ZRM)**

For businesses handling sensitive data, particularly healthcare clinics subjected to the Health Insurance Portability and Accountability Act (HIPAA), the system must guarantee that Protected Health Information (PHI) is not persistently logged by third-party infrastructure APIs31.

ElevenLabs offers an Enterprise-grade "Zero Retention Mode" (ZRM). When enabled, ElevenLabs ensures that no audio recordings, transcripts, or call metadata containing Personally Identifiable Information (PII) are stored on their servers post-call32. ZRM applies strict constraints to the underlying infrastructure: it disables raw audio cloud uploads, redacts sensitive entities from ephemeral processing logs, and restricts the available LLMs to a specific allowlist of highly secure models (such as Google Gemini, Anthropic Claude, and specific enterprise OpenAI endpoints)31. Furthermore, workspaces operating in ZRM cannot utilize external Model Context Protocol (MCP) servers, as this would require routing sensitive data through unverified third-party tools33.

Administrators must verify this privacy configuration programmatically to avoid compliance breaches. By executing a GET request to https://api.elevenlabs.io/v1/convai/agents/{agent\_id}, the platform returns the agent's full metadata object34. The backend can assert that privacy settings (like audio\_saving and retention limits) are strictly enforced before routing incoming patient calls to the agent34.

## **5\. Security Topologies in Multi-Tenant Supabase \+ Next.js Applications**

Deploying an AI toolkit for multiple small businesses via a single multi-tenant database (Supabase) and frontend (Next.js) introduces severe risks regarding cross-tenant data leakage and credential exposure. The boundaries between server-side execution and client-side rendering must be managed flawlessly.

### **5.1 Row Level Security (RLS) Performance and AST Analysis**

Supabase leverages PostgreSQL's Row Level Security (RLS) to enforce tenant isolation at the database kernel level36. A standard policy ensures that an authenticated user can only access rows where tenant\_id matches their specific session token.

However, a pervasive architectural error in Supabase implementations involves using volatile functions directly within RLS policies. Writing a policy condition as using (auth.uid() \= user\_id) forces the PostgreSQL query planner to evaluate the auth.uid() function sequentially for every single row in the table36. At scale, this causes catastrophic query latency, with Supabase's internal benchmarks showing query execution times degrading from 12 milliseconds to over 178,000 milliseconds in worst-case scenarios37. The optimized architectural pattern requires wrapping the function in a scalar subquery: using ((select auth.uid()) \= user\_id). This subtle syntax change forces the PostgreSQL planner to treat the evaluation as an InitPlan, executing the function only once per query regardless of table size36.

Furthermore, RLS fails silently. If a policy is misconfigured, or if a foreign key in a USING clause lacks a database index, the application will not crash. Instead, it will silently execute a full table scan, or worse, return rows belonging to another tenant37. Because standard unit tests often miss these edge cases, automated detection is imperative. Tools like supabase db lint perform Abstract Syntax Tree (AST) based static analysis to detect unindexed foreign key joins in policies, infinite recursion loops in self-referencing subqueries, and insecure SECURITY DEFINER RPC functions that lack proper schema scoping38.

### **5.2 Next.js Static Bundle Leakage (NEXT\_PUBLIC\_)**

The Next.js framework utilizes a specific build-time convention for environment variables: any variable prefixed with NEXT\_PUBLIC\_ is automatically inlined into the static JavaScript client bundle distributed to the browser39. Variables lacking this prefix remain securely on the server40.

A critical security anti-pattern occurs when developers, attempting to access third-party APIs from the client side, prefix highly sensitive secrets (e.g., NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY or NEXT\_PUBLIC\_STRIPE\_SECRET\_KEY)37. This permanently embeds the master secret into the HTML/JS source code delivered to every user visiting the site39.

The Supabase Service Role Key bypasses all Postgres RLS policies entirely36. Exposing it grants unmitigated read, write, and delete access to the entire multi-tenant database37. Service keys must never be prefixed with NEXT\_PUBLIC\_ and must be strictly confined to secure Node.js environments, such as Next.js Server Actions or API Route Handlers37. To automatically detect these leaks, Vercel has introduced build-time warnings that utilize anchored regular expressions to detect high-entropy credential shapes (such as Stripe sk\_live\_, AWS AKIA, or Supabase JWTs) assigned to NEXT\_PUBLIC\_ variables39. These warnings flag misconfigurations before the bundle is compiled and deployed39.

## **6\. Operational Fleet Management and Configuration Drift**

When an agency or SaaS toolkit deploys hundreds of near-identical AI front desks across various small businesses, the primary operational challenge shifts from software engineering to fleet state management. Configurations drift, tokens expire, and infrastructure degrades silently.

### **6.1 Domain Verification and Email Deliverability**

For the platform to successfully dispatch post-call summaries, urgent notifications, or SMS recovery links via email, it relies heavily on transactional email providers like Resend43. A widespread operational failure occurs when a client updates their DNS records, inadvertently deleting DKIM or SPF records. This causes their sending domain to become unverified, resulting in all post-call alerts silently bouncing while the AI continues to take calls.

To detect this degradation before the client notices missing alerts, the system must utilize Resend's API to poll domain statuses proactively. By executing a scheduled GET request to /domains/{domain\_id}, the operations team can monitor the status field in the JSON response43. If the status regresses from "verified" back to "not\_started", the system can trigger an automated alert to the agency administrator to resolve the DNS issue immediately, preventing a total loss of communications43.

### **6.2 Webhook Rot and Token Expiration**

AI agents rely intrinsically on webhooks to trigger downstream actions, such as calendar lookups, CRM writes, or scheduling algorithms33. When a client updates their CRM platform, changes a password, or when an OAuth token naturally expires, the webhook endpoint begins returning HTTP 401 (Unauthorized) or 404 (Not Found) errors.

Because modern conversational AI agents (like those powered by ElevenLabs) are designed to handle errors gracefully, the bot will simply state to the caller, "I'm sorry, I couldn't access the calendar right now, can someone call you back?"4. While this is a polite UX degradation, the business owner remains entirely unaware of the underlying system failure until they notice a severe decline in bookings days later5.

Proactive fleet management requires continuous log aggregation and alerting. Telephony webhooks and Cloudflare Workers must emit OpenTelemetry traces or rely on triage tickets to monitor failure rates9. If an endpoint fails consecutively, an automated circuit breaker must notify the system administrator instantly, intercepting the failure before client trust is eroded.

## **7\. Ten Things a Better Implementation Should Do**

Based on the empirical evidence, legal parameters, and architectural constraints analyzed in this report, a production-grade AI front desk implementation must adhere to the following ten mandates:

> 1. **Mandate Sub-Second Time-to-First-Byte:** The architecture must stream LLM text tokens directly to the TTS WebSocket concurrently to absorb connection overhead, maintaining total system latency well below the 1,000-millisecond Doherty threshold to prevent call abandonment1.  
> 2. **Implement Dual-Signal Barge-in Detection:** Do not rely solely on raw Voice Activity Detection (VAD). Utilize secondary acoustic energy classifiers to differentiate between sustained caller speech intent and affirmative conversational backchannels (e.g., "mm-hmm") to prevent fragile resets and endless looping1.  
> 3. **Execute Synchronous Direct Writes:** The agent must interface directly with scheduling APIs (e.g., Calendly, Google Calendar) to commit bookings while the caller is still on the line, eliminating the 21x conversion drop-off associated with generating asynchronous CRM follow-up tasks1.  
> 4. **Deploy Immediate SMS Abandonment Recovery:** Implement automatic webhook triggers that dispatch a booking link via SMS if a call terminates unexpectedly past a predefined conversational threshold, mitigating the standard 10-15% inbound abandonment rate1.  
> 5. **Enforce the Universal Safe Harbor Greeting:** Hardcode the agent's opening prompt to explicitly state, *"I am the AI assistant on a recorded line,"* to universally satisfy Utah's regulated-occupation rules, California's BOTS act, Maine's aural bot laws, and all-party consent wiretapping statutes10.  
> 6. **Strict Separation of Inbound and Outbound Logic:** Never co-mingle inbound customer service flows with outbound promotional dials. Outbound AI calls require prior express written consent, and violating this exposes the platform to devastating TCPA statutory damages of up to $1,500 per call17.  
> 7. **Align Edge Codecs to µ-law (G.711):** Prevent transcoder latency by configuring the ElevenLabs output format natively to ulaw\_8000. This perfectly matches Twilio's required 160-byte base64 Media Stream chunks, eliminating the need for server-side FFMPEG manipulation24.  
> 8. **Assert Zero Retention Mode (ZRM) Programmatically:** For healthcare or high-security tenants, utilize the GET /v1/convai/agents/{agent\_id} API endpoint to assert that ZRM is active prior to call routing, ensuring that PHI is not recorded in violation of HIPAA Business Associate Agreements31.  
> 9. **Optimize Supabase RLS via InitPlans:** Prevent multi-tenant database locking and massive query latency spikes by wrapping auth.uid() calls in (select auth.uid()) subqueries within PostgreSQL policies, forcing the query planner to evaluate the token once per query36.  
> 10. **Sanitize Next.js Build Environments via AST Linting:** Strictly audit all NEXT\_PUBLIC\_ prefixed environment variables and employ AST-based static analysis (like supabase db lint) to ensure no Supabase service-role keys or high-entropy secrets are ever compiled into the static client bundles distributed to users' browsers37.

#### **Works cited**

> 1. the 7 things an AI receptionist actually needs to do well in 2026, and, [https://www.reddit.com/r/AIReceptionists/comments/1tc6od5/the\_7\_things\_an\_ai\_receptionist\_actually\_needs\_to/](https://www.reddit.com/r/AIReceptionists/comments/1tc6od5/the_7_things_an_ai_receptionist_actually_needs_to/)  
> 2. How ElevenLabs Streams Voice in Real Time: The Top Engineering, [https://codingclutch.com/how-elevenlabs-streams-voice-real-time/](https://codingclutch.com/how-elevenlabs-streams-voice-real-time/)  
> 3. My experience testing voice AI agents (Bland, Synthflow, Retell), [https://www.reddit.com/r/AI\_Agents/comments/1nwlk5z/my\_experience\_testing\_voice\_ai\_agents\_bland/](https://www.reddit.com/r/AI_Agents/comments/1nwlk5z/my_experience_testing_voice_ai_agents_bland/)  
> 4. Has anybody launched an AI Receptionist for a client that hasn't, [https://www.reddit.com/r/AIReceptionists/comments/1t6srub/has\_anybody\_launched\_an\_ai\_receptionist\_for\_a/](https://www.reddit.com/r/AIReceptionists/comments/1t6srub/has_anybody_launched_an_ai_receptionist_for_a/)  
> 5. An AI receptionist can't catch its own dropped promises, and ... \- Reddit, [https://www.reddit.com/r/VoiceAutomationAI/comments/1utdo8c/an\_ai\_receptionist\_cant\_catch\_its\_own\_dropped/](https://www.reddit.com/r/VoiceAutomationAI/comments/1utdo8c/an_ai_receptionist_cant_catch_its_own_dropped/)  
> 6. We Wasted 6 Months on AI Voice Tools Before Realizing None of, [https://medium.com/ai-governance-playbook/we-wasted-6-months-on-ai-voice-tools-before-realizing-none-of-them-actually-work-and-how-we-fixed-09072fde0b2b](https://medium.com/ai-governance-playbook/we-wasted-6-months-on-ai-voice-tools-before-realizing-none-of-them-actually-work-and-how-we-fixed-09072fde0b2b)  
> 7. Scared to use an AI receptionist in case customers hate it ... \- Reddit, [https://www.reddit.com/r/AI\_Agents/comments/1uqpu7n/scared\_to\_use\_an\_ai\_receptionist\_in\_case/](https://www.reddit.com/r/AI_Agents/comments/1uqpu7n/scared_to_use_an_ai_receptionist_in_case/)  
> 8. AI Voice Inbound Handbook \- OCP Wiki, [https://ocp.wiki/docs/ai-voice/inbound-handbook](https://ocp.wiki/docs/ai-voice/inbound-handbook)  
> 9. List workspace tickets | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/api-reference/triage-tickets/list-for-workspace](https://elevenlabs.io/docs/eleven-agents/api-reference/triage-tickets/list-for-workspace)  
> 10. A Developer's Checklist for AI Voice Agent Disclosure Compliance, [https://dev.to/ecosmob\_technologies/a-developers-checklist-for-ai-voice-agent-disclosure-compliance-2il5](https://dev.to/ecosmob_technologies/a-developers-checklist-for-ai-voice-agent-disclosure-compliance-2il5)  
> 11. FCC Requires Consent for AI-Generated Cloned Voice Calls | 2024, [https://www.mcdermottlaw.com/insights/fcc-requires-consent-for-ai-generated-cloned-voice-calls/](https://www.mcdermottlaw.com/insights/fcc-requires-consent-for-ai-generated-cloned-voice-calls/)  
> 12. AI Voice Agent Compliance: TCPA Rules, FCC Requirements, [https://www.henson-legal.com/ai-voice-compliance](https://www.henson-legal.com/ai-voice-compliance)  
> 13. TCPA Compliance for Voice AI: Consent, DNC, and Revocation, [https://www.plura.ai/articles/tcpa-compliant-conversational-ai](https://www.plura.ai/articles/tcpa-compliant-conversational-ai)  
> 14. AI Disclosure Requirements for Voice Agents \- Thoughtly, [https://thoughtly.com/blog/ai-disclosure-requirements-what-to-tell-callers](https://thoughtly.com/blog/ai-disclosure-requirements-what-to-tell-callers)  
> 15. FCC rules that consent is required for AI-generated voices in, [https://bankingjournal.aba.com/2024/02/fcc-rules-that-consent-required-for-ai-generated-voices-in-outbound-calls/](https://bankingjournal.aba.com/2024/02/fcc-rules-that-consent-required-for-ai-generated-voices-in-outbound-calls/)  
> 16. Acceptable Use Policy \- MagicBlocks, [https://magicblocks.ai/aup](https://magicblocks.ai/aup)  
> 17. Terms of Service \- Navda AI, [https://www.navda-ai.com/terms-of-service.html](https://www.navda-ai.com/terms-of-service.html)  
> 18. The 2026 TCPA Compliance Playbook for Voice AI Outbound, [https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound)  
> 19. Is an AI Receptionist Legal? 2026 Disclosure Rules \- AIEmply, [https://aiemply.com/blog/ai-receptionist-disclosure-laws](https://aiemply.com/blog/ai-receptionist-disclosure-laws)  
> 20. FCC NPRM 24-84: Pending AI-Call Disclosure Rules \- Zian AI, [https://www.zian.ai/fcc-nprm-24-84-ai-call-disclosure-rules/](https://www.zian.ai/fcc-nprm-24-84-ai-call-disclosure-rules/)  
> 21. Do I actually need to tell callers they're talking to an AI? \- Reddit, [https://www.reddit.com/r/n8n/comments/1nf5ofi/do\_i\_actually\_need\_to\_tell\_callers\_theyre\_talking/](https://www.reddit.com/r/n8n/comments/1nf5ofi/do_i_actually_need_to_tell_callers_theyre_talking/)  
> 22. The 5 Best AI Voice Agents (By Type & Function) \[2026\] \- Leland, [https://www.joinleland.com/library/a/ai-voice-agents](https://www.joinleland.com/library/a/ai-voice-agents)  
> 23. AI Chatbots: How to Address Five Key Legal Risks \- Wiley Rein, [https://www.wiley.law/alert-AI-Chatbots-How-to-Address-Five-Key-Legal-Risks](https://www.wiley.law/alert-AI-Chatbots-How-to-Address-Five-Key-Legal-Risks)  
> 24. Twilio Media Streams \+ ElevenLabs \+ OpenAI (Python), [https://stackoverflow.com/questions/79624529/twilio-media-streams-elevenlabs-openai-python-call-connects-transcripts](https://stackoverflow.com/questions/79624529/twilio-media-streams-elevenlabs-openai-python-call-connects-transcripts)  
> 25. Twilio WebSocket \+ OpenAI \+ ElevenLabs Audio Streaming Issue, [https://community.latenode.com/t/python-real-time-voice-bot-twilio-websocket-openai-elevenlabs-audio-streaming-issue/36927](https://community.latenode.com/t/python-real-time-voice-bot-twilio-websocket-openai-elevenlabs-audio-streaming-issue/36927)  
> 26. elevenlabs-python/src/elevenlabs/speech\_to\_speech/client.py at main, [https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/speech\_to\_speech/client.py](https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/speech_to_speech/client.py)  
> 27. Bad API Quality \- Help : r/ElevenLabs \- Reddit, [https://www.reddit.com/r/ElevenLabs/comments/1epgybg/bad\_api\_quality\_help/](https://www.reddit.com/r/ElevenLabs/comments/1epgybg/bad_api_quality_help/)  
> 28. API Response Time \[stream-input\] · Issue \#134 · elevenlabs ... \- GitHub, [https://github.com/elevenlabs/elevenlabs-python/issues/134](https://github.com/elevenlabs/elevenlabs-python/issues/134)  
> 29. Python API vs REST API · Issue \#111 · elevenlabs ... \- GitHub, [https://github.com/elevenlabs/elevenlabs-python/issues/111](https://github.com/elevenlabs/elevenlabs-python/issues/111)  
> 30. Call resource | Twilio, [https://www.twilio.com/docs/voice/api/call-resource](https://www.twilio.com/docs/voice/api/call-resource)  
> 31. HIPAA | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/legal/hipaa](https://elevenlabs.io/docs/eleven-agents/legal/hipaa)  
> 32. Zero Retention Mode (per-agent) | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm](https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm)  
> 33. Model Context Protocol | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)  
> 34. Get agent | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/api-reference/agents/get](https://elevenlabs.io/docs/eleven-agents/api-reference/agents/get)  
> 35. Privacy | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/customization/privacy](https://elevenlabs.io/docs/eleven-agents/customization/privacy)  
> 36. Row Level Security | Supabase Docs, [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)  
> 37. A runnable reproduction of the Next.js \+ Supabase RLS leak (red on, [https://github.com/vercel/next.js/discussions/96888](https://github.com/vercel/next.js/discussions/96888)  
> 38. \[Feature Request\] AST-based Static RLS Linter & Hybrid Search, [https://github.com/supabase/cli/issues/5992](https://github.com/supabase/cli/issues/5992)  
> 39. Secret leak prevention out of the box · vercel next.js \- GitHub, [https://github.com/vercel/next.js/discussions/33386](https://github.com/vercel/next.js/discussions/33386)  
> 40. Confused about usage of process.env · Issue \#22266 · vercel/next.js, [https://github.com/vercel/next.js/issues/22266](https://github.com/vercel/next.js/issues/22266)  
> 41. \[next.config.js\] environment passes into the client code \#24741, [https://github.com/vercel/next.js/discussions/24741](https://github.com/vercel/next.js/discussions/24741)  
> 42. Environment variables exposed on the client · vercel next.js \- GitHub, [https://github.com/vercel/next.js/discussions/23980](https://github.com/vercel/next.js/discussions/23980)  
> 43. Retrieve Domain \- Resend, [https://resend.com/docs/api-reference/domains/get-domain](https://resend.com/docs/api-reference/domains/get-domain)  
> 44. Create agent | ElevenLabs Documentation, [https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create](https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create)