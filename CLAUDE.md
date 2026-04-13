# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Router Trace Viewer — a debugging proxy that intercepts LLM API requests from Code Agent clients (Claude Code, Free Code, Test Code), stores traces in SQLite, and visualizes them in a real-time Next.js UI.

## Monorepo Structure

Two packages with separate `package.json` and `tsconfig.json`:

- `proxy/` — Express.js proxy server (Node.js, CommonJS, TypeScript → `dist/`)
- `web/` — Next.js 15 + React 19 trace viewer (browser/ESM TypeScript)

## Configuration

The proxy **requires** the `LLM_UPSTREAM_URL` environment variable (base URL of the upstream LLM API, no trailing slash required). Anthropic traffic is sent to `{UPSTREAM_URL}/v1/messages`; OpenAI-style traffic to `{UPSTREAM_URL}/v1/chat/completions`. Request headers from the agent (including auth) are forwarded except hop-by-hop fields (`host`, `content-length`, `connection`).

Example:

```bash
set LLM_UPSTREAM_URL=https://api.example.com
```

## Commands

### Setup

```bash
npm run install:all   # Install deps in both proxy/ and web/
```

### Development

```bash
npm run dev           # Run both proxy + web concurrently (recommended)
npm run dev:proxy     # Proxy only (ts-node-dev, hot reload)
npm run dev:web       # Web UI only (Next.js, port 3000)
```

### Per-package (proxy / web)

```bash
cd proxy && npm run dev    # ts-node-dev with hot reload
cd proxy && npm run build && npm start

cd web && npm run dev      # Next.js dev on :3000
cd web && npm run build && npm start
```

No test runner or linter is configured. TypeScript strict mode serves as the primary type safety mechanism.

## Port Map

| Port | Purpose |
|------|---------|
| 7878 | Claude Code proxy (Anthropic protocol) |
| 7879 | Free Code / Trae proxy (Anthropic protocol) |
| 7880 | Test Code proxy (OpenAI protocol) |
| 3001 | REST API + SSE for Web UI |
| 3000 | Next.js Web UI |

## Architecture

### Request flow

```
Code Agents (Claude Code :7878, Free Code :7879, Test Code :7880)
  → proxyHandler.ts    (protocol-specific path under LLM_UPSTREAM_URL, forwards headers/body)
  → upstream LLM       (Anthropic /v1/messages or OpenAI /v1/chat/completions)
  → streamAssembler.ts (reassembles SSE into complete JSON for traces)
  → db.ts              (SQLite: sessions + traces; session key = agent + client identity)
  → broadcast.ts       (SSE push to web clients)
  → web UI             (sessions / traces / detail)
```

### Proxy (`proxy/src/`)

| File | Role |
|------|------|
| `index.ts` | Starts 3 proxy servers + API server; logs configured `UPSTREAM_URL` |
| `config.ts` | `LLM_UPSTREAM_URL` → `UPSTREAM_URL`, agent ports/protocols, API port |
| `proxyHandler.ts` | Core proxy: builds upstream URL, forwards requests, streams responses, records traces |
| `streamAssembler.ts` | Reassembles Anthropic/OpenAI SSE into structured JSON before persistence |
| `db.ts` | SQLite (WAL); sessions include `client_ip`; `getOrCreateSessionId(agent, clientKey)` with 10‑min idle timeout |
| `apiServer.ts` | REST (`/api/sessions`, `/api/traces`, …) + SSE `/api/events` (`new_trace`) |
| `broadcast.ts` | SSE client registry; invoked after each stored trace |

Database file: `proxy/data/traces.db` (gitignored, created on startup). Existing DBs are migrated if `client_ip` is missing.

**Session grouping**: Same `agent` + same client identity within 10 minutes → same session. Client identity is the `x-session-tag` header if set, otherwise the client IP (supports multiple machines or instances on one proxy port).

### Web (`web/`)

- **`app/page.tsx`** — Three-panel layout: session sidebar → trace list → trace detail; subscribes to `/api/events` for live updates
- **`lib/api.ts`** — HTTP client and `EventSource` for SSE
- **`lib/types.ts`** — Shared interfaces (`Session` includes `client_ip`, `Trace`, etc.)
- **`lib/exportTraceMessages.ts`** — Normalizes traces to a unified chat format for export
- **`components/`** — `SessionSidebar` (shows client tag/IP when present), `TraceList`, `TraceDetail`, `MessageViewer`, `ResponseViewer`

### Key design decisions

- Anthropic vs OpenAI handling is **port-based** (7878/7879 vs 7880), not inferred from headers alone.
- Streaming: agents still receive chunks in real time; traces store the **assembled** full response from `streamAssembler.ts`.
- Push updates use SSE only (`/api/events`); the UI does not poll for new traces.
- Stub `GET /v1/models` returns an empty model list unless extended.

## Connecting Code Agents

```bash
# Claude Code
claude config set apiBaseUrl http://localhost:7878

# Free Code / Trae — API Base URL http://localhost:7879

# Test Code (OpenAI-compatible) — http://localhost:7880
```

Optional: send header `x-session-tag: <unique-id>` to separate sessions when multiple clients share one IP.
