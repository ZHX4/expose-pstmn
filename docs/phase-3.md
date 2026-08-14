# Phase 3 — Provider abstraction and Postman MCP integration

Phase 3 adds a provider boundary and a real Postman MCP client without pretending that MCP tool access is the same thing as model completion.

## Implemented

- Provider interface with explicit capabilities.
- Postman MCP provider using Streamable HTTP.
- MCP `initialize` negotiation.
- `notifications/initialized` lifecycle step.
- `tools/list` discovery.
- `tools/call` execution.
- Bearer API-key authentication for non-interactive Postman MCP access.
- Official Postman MCP host validation.
- Environment-driven provider factory.
- `expose-pstmn provider status` and `expose-pstmn provider tools` commands.
- Deterministic tests can exercise the MCP client through mocked HTTP responses.

## Important boundary

The provider advertises `modelCompletion: false`. A Postman Agent Mode model appearing in the UI is not treated as an externally callable model until a supported model interface is verified.

## Configuration

```text
POSTMAN_API_KEY
POSTMAN_REGION=us|eu
POSTMAN_MCP_ENDPOINT=https://mcp.postman.com/minimal
```

For non-interactive provider access, an API key is required. The provider validates custom MCP endpoints against the official Postman MCP hosts and requires HTTPS.

## Commands

```bash
node dist/cli.js provider status
node dist/cli.js provider tools
```

`provider status` initializes MCP and verifies the connection. `provider tools` lists the tools exposed by the selected MCP configuration.
