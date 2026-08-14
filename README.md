# expose-pstmn

A local integration gateway for exposing Postman capabilities to developer tooling through a controlled, OpenAI-compatible interface.

> **Project status:** Phase 4 — local HTTP gateway.
>
> Phase 4 adds the localhost-only gateway boundary. The gateway is ready for OpenAI-compatible clients and Postman tool access, but model completion remains disabled until a provider exposes a verified model interface.

## Goals

- Provide a small local gateway for tools such as VS Code, Codex, Claude Code, and custom applications.
- Keep Postman-specific logic behind provider adapters.
- Prefer documented and supported Postman interfaces over UI automation.
- Never bypass authentication, AI-credit limits, billing controls, or other service protections.
- Secure the gateway by default with localhost-only binding, explicit local authentication, bounded concurrency, request-size limits, rate limiting, structured JSON errors, and request IDs.
- Keep the OpenAI-compatible protocol separate from the upstream provider implementation.

## Phase 2 discovery

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js doctor --json
```

Discovery verifies the Postman CLI, Postman API authentication, documented MCP endpoints, MCP initialization, and models observed in Agent Mode. Agent Mode model visibility is evidence only and is not treated as proof of external model access.

## Phase 3 provider integration

The provider layer supports:

- MCP initialization and protocol negotiation.
- `notifications/initialized` lifecycle handling.
- `tools/list`.
- `tools/call`.
- Bearer API-key authentication for non-interactive Postman MCP access.
- Official Postman MCP host validation.
- Environment-driven endpoint/region selection.
- Provider health and explicit capability reporting.

The provider explicitly advertises model completion as unsupported until a supported Postman model interface is independently verified.

### Postman configuration

```text
POSTMAN_API_KEY
POSTMAN_REGION=us|eu
POSTMAN_MCP_ENDPOINT=https://mcp.postman.com/minimal
```

Provider commands:

```bash
node dist/cli.js provider status
node dist/cli.js provider tools
```

## Phase 4 local gateway

Phase 4 adds the HTTP boundary consumed by local developer tooling.

### Start

Set a local gateway secret and start the server:

```text
EXPOSE_PSTMN_API_KEY=choose-a-local-secret
```

```bash
npm install
npm run build
node dist/cli.js gateway start
```

The gateway binds only to `127.0.0.1` or `localhost` in Phase 4.

### Gateway configuration

```text
EXPOSE_PSTMN_API_KEY=choose-a-local-secret
EXPOSE_PSTMN_HOST=127.0.0.1
EXPOSE_PSTMN_PORT=8787
EXPOSE_PSTMN_MAX_BODY_BYTES=1048576
EXPOSE_PSTMN_MAX_CONCURRENT=4
EXPOSE_PSTMN_REQUEST_TIMEOUT_MS=30000
EXPOSE_PSTMN_RATE_LIMIT_PER_MINUTE=60
```

### Endpoints

```text
GET  /healthz
GET  /v1/models
GET  /v1/provider
GET  /v1/postman/tools
POST /v1/postman/tools/call
POST /v1/chat/completions
```

Protected endpoints require:

```http
Authorization: Bearer <EXPOSE_PSTMN_API_KEY>
```

`/v1/chat/completions` accepts an OpenAI-compatible request shape, validates it, and currently returns a standards-shaped `501` error because Phase 3 has not verified an externally callable model-completion provider.

Example:

```bash
curl http://127.0.0.1:8787/v1/models \
  -H "Authorization: Bearer $EXPOSE_PSTMN_API_KEY"
```

The response is currently:

```json
{
  "object": "list",
  "data": []
}
```

This is intentional. The gateway must not fabricate model availability.

## Architecture

```text
Developer tool
     |
     v
Local HTTP gateway (Phase 4)
     |
     v
Provider interface
     |
     +--> Postman MCP provider
     |
     +--> future verified model provider
     |
     v
Postman capabilities
```

## Security model

The Phase 4 gateway:

- listens only on loopback;
- requires a gateway-specific local API key;
- compares the gateway key using a timing-safe comparison;
- enforces request-body limits;
- limits concurrent application work;
- enforces a configurable per-minute rate limit;
- sets a request ID on each response;
- disables caching on JSON responses;
- keeps Postman credentials separate from gateway credentials.

Broader network exposure is deliberately deferred until it receives a dedicated security review.

## Requirements

- Node.js 20.19 or newer
- npm

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

## Project layout

```text
src/
├── api/            Local HTTP/OpenAI-compatible gateway
├── auth/           Reserved for future shared auth abstractions
├── config/         Reserved for future centralized configuration
├── core/           CLI, discovery, provider, and gateway orchestration
├── discovery/      Postman capability detection
├── providers/      Provider contracts and Postman MCP implementation
└── protocols/      Future protocol adapters

tests/              Automated tests
scripts/            Development/verification scripts
docs/               Technical documentation
.github/workflows/  Continuous integration
```

## Development principles

1. Verify before integrating.
2. Use supported interfaces first.
3. Never bypass authentication, quotas, billing, or other service protections.
4. Keep the gateway local by default.
5. Treat model completion as unsupported until it is externally verified.
6. Keep provider integrations independently testable with deterministic mocks.

## License

MIT. See [LICENSE](LICENSE).
