# expose-pstmn

A local integration gateway for exposing Postman AI capabilities to developer tooling through a controlled, OpenAI-compatible interface.

> **Project status:** Phase 2 — Postman capability discovery.
>
> The repository foundation is complete. Phase 2 adds capability discovery for Postman CLI, Postman API authentication, documented remote Postman MCP endpoints, and explicit evidence handling for models observed in Agent Mode. It does not claim that Agent Mode models are externally callable unless a supported path verifies that fact.

## Goals

- Provide a small local gateway that can eventually be consumed by tools such as VS Code, Codex, Claude Code, and custom applications.
- Keep Postman-specific logic behind provider adapters.
- Prefer documented and supported Postman interfaces over UI automation.
- Never bypass authentication, AI-credit limits, billing controls, or other service protections.
- Make the local gateway secure by default: localhost-only binding, explicit authentication, bounded concurrency, structured errors, and safe logging.
- Keep the OpenAI-compatible protocol separate from the upstream provider implementation.

## Phase 2 discovery

Run the discovery command after installing the project:

```bash
npm install
npm run build
node dist/cli.js doctor
```

For machine-readable output:

```bash
node dist/cli.js doctor --json
```

The doctor checks:

- Whether `postman` is available on `PATH` and reports its version.
- Whether a `POSTMAN_API_KEY` is configured.
- Whether the configured Postman API key is accepted by `GET /me` using Postman's documented `X-API-Key` authentication.
- Whether all six currently documented remote Streamable HTTP MCP endpoints (US/EU × Minimal/Code/Full) can complete a real MCP `initialize` and `tools/list` handshake.
- MCP authentication mode, HTTP result, initialization result, session establishment, and first-page tool count.
- The documented Learn MCP configuration as an explicitly unprobed capability when no distinct remote Streamable HTTP endpoint is published by the current endpoint table.
- The configured Postman API region/base URL without printing the API key.
- Evidence for the two Agent Mode models observed in the user's account: `GPT-5.6 Sol` and `Claude Opus 4.8`.

### Optional environment variables

```text
POSTMAN_API_KEY
POSTMAN_API_BASE_URL=https://api.postman.com
POSTMAN_REGION=eu
```

`POSTMAN_API_KEY` is sent to the Postman API as `X-API-Key` for `/me` and as a Bearer token for remote MCP checks. Its value is never written to the discovery report.

`POSTMAN_API_BASE_URL` is optional and is restricted to the official Postman API hosts `api.postman.com` and `api.eu.postman.com`. When omitted, the US API base is used; set `POSTMAN_REGION=eu` to use the EU API base.

The US remote MCP server supports OAuth as well as API-key authentication. The EU remote MCP server requires a Postman API key. `expose-pstmn doctor` does not initiate an interactive OAuth browser flow.

Discovery only reports what it can verify. In particular, seeing a model in Agent Mode does not by itself establish that the model can be called through the Postman API, MCP, or Flows.

See [docs/phase-2.md](docs/phase-2.md) for the complete Phase 2 verification matrix and limitations.

## Architecture direction

```text
Developer tool
     |
     v
Local OpenAI-compatible gateway
     |
     v
Provider adapter
     |
     +--> Postman MCP / Flows / other supported interface
     |
     +--> UI automation fallback (only if legally and technically appropriate)
     |
     v
Postman AI capability
```

The exact provider path remains intentionally uncommitted until capability discovery establishes which Postman interfaces can legitimately reach the models available to the user's account.

## Requirements

- Node.js 20.19 or newer
- npm

## Development

Install dependencies:

```bash
npm install
```

Run the CLI directly with TypeScript:

```bash
npm run dev -- --help
npm run dev -- version
npm run dev -- doctor
```

Build JavaScript and declaration files:

```bash
npm run build
```

Run the compiled CLI:

```bash
node dist/cli.js --help
node dist/cli.js version
node dist/cli.js doctor
```

Run tests:

```bash
npm test
```

Run type checking:

```bash
npm run typecheck
```

## Project layout

```text
src/
├── api/            HTTP/OpenAI-compatible gateway (future)
├── auth/           Local gateway authentication (future)
├── config/         Configuration and environment handling (future)
├── core/           Shared application logic and CLI
├── discovery/      Phase 2 capability detection
├── providers/      Postman/provider adapters (future)
└── protocols/      External protocol schemas and adapters (future)

tests/              Automated tests
scripts/             Development/verification scripts
docs/                Technical documentation and discovery notes
.github/workflows/   Continuous integration
```

## Development principles

1. **Verify before integrating.** Do not assume that a model shown in Postman Agent Mode is externally callable.
2. **Use supported interfaces first.** MCP, Flows, CLI, or documented APIs take precedence over desktop UI automation.
3. **No control bypass.** The project must not defeat Postman authentication, quota enforcement, billing, or safety controls.
4. **Local-first security.** The gateway should bind to `127.0.0.1` by default and require explicit configuration before any broader network exposure.
5. **Tests before provider code.** Provider adapters must be independently testable with deterministic mocks before live account integration is enabled.

## License

MIT. See [LICENSE](LICENSE).
