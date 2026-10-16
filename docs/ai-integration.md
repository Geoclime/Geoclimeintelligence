# AI Integration (foundation)

## What was built

The **skeleton** of a multi-provider AI layer, following [`ai-integration-prompt.md`](../ai-integration-prompt.md). Nothing calls a real AI provider yet, no table exists, and no route is mounted. What exists is the shape every later piece plugs into, plus the small pure building blocks that are fully working and tested:

| Piece | State |
|---|---|
| Provider contract (`AiProvider`, error kinds, `isAccountProblem`) | Done |
| Provider registry and four adapters (Anthropic, OpenAI, Gemini, Ollama) | Placeholders: every call fails as `unavailable` |
| Key encryption (`seal` / `open`, AES-256-GCM with the owner bound in) | Done, tested |
| Ollama address guard (`checkServerAddress`) and model tiers | Done, tested |
| Error mapping (`toRequestError`, `AiRequestError`, `NEEDS_PAYER_ACTION`) | Done, tested |
| Reply helpers (`parseJson`, lenient Zod helpers, `fit`, `inert`) | Done, tested |
| `AiService` (the only entry point for feature code) | Skeleton: final signatures; reports "not set up" |
| Who may use AI (`AI_ACCESS`) | Starting role lists, still to confirm |
| Env vars | `AI_KEYS_SECRET`, `AI_REQUEST_TIMEOUT_MS`, `AI_LONG_REQUEST_TIMEOUT_MS` |
| Client types (`client/src/types/ai.types.ts`) | Mirror of the server types |

## How it works

All server paths are relative to `server/src/modules/ai/`.

```
feature service (Phase 3) ──► AiService.generateJson / streamText      ai.service.ts
                                 ├─ resolve the key: own, then platform  IAiCredentialResolver (ai.types.ts)
                                 ├─ AiProvider (vendor adapter)          providers/
                                 ├─ parseJson → Zod → 1 retry            domain/parse-json.ts, domain/lenient.ts
                                 ├─ record usage (counts only)           IAiUsageRecorder (ai.types.ts)
                                 └─ failure → friendly AiRequestError    domain/ai-errors.ts
```

```
server/src/
├── common/crypto/secret-box.ts         seal/open for stored API keys
└── modules/ai/
    ├── ai.service.ts                   AiService: the only thing feature code calls
    ├── ai.types.ts                     credential, usage, request/result and status shapes
    ├── ai-access.ts                    role lists for authorise()
    ├── domain/
    │   ├── ai-features.ts              AI_FEATURES: the single list of feature names
    │   ├── ai-errors.ts                failure reasons and user-facing messages
    │   ├── lenient.ts                  forgiving Zod helpers, describeRejection, fit
    │   ├── parse-json.ts               reads JSON out of messy replies
    │   └── prompt-safety.ts            PROMPT_TAGS and inert()
    └── providers/
        ├── ai-provider.ts              the contract every vendor implements
        ├── providers.ts                registry + AiProviderResolver (injectable in tests)
        ├── anthropic|openai|gemini|ollama.provider.ts   placeholders
        ├── model-tiers.ts              cosmetic tier from the model name
        └── server-address.ts           SSRF guard for Ollama addresses
```

Rules the structure already enforces:
- **Feature code never imports a vendor SDK.** It calls `AiService`; adapters sit behind `AiProvider`.
- **Raw provider text never reaches a client.** `AiRequestError.provider` holds it for logs; the error handler sends only `message`.
- **Keys are bound to their owner.** The encryption context (`<userId or "platform">:<provider>`) is authenticated, so a key copied onto another user or provider will not decrypt.
- **Testable by injection.** `AiService` takes the provider resolver and credential resolver in its constructor, like the other services take repositories.

Tests: [`tests/unit/secret-box.test.ts`](../server/tests/unit/secret-box.test.ts) and [`tests/unit/ai-foundation.test.ts`](../server/tests/unit/ai-foundation.test.ts).

### What comes next (from the prompt's phases)

1. **Phase 1, foundation:** install the SDKs and fill in the four adapters; `ai_credentials` and `ai_usage_logs` migrations; `AiCredentialService` (verify a key with the provider before saving, encrypt, keep only the last 4 characters); the full `AiService` flow; routes under `/api/v1/ai` with `authorise`, `validate` and a 30-per-15-minutes rate limiter; mount them in `app.ts`.
2. **Phase 2, credits** (only if wanted): `ai_credit_accounts` and `ai_credit_transactions`, the single atomic balance update, refunds on failure.
3. **Phase 3, first features:** one domain file + one service per draft feature, added to `AI_FEATURES` on both sides. Each draft only fills a form; a person saves.
4. **Phase 4, settings UI:** keys card, per-feature models, credits.
5. **Phase 5, optional:** chat, background runs, reading uploaded material.

### Open decisions

These change the design, so they are answered before Phase 1:
- Which roles may use AI, and may `general_public` use the platform's key? (`AI_ACCESS` currently allows staff and researchers only.)
- Platform key plus each user's own key (the user's wins)? Credits on the platform key?
- The first 2–3 draft features for this domain, for example a plain-language summary of a ward's climate risk, or a draft incident or advisory note from map data.
- Which providers to switch on first.

## Resources to read

- [`ai-integration-prompt.md`](../ai-integration-prompt.md): the full design this follows.
- Node.js [`crypto` AES-GCM](https://nodejs.org/api/crypto.html#class-cipher): what `seal`/`open` use.
- OWASP [Server-Side Request Forgery](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): why `checkServerAddress` exists.
- [errors-and-responses.md](errors-and-responses.md) and [access-control.md](access-control.md): `AiRequestError` and `AI_ACCESS` build on these.

## Explain it like I'm new to this

Think of the AI layer as a power socket in the wall before any appliance is plugged in. The wiring (who pays, which key, what happens when something fails) is laid out so that every future AI feature plugs in the same way. Today the socket is off: there is nowhere to save an API key yet, so asking for AI politely answers "AI is not set up yet". The safety parts, such as locking API keys so only the right person's request can unlock them, and refusing addresses on our private network, already work and are tested.
