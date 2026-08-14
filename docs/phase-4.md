# Phase 4 — Local HTTP gateway

Phase 4 adds the local gateway boundary that developer tooling can call without directly depending on the Postman MCP implementation.

## Scope

The gateway is intentionally localhost-only in Phase 4. It provides:

- `GET /healthz` for unauthenticated process health.
- `GET /v1/models` using the OpenAI list schema. It returns an empty list until a provider exposes a verified model-completion interface.
- `GET /v1/provider` for provider health and capabilities.
- `GET /v1/postman/tools` for provider tool discovery.
- `POST /v1/postman/tools/call` for provider tool execution.
- `POST /v1/chat/completions` with OpenAI-compatible request validation and explicit `501` responses while model completion remains unverified.

## Security

The gateway:

- binds only to `127.0.0.1` or `localhost`;
- requires `EXPOSE_PSTMN_API_KEY` before startup;
- authenticates protected routes with `Authorization: Bearer <local-key>`;
- compares secrets using a timing-safe comparison;
- imposes a configurable request-body limit;
- imposes a configurable per-minute request limit;
- limits concurrent application requests;
- adds an `X-Request-Id` header to every request;
- disables caching on JSON responses;
- does not expose Postman API credentials through the gateway.

## Environment

```text
EXPOSE_PSTMN_API_KEY=choose-a-local-secret
EXPOSE_PSTMN_HOST=127.0.0.1
EXPOSE_PSTMN_PORT=8787
EXPOSE_PSTMN_MAX_BODY_BYTES=1048576
EXPOSE_PSTMN_MAX_CONCURRENT=4
EXPOSE_PSTMN_REQUEST_TIMEOUT_MS=30000
EXPOSE_PSTMN_RATE_LIMIT_PER_MINUTE=60
```

The host is deliberately restricted to localhost in this phase. Broader network exposure requires a later security review.

The Postman provider still uses its Phase 3 configuration:

```text
POSTMAN_API_KEY
POSTMAN_REGION=us|eu
POSTMAN_MCP_ENDPOINT=https://mcp.postman.com/minimal
```

## Start

```bash
npm install
npm run build
node dist/cli.js gateway start
```

Then authenticate protected requests using the configured local key.

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/v1/models \
  -H "Authorization: Bearer $EXPOSE_PSTMN_API_KEY"
```

## Completion boundary

The HTTP surface is ready for OpenAI-compatible clients, but it does not fabricate a completion response. Because Phase 3 has not verified an externally callable Postman model interface, `/v1/chat/completions` returns a standards-shaped `501` error with code `model_completion_unavailable`.

This is deliberate: exposing an endpoint is not evidence that a provider can legitimately complete a model request.
