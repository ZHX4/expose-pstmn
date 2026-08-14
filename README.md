# expose-pstmn

A local integration gateway for exposing Postman capabilities to developer tooling through a controlled, OpenAI-compatible interface.

> **Project status:** Phase 3 — provider abstraction and Postman MCP integration.
>
> Phase 3 adds a provider boundary and a real Postman MCP client. It does not claim that Agent Mode models are externally callable.

## Goals

- Provide a small local gateway that can eventually be consumed by tools such as VS Code, Codex, Claude Code, and custom applications.
- Keep Postman-specific logic behind provider adapters.
- Prefer documented and supported Postman interfaces over UI automation.
- Never bypass authentication, AI-credit limits, billing controls, or other service protections.
- Make the local gateway secure by default: localhost-only binding, explicit authentication, bounded concurrency, structured errors, and safe logging.
- Keep the OpenAI-compatible protocol separate from the upstream provider implementation.

## Phase 2 discovery

Run capability discovery:

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js doctor --json
```

Discovery verifies the Postman CLI, Postman API authentication, documented MCP endpoints, MCP initialization, and the models observed in Agent Mode. Agent Mode model visibility is recorded as evidence only and is not treated as proof of external model access.

## Phase 3 provider integration

Phase 3 adds a provider abstraction and a Postman MCP provider.

The provider supports:

- MCP initialization and protocol negotiation.
- `notifications/initialized` lifecycle handling.
- `tools/list`.
- `tools/call`.
- Bearer API-key authentication for non-interactive Postman MCP access.
- Official Postman MCP host validation.
- Environment-driven endpoint/region selection.

The provider explicitly advertises model completion as unsupported until a supported Postman model interface is independently verified.

### Configuration

```text
POSTMAN_API_KEY
POSTMAN_REGION=us|eu
POSTMAN_MCP_ENDPOINT=https://mcp.postman.com/minimal
```

For non-interactive provider access, set `POSTMAN_API_KEY`. US MCP also supports OAuth, but this local Phase 3 provider intentionally does not initiate an interactive OAuth flow; without an API key it fails clearly instead of pretending authentication succeeded.

### Provider commands

```bash
node dist/cli.js provider status
node dist/cli.js provider tools
```

`provider status` initializes the configured MCP provider and reports whether it is ready.

`provider tools` returns the tools exposed by the configured Postman MCP server as JSON.

## Architecture

```text
Developer tool
     |
     v
Local gateway (future Phase 4)
     |
     v
Provider interface
     |
     +--> Postman MCP provider  <-- implemented in Phase 3
     |
     +--> future supported providers
     |
     v
Postman MCP capabilities
```

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
├── api/            HTTP/OpenAI-compatible gateway (Phase 4)
├── auth/           Local gateway authentication (future)
├── config/         Configuration and environment handling (future)
├── core/           CLI, discovery, and provider orchestration
├── discovery/      Postman capability detection
├── providers/      Provider contracts and Postman MCP implementation
└── protocols/      External protocol schemas and adapters (future)

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
