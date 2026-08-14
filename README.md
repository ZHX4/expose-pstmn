# expose-pstmn

A local integration gateway for exposing Postman AI capabilities to developer tooling through a controlled, OpenAI-compatible interface.

> **Project status:** Phase 1 — repository foundation.
>
> No Postman authentication, model access, UI automation, MCP integration, or AI gateway is implemented yet. Those integrations will only be added after the relevant Postman capability is verified.

## Goals

- Provide a small local gateway that can eventually be consumed by tools such as VS Code, Codex, Claude Code, and custom applications.
- Keep Postman-specific logic behind provider adapters.
- Prefer documented and supported Postman interfaces over UI automation.
- Never bypass authentication, AI-credit limits, billing controls, or other service protections.
- Make the local gateway secure by default: localhost-only binding, explicit authentication, bounded concurrency, structured errors, and safe logging.
- Keep the OpenAI-compatible protocol separate from the upstream provider implementation.

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

The exact provider path is intentionally not hard-coded during Phase 1. The discovery phase will establish which Postman interfaces can legitimately reach the models available to the user's account.

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
```

Build JavaScript and declaration files:

```bash
npm run build
```

Run the compiled CLI:

```bash
node dist/cli.js --help
node dist/cli.js version
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
├── providers/      Postman/provider adapters (future)
└── protocols/      External protocol schemas and adapters (future)

tests/              Automated tests
scripts/             Development/verification scripts (future)
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
