import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'traces.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      agent       TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      trace_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS traces (
      id               TEXT    PRIMARY KEY,
      session_id       TEXT    NOT NULL,
      agent            TEXT    NOT NULL,
      port             INTEGER NOT NULL,
      protocol         TEXT    NOT NULL,
      timestamp        INTEGER NOT NULL,
      request_method   TEXT,
      request_path     TEXT,
      request_headers  TEXT,
      request_body     TEXT,
      response_status  INTEGER,
      response_headers TEXT,
      response_body    TEXT,
      duration_ms      INTEGER,
      model            TEXT,
      tokens_input     INTEGER,
      tokens_output    INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_traces_session   ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_agent     ON traces(agent);
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp DESC);
  `);
}

// ────────── session tracking ──────────

interface SessionActivity {
  sessionId: string;
  lastTime: number;
}

const activityMap = new Map<string, SessionActivity>();
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function getOrCreateSessionId(agent: string): string {
  const now = Date.now();
  const prev = activityMap.get(agent);
  if (prev && now - prev.lastTime < SESSION_TIMEOUT_MS) {
    prev.lastTime = now;
    return prev.sessionId;
  }
  const id = uuidv4();
  getDb().prepare(
    `INSERT INTO sessions (id, agent, created_at, updated_at, trace_count) VALUES (?, ?, ?, ?, 0)`
  ).run(id, agent, now, now);
  activityMap.set(agent, { sessionId: id, lastTime: now });
  return id;
}

// ────────── trace operations ──────────

export interface TraceInsert {
  session_id: string;
  agent: string;
  port: number;
  protocol: string;
  timestamp: number;
  request_method: string;
  request_path: string;
  request_headers: string;
  request_body: string;
  response_status: number;
  response_headers: string;
  response_body: string;
  duration_ms: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
}

export function insertTrace(t: TraceInsert): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO traces
      (id, session_id, agent, port, protocol, timestamp,
       request_method, request_path, request_headers, request_body,
       response_status, response_headers, response_body,
       duration_ms, model, tokens_input, tokens_output)
    VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?)
  `).run(
    id, t.session_id, t.agent, t.port, t.protocol, t.timestamp,
    t.request_method, t.request_path, t.request_headers, t.request_body,
    t.response_status, t.response_headers, t.response_body,
    t.duration_ms, t.model, t.tokens_input, t.tokens_output
  );
  db.prepare(`UPDATE sessions SET updated_at=?, trace_count=trace_count+1 WHERE id=?`)
    .run(Date.now(), t.session_id);
  return id;
}

// ────────── query API ──────────

export function querySessions(limit = 100): unknown[] {
  return getDb().prepare(
    `SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`
  ).all(limit);
}

export function queryTracesBySession(sessionId: string): unknown[] {
  return getDb().prepare(
    `SELECT id, session_id, agent, port, protocol, timestamp,
            request_method, request_path, response_status,
            duration_ms, model, tokens_input, tokens_output
     FROM traces WHERE session_id=? ORDER BY timestamp ASC`
  ).all(sessionId);
}

export function queryTraceById(id: string): unknown {
  return getDb().prepare(`SELECT * FROM traces WHERE id=?`).get(id);
}

export function deleteSession(id: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE id=?`).run(id);
}

export function clearAll(): void {
  const db = getDb();
  db.prepare(`DELETE FROM traces`).run();
  db.prepare(`DELETE FROM sessions`).run();
  activityMap.clear();
}
