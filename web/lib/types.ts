export interface Session {
  id: string;
  agent: string;
  created_at: number;
  updated_at: number;
  trace_count: number;
}

export interface TraceSummary {
  id: string;
  session_id: string;
  agent: string;
  port: number;
  protocol: string;
  timestamp: number;
  request_method: string;
  request_path: string;
  response_status: number;
  duration_ms: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
}

export interface TraceDetail extends TraceSummary {
  request_headers: string;  // JSON string
  request_body: string;     // JSON string
  response_headers: string; // JSON string
  response_body: string;    // JSON string
}

export const AGENT_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  free_code: 'Free Code',
  test_code: 'Test Code',
};

export const AGENT_COLORS: Record<string, string> = {
  claude_code: 'text-orange-400',
  free_code:   'text-blue-400',
  test_code:   'text-green-400',
};

export const AGENT_BG: Record<string, string> = {
  claude_code: 'bg-orange-500/10 border-orange-500/30',
  free_code:   'bg-blue-500/10 border-blue-500/30',
  test_code:   'bg-green-500/10 border-green-500/30',
};
