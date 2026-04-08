import express, { type Request, type Response } from 'express';
import axios, { type AxiosResponse } from 'axios';
import cors from 'cors';
import {
  VOLCANO_API_KEY, VOLCANO_ANTHROPIC_BASE, VOLCANO_OPENAI_BASE, DEFAULT_MODEL,
  type AgentConfig,
} from './config';
import { getOrCreateSessionId, insertTrace } from './db';
import { broadcast } from './broadcast';
import {
  assembleAnthropicStream, getAnthropicTokens,
  assembleOpenAIStream, getOpenAITokens,
} from './streamAssembler';

// Strip auth headers coming from the agent client
const STRIP_HEADERS = new Set([
  'host', 'content-length', 'connection',
  'authorization', 'x-api-key',
]);

function buildRequestHeaders(
  req: Request,
  protocol: 'anthropic' | 'openai'
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (protocol === 'anthropic') {
    headers['x-api-key'] = VOLCANO_API_KEY;
    headers['anthropic-version'] = (req.headers['anthropic-version'] as string) ?? '2023-06-01';
    if (req.headers['anthropic-beta']) {
      headers['anthropic-beta'] = req.headers['anthropic-beta'] as string;
    }
  } else {
    headers['Authorization'] = `Bearer ${VOLCANO_API_KEY}`;
  }

  return headers;
}

