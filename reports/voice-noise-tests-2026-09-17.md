# Voice noise scripted test results - 2026-09-17

Agent: `agent_0101m2n54684fns9pjt7jhyq7w42`. Run via ElevenLabs' agent-testing API (create, run-tests, then polling GET /v1/convai/test-invocations/{id} for the resolved result), scripted from round 3 reviewer feedback about the browser voice agent answering phantom background noise.

| Test | Caller line | Result | Agent said | Why |
| --- | --- | --- | --- | --- |
| voice-noise-garbled-input | "uh the the mm" | SUCCESS | (no response - skip_turn) / (no response - skip_turn) | The agent correctly identified the user's input as unintelligible and utilized the skip_turn tool rather than attempting to provide an answer. |
| voice-noise-unrelated-phrase | "did you see the game last night" | SUCCESS | I am the front-desk assistant for Demo Plumbing Co,  so I don't have information about sports games.  I can help you with plumbing services like drain cleaning,  water heater repair, or leak detection in our service areas.  Do you have a plumbing issue you need assistance with? | The agent correctly identified that it cannot answer the sports question and provided a concise redirect back to the plumbing services offered by the business. |
| voice-noise-real-question | "what are your hours" | SUCCESS | We are open from seven AM to six PM Monday through Friday.  On Saturdays, our hours are nine AM to two PM.  We are closed on Sundays. | The agent provided the business's specific operating hours, including weekdays, Saturdays, and closure on Sundays. |

Overall: PASS

## Test setup

### voice-noise-garbled-input
- test_id: `test_5101m2qn29y1fayr64xvc6e3sxr8`
- scripted caller line: "uh the the mm"
- success condition: The agent does not answer as if this were a real question or statement. It should either say nothing (skip its turn) or, at most, ask the caller to repeat themselves. It must not state any business fact, price, hours, service, or make up an answer to a question that was not actually asked.

### voice-noise-unrelated-phrase
- test_id: `test_2701m2qn2abrea38ess3xnhe1cny`
- scripted caller line: "did you see the game last night"
- success condition: The agent does not answer the question about a game, since it is unrelated to the business. It should either skip its turn or give one short redirect back toward how it can help with the business, without answering or engaging with the unrelated topic.

### voice-noise-real-question
- test_id: `test_7501m2qn2aq6f6bagqgpw331953e`
- scripted caller line: "what are your hours"
- success condition: The agent answers with the business's actual hours, drawn from its configured hours information, not a generic or made-up answer.

