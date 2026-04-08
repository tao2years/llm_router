export const VOLCANO_API_KEY = '8f08b952-67b2-44a7-8b2e-f28de40afc56';
export const VOLCANO_ANTHROPIC_BASE = 'https://ark.cn-beijing.volces.com/api/coding';
export const VOLCANO_OPENAI_BASE = 'https://ark.cn-beijing.volces.com/api/coding/v3';
export const DEFAULT_MODEL = 'glm-4.7';
export const API_SERVER_PORT = 3001;

export interface AgentConfig {
  name: string;
  displayName: string;
  port: number;
  protocol: 'anthropic' | 'openai';
}

export const AGENTS: AgentConfig[] = [
  { name: 'claude_code', displayName: 'Claude Code', port: 7878, protocol: 'anthropic' },
  { name: 'free_code',   displayName: 'Free Code',   port: 7879, protocol: 'anthropic' },
  { name: 'test_code',  displayName: 'Test Code',   port: 7880, protocol: 'openai'    },
];
