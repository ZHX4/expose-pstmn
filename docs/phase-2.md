# Phase 2 — Postman Capability Discovery

## Scope

Phase 2 answers five questions without claiming unsupported capabilities:

1. Is Postman CLI installed and runnable?
2. Is the configured Postman API key valid against `GET /me`?
3. Can the documented remote Postman MCP endpoints complete a real MCP `initialize` + `tools/list` exchange?
4. Which authentication path applies to each remote MCP region?
5. Which AI models are known from the user's Agent Mode evidence, and has their external callability actually been verified?

## Supported remote MCP endpoints

Postman currently documents the following Streamable HTTP remote endpoints in both US and EU regions:

| Configuration | US | EU |
|---|---|---|
| Minimal | `https://mcp.postman.com/minimal` | `https://mcp.eu.postman.com/minimal` |
| Code | `https://mcp.postman.com/code` | `https://mcp.eu.postman.com/code` |
| Full | `https://mcp.postman.com/mcp` | `https://mcp.eu.postman.com/mcp` |

The current Postman documentation also describes a **Learn** MCP configuration in the broader MCP feature set, but the remote Streamable HTTP endpoint table does not publish a distinct Learn URL. `expose-pstmn` records that fact as `unknown` and intentionally does not invent or probe an undocumented endpoint.

## Authentication

- US remote MCP supports OAuth and also accepts a Postman API key as a Bearer token.
- EU remote MCP requires a Postman API key as a Bearer token.
- `expose-pstmn` does not initiate an interactive browser OAuth flow during `doctor` discovery.
- `POSTMAN_API_KEY` is never printed or serialized into the discovery report.

## MCP protocol verification

A mere HTTP `GET` is not considered proof that an MCP endpoint works.

For each documented endpoint, discovery performs:

1. `POST` a JSON-RPC `initialize` request using Streamable HTTP.
2. Send `Authorization: Bearer <POSTMAN_API_KEY>` when an API key is configured.
3. Capture `Mcp-Session-Id` when the server establishes a session.
4. Verify that the server returns a negotiated MCP protocol version.
5. Send `tools/list` using the same session identifier when present.
6. Verify that `tools/list` returns a JSON-RPC result containing a `tools` array.
7. Record the number of tools returned on the first page.

A result is marked `protocol-ready` only when both initialization and `tools/list` succeed.

## AI model evidence

The project records the two models observed in the user's Postman Agent Mode UI:

- `GPT-5.6 Sol`
- `Claude Opus 4.8`

These are intentionally marked `externallyCallable: unknown` in Phase 2. Visibility in Agent Mode is not evidence of a public model API. External callability will only become `yes` after a supported provider path actually verifies it.

Postman AI Requests and Flows can interact with AI models and Postman documents AI Agent model selection, but those features do not by themselves prove that Agent Mode's exact model choices are exposed as a general-purpose external model endpoint.

## Command

```bash
npm install
npm run build
node dist/cli.js doctor
```

For automation:

```bash
node dist/cli.js doctor --json
```

## Environment

```text
POSTMAN_API_KEY=<your Postman API key>
POSTMAN_REGION=eu            # optional; otherwise inferred from POSTMAN_API_BASE_URL
POSTMAN_API_BASE_URL=https://api.postman.com   # optional; official US default
```

`POSTMAN_API_BASE_URL` is restricted to the official Postman API hosts:

- `https://api.postman.com`
- `https://api.eu.postman.com`

## Phase 2 completion criteria

Phase 2 is complete when the implementation:

- reports CLI availability/version;
- validates Postman API-key authentication with `/me` when a key is configured;
- probes all six documented remote Streamable HTTP endpoints;
- distinguishes reachability, authentication failure, MCP initialization failure, and protocol readiness;
- performs an actual `initialize` + `tools/list` MCP handshake;
- records session establishment and first-page tool counts;
- explicitly accounts for the documented Learn configuration without fabricating an undocumented endpoint;
- never leaks the API key in human or JSON output;
- records Agent Mode model evidence without falsely claiming external callability;
- has deterministic unit tests for MCP success and authentication failure paths.
