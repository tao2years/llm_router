# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Router Trace Viewer — a debugging proxy that intercepts LLM API requests from Code Agent clients (Claude Code, Free Code, Test Code), stores traces in SQLite, and visualizes them in a real-time Next.js UI.

## Monorepo Structure

Two packages with separate `package.json` and `tsconfig.json`:
- `proxy/` — Express.js proxy server (Node.js, CommonJS, TypeScript → `dist/`)
- `web/` — Next.js 15 + React 19 trace viewer (browser/ESM TypeScript)

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

### Production
```bash
cd proxy && npm run build && npm start   # Compile TS → dist/, then run
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

### Proxy (`proxy/src/`)

- **`index.ts`** — Starts 3 proxy servers + 1 API server
- **`config.ts`** — Agent configs, Volcano API credentials, port/model constants; all upstream requests go to the Volcano API (glm-4.7 model)
- **`proxyHandler.ts`** — Core interception logic: adapts Anthropic/OpenAI protocol, forwards to Volcano, pipes response back to client, triggers trace storage
- **`streamAssembler.ts`** — Reassembles chunked SSE streams (both Anthropic and OpenAI formats) into complete request/response objects before storing
- **`db.ts`** — SQLite (better-sqlite3, WAL mode) schema + CRUD; tracks active session per agent with 10-minute inactivity timeout
- **`apiServer.ts`** — REST endpoints (`/api/sessions`, `/api/traces`, `/api/traces/:id`) + SSE endpoint (`/api/events`) that pushes `new_trace` events to Web UI
- **`broadcast.ts`** — Manages SSE client connections; called by proxyHandler after each trace is stored

### Web (`web/`)

- **`app/page.tsx`** — Three-panel layout: session sidebar → trace list → trace detail; connects to `/api/events` SSE for real-time updates
- **`lib/types.ts`** — Shared TypeScript interfaces (`Session`, `Trace`, etc.) used across all components
- **`lib/exportTraceMessages.ts`** — Normalizes Anthropic and OpenAI traces to a unified OpenAI Chat format for export/training
- **`components/`** — `SessionSidebar`, `TraceList`, `TraceDetail` (5-tab viewer), `MessageViewer` (renders tool use blocks), `ResponseViewer` (protocol-aware)

### Key Design Decisions

- Both Anthropic and OpenAI protocols are supported on separate ports but all upstream traffic goes to one Volcano API endpoint. Protocol detection is port-based, not header-based.
- Streaming responses are fully buffered in `streamAssembler.ts` before trace storage — the client still receives chunks in real time, but the stored trace is the complete assembled response.
- Session identity is per-agent, time-bounded (10 min idle = new session), stored in-memory in `db.ts`.
- SSE (`/api/events`) is the only push channel; the Web UI does not poll.

## Connecting Code Agents

```bash
# Claude Code
claude config set apiBaseUrl http://localhost:7878

# Free Code / Trae — set API Base URL to http://localhost:7879

# Test Code (OpenAI-compatible) — set API Base URL to http://localhost:7880
```
