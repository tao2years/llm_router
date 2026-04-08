'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@/lib/types';
import { fetchSessions, clearAllData, createEventSource } from '@/lib/api';
import SessionSidebar from '@/components/SessionSidebar';
import TraceList from '@/components/TraceList';
import TraceDetail from '@/components/TraceDetail';

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Load sessions
  const loadSessions = useCallback(() => {
    fetchSessions()
      .then(setSessions)
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // SSE connection
  useEffect(() => {
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        es = createEventSource();
        esRef.current = es;

        es.onopen = () => setConnected(true);

        es.addEventListener('new_trace', (e: MessageEvent) => {
          const data = JSON.parse(e.data as string) as { session_id?: string };
          // Reload sessions for updated trace_count
          loadSessions();
          // If the new trace belongs to the selected session, bump refreshTick
          if (data.session_id && data.session_id === selectedSession) {
            setRefreshTick(t => t + 1);
          } else if (data.session_id) {
            // Auto-select new session if none selected
            setSelectedSession(prev => prev ?? data.session_id ?? null);
          }
        });

        es.onerror = () => {
          setConnected(false);
          es.close();
          retryTimer = setTimeout(connect, 3000);
        };
      } catch {
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);
      }
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, loadSessions]);

  function handleSelectSession(id: string) {
    setSelectedSession(id);
    setSelectedTrace(null);
    setRefreshTick(t => t + 1);
  }

  function handleDeletedSession(id: string) {
    setSessions(s => s.filter(x => x.id !== id));
    if (selectedSession === id) {
      setSelectedSession(null);
      setSelectedTrace(null);
    }
  }

  async function handleClearAll() {
    if (!confirm('Clear all sessions and traces?')) return;
    await clearAllData();
    setSessions([]);
    setSelectedSession(null);
    setSelectedTrace(null);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* ── Left sidebar: sessions ── */}
      <aside className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          selectedId={selectedSession}
          onSelect={handleSelectSession}
          onDeleted={handleDeletedSession}
          onClearAll={handleClearAll}
          connected={connected}
        />
      </aside>

      {/* ── Middle: trace list ── */}
      <div className="w-64 shrink-0 border-r border-gray-800 bg-gray-900/30 flex flex-col overflow-hidden">
        {selectedSession ? (
          <TraceList
            sessionId={selectedSession}
            selectedId={selectedTrace}
            onSelect={setSelectedTrace}
            refreshTick={refreshTick}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-700 text-xs text-center p-4">
            Select a session<br />to see traces
          </div>
        )}
      </div>

      {/* ── Right: trace detail ── */}
      <main className="flex-1 overflow-hidden flex flex-col bg-gray-950">
        {selectedTrace ? (
          <TraceDetail key={selectedTrace} traceId={selectedTrace} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-700">
              <div className="text-4xl mb-3">⬡</div>
              <p className="text-sm">Select a trace to inspect</p>
              <p className="text-xs mt-1">Code Agent requests appear in real time</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