async function handleProxy(req: Request, res: Response, cfg: AgentConfig): Promise<void> {
  const startTime = Date.now();
  const sessionId = getOrCreateSessionId(cfg.name);

  const requestBody: Record<string, unknown> = { ...(req.body as Record<string, unknown>), model: DEFAULT_MODEL };
  const isStreaming = requestBody.stream === true;
  const upstreamHeaders = buildRequestHeaders(req, cfg.protocol);

  const upstreamUrl = cfg.protocol === 'anthropic'
    ? `${VOLCANO_ANTHROPIC_BASE}/v1/messages`
    : `${VOLCANO_OPENAI_BASE}/chat/completions`;

  const sanitizedReqHeaders = Object.fromEntries(
    Object.entries(req.headers).filter(([k]) => !STRIP_HEADERS.has(k))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upstreamResp!: AxiosResponse<any, any>;
  try {
    upstreamResp = await axios({
      method: 'POST',
      url: upstreamUrl,
      headers: upstreamHeaders,
      data: requestBody,
      responseType: isStreaming ? 'stream' : 'json',
      timeout: 180_000,
    });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status: number; data: unknown; headers: unknown }; message: string };
    const status = axiosErr.response?.status ?? 502;
    const body = axiosErr.response?.data ?? { error: axiosErr.message };

    if (!res.headersSent) res.status(status).json(body);

    const duration = Date.now() - startTime;
    const traceId = insertTrace({
      session_id: sessionId, agent: cfg.name, port: cfg.port, protocol: cfg.protocol,
      timestamp: startTime, request_method: req.method, request_path: req.path,
      request_headers: JSON.stringify(sanitizedReqHeaders),
      request_body: JSON.stringify(requestBody),
      response_status: status,
      response_headers: JSON.stringify(axiosErr.response?.headers ?? {}),
      response_body: JSON.stringify(body),
      duration_ms: duration, model: DEFAULT_MODEL, tokens_input: 0, tokens_output: 0,
    });
    broadcast('new_trace', { id: traceId, session_id: sessionId, agent: cfg.name, timestamp: startTime, response_status: status, duration_ms: duration });
    return;
  }

  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    // Forward any CORS headers from upstream if needed
    res.status(upstreamResp.status);

    const chunks: Buffer[] = [];
    let clientAlive = true;
    req.on('close', () => { clientAlive = false; });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = upstreamResp.data as any;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (clientAlive) {
        try { res.write(chunk); } catch { clientAlive = false; }
      }
    });

    stream.on('end', () => {
      if (clientAlive) {
        try { res.end(); } catch { /* ignore */ }
      }

      const fullText = Buffer.concat(chunks).toString('utf8');
      const assembled = cfg.protocol === 'anthropic'
        ? assembleAnthropicStream(fullText)
        : assembleOpenAIStream(fullText);
      const tokens = cfg.protocol === 'anthropic'
        ? getAnthropicTokens(assembled)
        : getOpenAITokens(assembled);
      const model = (assembled.model as string) || DEFAULT_MODEL;
      const duration = Date.now() - startTime;

      const traceId = insertTrace({
        session_id: sessionId, agent: cfg.name, port: cfg.port, protocol: cfg.protocol,
        timestamp: startTime, request_method: req.method, request_path: req.path,
        request_headers: JSON.stringify(sanitizedReqHeaders),
        request_body: JSON.stringify(requestBody),
        response_status: upstreamResp.status,
        response_headers: JSON.stringify(upstreamResp.headers),
        response_body: JSON.stringify(assembled),
        duration_ms: duration, model,
        tokens_input: tokens.input, tokens_output: tokens.output,
      });

      broadcast('new_trace', {
        id: traceId, session_id: sessionId, agent: cfg.name,
        timestamp: startTime, response_status: upstreamResp.status,
        duration_ms: duration, model, tokens_input: tokens.input, tokens_output: tokens.output,
      });
    });

    stream.on('error', (err: Error) => {
      console.error(`[${cfg.name}] stream error:`, err.message);
      if (clientAlive) { try { res.end(); } catch { /* ignore */ } }
    });

  } else {
    const responseBody = upstreamResp.data as Record<string, unknown>;
    res.status(upstreamResp.status).json(responseBody);

    const duration = Date.now() - startTime;
    let tokensIn = 0, tokensOut = 0, model = DEFAULT_MODEL;

    if (cfg.protocol === 'anthropic') {
      const usage = (responseBody.usage ?? {}) as Record<string, number>;
      tokensIn = usage.input_tokens ?? 0;
      tokensOut = usage.output_tokens ?? 0;
      model = (responseBody.model as string) || DEFAULT_MODEL;
    } else {
      const usage = (responseBody.usage ?? {}) as Record<string, number>;
      tokensIn = usage.prompt_tokens ?? 0;
      tokensOut = usage.completion_tokens ?? 0;
      model = (responseBody.model as string) || DEFAULT_MODEL;
    }

    const traceId = insertTrace({
      session_id: sessionId, agent: cfg.name, port: cfg.port, protocol: cfg.protocol,
      timestamp: startTime, request_method: req.method, request_path: req.path,
      request_headers: JSON.stringify(sanitizedReqHeaders),
      request_body: JSON.stringify(requestBody),
      response_status: upstreamResp.status,
      response_headers: JSON.stringify(upstreamResp.headers),
      response_body: JSON.stringify(responseBody),
      duration_ms: duration, model, tokens_input: tokensIn, tokens_output: tokensOut,
    });

    broadcast('new_trace', {
      id: traceId, session_id: sessionId, agent: cfg.name,
      timestamp: startTime, response_status: upstreamResp.status,
      duration_ms: duration, model, tokens_input: tokensIn, tokens_output: tokensOut,
    });
  }
}

export function createProxyApp(cfg: AgentConfig): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Return a fake model list so agents don't fail on /v1/models
  app.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: [{ id: DEFAULT_MODEL, object: 'model', created: 1700000000, owned_by: 'volcano' }],
    });
  });

  // Main proxy routes
  if (cfg.protocol === 'anthropic') {
    app.post('/v1/messages', (req, res) => { void handleProxy(req, res, cfg); });
  } else {
    app.post('/v1/chat/completions', (req, res) => { void handleProxy(req, res, cfg); });
  }

  // Transparent fallback for any other routes
  app.all('*', async (req, res) => {
    const base = cfg.protocol === 'anthropic' ? VOLCANO_ANTHROPIC_BASE : VOLCANO_OPENAI_BASE;
    const headers = buildRequestHeaders(req, cfg.protocol);
    try {
      const resp = await axios({ method: req.method as string, url: `${base}${req.path}`, headers, data: req.body, timeout: 30_000 });
      res.status(resp.status).json(resp.data);
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string };
      res.status(e.response?.status ?? 502).json(e.response?.data ?? { error: e.message });
    }
  });

  return app;
}
