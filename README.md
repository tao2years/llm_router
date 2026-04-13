# LLM Router Trace Viewer

转发 Code Agent 的 LLM 请求，实时拦截并在 Web UI 中可视化分析。

## 架构

```
Claude Code  → localhost:7878  (Anthropic 协议) ─┐
Free Code    → localhost:7879  (Anthropic 协议) ─┼→ Volcano API (glm-4.7)
Test Code    → localhost:7880  (OpenAI 协议)    ─┘

Web UI       → localhost:3000  (Next.js)
Proxy API    → localhost:3001  (REST + SSE)
```

## 快速启动

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 同时启动代理服务器和 Web UI
npm run dev
```

或分开启动：
```bash
npm run dev:proxy   # 代理服务器 (端口 7878/7879/7880/3001)
npm run dev:web     # Web UI (端口 3000)
```

## 上游服务配置

编辑 `proxy/src/config.ts`，修改以下四个常量：

```typescript
// 上游 LLM 服务的 API Key
export const VOLCANO_API_KEY = 'your-api-key-here';

// Anthropic 协议上游地址（供 Claude Code / Free Code 使用）
export const VOLCANO_ANTHROPIC_BASE = 'https://ark.cn-beijing.volces.com/api/coding';

// OpenAI 协议上游地址（供 Test Code 使用）
export const VOLCANO_OPENAI_BASE = 'https://ark.cn-beijing.volces.com/api/coding/v3';

// 强制覆盖 agent 发来的 model 字段
export const DEFAULT_MODEL = 'glm-4.7';
```

> 换用其他服务商（如 OpenAI、DeepSeek）只需修改上面的地址和 Key，其余代码无需改动。

改完后重启 proxy 即生效。

## Code Agent 配置

代理会自动丢弃 agent 侧的 API Key（`authorization` / `x-api-key` 头），统一使用 `config.ts` 中配置的 Key，**agent 侧的 API Key 填任意值即可**。

### Claude Code
```bash
# 设置 API Base URL 指向本代理
claude config set apiBaseUrl http://localhost:7878
```

### Trae / Free Code
在设置中配置 API Base URL 为 `http://localhost:7879`（Anthropic 协议）

### Test Code (OpenAI 协议)
配置 API Base URL 为 `http://localhost:7880`，协议选 OpenAI

## Web UI 功能

- **实时更新**：新请求到达时自动刷新（SSE）
- **三栏布局**：会话列表 → Trace 列表 → Trace 详情
- **Messages 视图**：渲染完整对话，包括 system prompt、tool use、tool result
- **Response 视图**：渲染助手回复，tool call 可视化
- **JSON 视图**：可折叠的 JSON 树
- **Headers 视图**：请求/响应头
- **Token 统计**：输入/输出 token 数
