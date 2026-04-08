# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

LLM 路由转发系统：拦截 Code Agent（Claude Code、Free Code、Test Code）的 LLM 请求，记录完整 trace，并在 Next.js Web UI 中实时可视化。

## Development Commands

```bash
# Install all dependencies (run once)
npm run install:all

# Start both services simultaneously
npm run dev

# Start individually
npm run dev:proxy   # proxy server on ports 7878/7879/7880/3001
npm run dev:web     # Next.js UI on port 3000

# Type-check without building
cd proxy && npx tsc --noEmit
cd web   && npx tsc --noEmit
```

## Architecture

Two independent processes communicate via SQLite (proxy writes) + SSE (proxy broadcasts to browser):

```
Code Agent  →  proxy/:port  →  Volcano API (glm-4.7)
                    ↓
               SQLite DB (proxy/data/traces.db)
                    ↓
            proxy:3001 REST/SSE API
                    ↓
            Browser (Next.js :3000)
```

### proxy/ — Node.js + TypeScript + Express

| File | Role |
|---|---|
| `src/config.ts` | Port/protocol/API key constants; add new agents to `AGENTS` array |
| `src/index.ts` | Entry point: starts one Express app per agent + API server on 3001 |
| `src/proxyHandler.ts` | `createProxyApp(cfg)` — intercepts requests, swaps model, forwards to Volcano, tees stream |
| `src/streamAssembler.ts` | Parses raw SSE text into assembled Anthropic/OpenAI response objects |
| `src/db.ts` | SQLite via `better-sqlite3`; session auto-creation with 10-min timeout heuristic |
| `src/broadcast.ts` | In-memory SSE client registry; `broadcast(event, data)` fans out to all connected browsers |
| `src/apiServer.ts` | REST endpoints + SSE stream (`GET /api/events`) consumed by the Web UI |

**Streaming flow**: proxy tees the SSE stream — forwards chunks to the agent client immediately, buffers all chunks, then after `stream.on('end')` assembles the full response object and writes to SQLite + broadcasts.

**Session tracking**: per-agent in-memory map (`activityMap`). New session created if >10 minutes since last request from that agent. Sessions reset on proxy restart.

### web/ — Next.js 15 + React 19 + Tailwind CSS

All pages are `'use client'` components. No server-side data fetching — all API calls go directly from the browser to `http://localhost:3001`.

| File | Role |
|---|---|
| `lib/api.ts` | All fetch calls to proxy API; `NEXT_PUBLIC_PROXY_API` env var controls base URL (default: `http://localhost:3001`) |
| `lib/types.ts` | Shared TypeScript types + agent label/color mappings |
| `app/page.tsx` | Root layout: manages selectedSession/selectedTrace state, SSE subscription, real-time refresh |
| `components/TraceDetail.tsx` | 5-tab view: Messages / Response / Raw Request / Raw Response / Headers |
| `components/JsonViewer.tsx` | Recursive collapsible JSON tree (no external deps) |
| `components/MessageViewer.tsx` | Renders Anthropic-format `messages[]` with tool_use/tool_result blocks |
| `components/ResponseViewer.tsx` | Renders assembled response (Anthropic content blocks or OpenAI choices) |

## Adding a New Agent

Edit `proxy/src/config.ts` and add to the `AGENTS` array:
```typescript
{ name: 'my_agent', displayName: 'My Agent', port: 7881, protocol: 'anthropic' }
```
Add matching color/label entries in `web/lib/types.ts` (`AGENT_LABELS`, `AGENT_COLORS`, `AGENT_BG`).

## Connecting Claude Code to the Proxy

```bash
# PowerShell
$env:ANTHROPIC_BASE_URL="http://localhost:7878"
claude

# CMD
set ANTHROPIC_BASE_URL=http://localhost:7878 && claude
```

## Key Constraints

- `better-sqlite3` requires Node.js ≥18; confirmed working on Node.js v24 with v12.8.0.
- The proxy replaces the `model` field in every request with `glm-4.7` regardless of what the agent sent.
- Auth headers (`x-api-key`, `Authorization`) from the agent client are stripped and replaced with the Volcano API key.
- Body size limit is 50 MB (for large tool results with file contents).
