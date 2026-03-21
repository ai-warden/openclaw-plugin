# AI-Warden OpenClaw Plugin — v2.0 Spec

## Overview

Thin adapter between `ai-warden` npm package and OpenClaw's plugin API.
All detection logic lives in the npm package. This plugin only wires it to OpenClaw events.

## Design Principles

1. **npm package = brain** — all scanning, patterns, PII, API calls live in `ai-warden`
2. **Plugin = wiring** — maps OpenClaw events to `warden.scan()` / `warden.validate()`
3. **Offline by default** — works without API key (pattern matching, free)
4. **API key = upgrade** — all calls go through `api.ai-warden.io` when key is set
5. **Auto-update** — runs `npm install ai-warden@latest` at gateway startup
6. **User controls policy** — warn/block/log per layer via `/warden` commands

## Layers

| Layer | Event | What it scans | Default |
|-------|-------|---------------|---------|
| 0: Content | `tool_result_persist` hook | web_fetch, browser, read results | ON |
| 1: Channel | `before_prompt_build` | Latest user message | ON |
| 2: Pre-LLM | `before_prompt_build` | Full conversation context | OFF |
| 3: Tool Args | `before_tool_call` (if available) | exec, write, edit args | ON |
| 4: Subagent | `before_tool_call` (if available) | sessions_spawn task | ON |
| 5: Output | `message_sending` (if available) | Bot response before send | ON |

### Layer details

**Layer 0 — Content Validation (CRITICAL)**
- Hook: `api.registerHook("tool_result_persist", ...)`
- Scans tool results from `web_fetch`, `browser`, `read` before they enter context
- On detection: replace content with `[BLOCKED BY AI-WARDEN]`
- This is the most important layer — prevents indirect prompt injection

**Layer 1 — Channel Input**
- Hook: `api.on("before_prompt_build", ...)`
- Scans `event.messages` last user message
- On block: inject warning via `prependSystemContext`
- On warn: inject advisory via `prependSystemContext`

**Layer 2 — Pre-LLM Context (experimental)**
- Same hook as Layer 1 but scans full conversation history
- Catches multi-message concatenation attacks
- Off by default (performance cost)

**Layer 3 — Tool Argument Sanitization**
- If `before_tool_call` exists: scan args for exec, write, edit
- Detects command injection, path traversal
- Returns `{ block: true, blockReason: "..." }` to prevent execution

**Layer 4 — Subagent Task Validation**
- Same mechanism as Layer 3 but for `sessions_spawn`
- Prevents privilege escalation via malicious task text

**Layer 5 — Output Filtering**
- If `message_sending` exists: scan outgoing message
- PII detection + masking (uses `ai-warden` PII module)
- API key / credential redaction

## Detection Modes

**Offline (no API key)**
- `warden.scan(text)` — local pattern matching
- ~65% accuracy, <5ms, free
- Returns: `{ passed, riskScore, riskLevel, findings, stats }`

**API (with key)**
- `warden.validate(text)` — full cascade via API
- ~99% accuracy, ~150ms avg
- Returns: `{ passed, blocked, layer, confidence, ... }`
- Fallback to offline if API unreachable

## Policy Actions

Per-layer configurable via `/warden` commands:

| Action | Behavior |
|--------|----------|
| `block` | Replace/prevent content, notify user |
| `warn` | Inject warning into system context, let through |
| `log` | Console log only, silent |
| `off` | Layer disabled |

Default: `warn` for all layers except Layer 0 which defaults to `block`.

## /warden Commands

```
/warden                     → Status overview (all layers + stats)
/warden status              → Same as above
/warden layer <name> <action> → Set layer action (block/warn/log/off)
/warden stats               → Scan statistics
/warden pii <mode>          → Set PII mode (ignore/mask/remove)
/warden reset               → Reset statistics
```

Layer names: `content`, `channel`, `prellm`, `toolargs`, `subagents`, `output`

## Config

```json
{
  "plugins": {
    "entries": {
      "ai-warden": {
        "enabled": true,
        "config": {
          "apiKey": "sk_live_...",
          "layers": {
            "content": "block",
            "channel": "warn",
            "preLlm": "off",
            "toolArgs": "warn",
            "subagents": "warn",
            "output": "warn"
          },
          "pii": "mask",
          "sensitivity": "balanced",
          "autoUpdate": true,
          "verbose": false
        }
      }
    }
  }
}
```

## File Structure

```
openclaw-plugin/
├── openclaw.plugin.json     # Manifest (id, configSchema, uiHints)
├── package.json             # deps: ai-warden
├── index.ts                 # Plugin entry: export { id, register }
├── src/
│   ├── scanner.ts           # Thin wrapper around ai-warden scan/validate
│   ├── layers.ts            # Layer definitions + event wiring
│   ├── commands.ts          # /warden command handler
│   ├── state.ts             # Runtime state (layer config, stats, PII mode)
│   └── types.ts             # TypeScript interfaces
└── README.md
```

## Implementation Notes

### Scanner (scanner.ts)
```ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

class Scanner {
  private warden: any;
  private apiKey: string;

  constructor(apiKey?: string) {
    const AIWarden = require("ai-warden");
    this.apiKey = apiKey || "";
    this.warden = this.apiKey ? new AIWarden(this.apiKey) : new AIWarden();
  }

  // Offline scan (always available)
  scan(text: string) { return this.warden.scan(text); }

  // API scan (needs key, falls back to offline)
  async validate(text: string) {
    if (!this.apiKey) return this.scan(text);
    try {
      return await this.warden.validate(text);
    } catch {
      return this.scan(text); // fallback
    }
  }
}
```

### Layer Wiring (layers.ts)
```ts
export function registerLayers(api: any, scanner: Scanner, state: State) {

  // Layer 0: Content validation
  api.registerHook("tool_result_persist", async (event) => {
    if (!state.isEnabled("content")) return;
    const tools = ["web_fetch", "browser", "read"];
    if (!tools.includes(event.toolName)) return;

    const result = await scanner.validate(event.result);
    if (!result.passed) {
      state.record("content", result);
      if (state.action("content") === "block") {
        event.result = "[BLOCKED by AI-Warden: content injection detected]";
      }
    }
  });

  // Layer 1+2: Channel + Pre-LLM
  api.on("before_prompt_build", (event, ctx) => {
    // Layer 1: scan latest user message
    // Layer 2: scan full context (if enabled)
    // Return: { prependSystemContext: warning } or nothing
  });

  // Layer 3+4: Tool args + Subagents (if event exists)
  // Layer 5: Output filter (if event exists)
}
```

### Commands (commands.ts)
```ts
export function registerCommands(api: any, state: State) {
  api.registerCommand({
    name: "warden",
    description: "AI-Warden security management",
    handler: async (args, ctx) => {
      // Parse subcommand and dispatch
    }
  });
}
```

## Startup Sequence

1. Plugin loaded by OpenClaw (jiti compiles TypeScript)
2. `register(api)` called
3. Read config from `api.pluginConfig`
4. Initialize Scanner (ai-warden npm package)
5. Initialize State (layer config, stats)
6. Register hooks (Layer 0)
7. Register lifecycle events (Layer 1-5)
8. Register /warden command
9. Log: `[AI-Warden] v2.0 ready (mode: offline|api, layers: 5/6)`

## Auto-Update (optional, at startup)

If `config.autoUpdate` is true:
```ts
execSync("npm install ai-warden@latest --prefer-online --no-audit --no-fund", {
  cwd: pluginDir,
  timeout: 30_000,
  stdio: "pipe"
});
```

Runs once at startup, non-blocking for scan operations.

## Upgrade Prompt

On first detection without API key:
```
🛡️ AI-Warden caught a potential attack (offline mode, ~65% accuracy).
For 99% accuracy with Smart Cascade: https://ai-warden.io/signup
```

Only shown once per gateway session.

## Testing Plan

1. **Layer 0**: Send bot a URL with hidden injection → should block content
2. **Layer 1**: Send "ignore all previous instructions" → should warn/block
3. **Layer 3**: Trigger tool call with `; rm -rf /` → should block
4. **Layer 5**: Ask bot to reveal API keys → should redact output
5. **/warden commands**: Toggle layers, check stats
6. **Offline vs API**: Test with and without API key
7. **Fallback**: Kill API → verify offline fallback works

## Migration from v1.x

- Delete old plugin directory
- Clone new repo / npm install
- Config is backward compatible (same plugin id: `ai-warden`)
- Old `moltbot.plugin.json` replaced by `openclaw.plugin.json`
- Old event names mapped to new OpenClaw API

## Verified API (2026-03-21)

All hooks verified against OpenClaw 2026.3.14 source (`src/plugins/types.ts`):

### ✅ Q1: `tool_result_persist` (Layer 0)
- **SYNC-only** — no async/await, no API calls
- Returns `{ message?: AgentMessage }` to replace content
- Event: `{ toolName, toolCallId, message, isSynthetic }`
- Context: `{ agentId, sessionKey, toolName, toolCallId }`
- **Implication:** Layer 0 MUST use offline scan only (`warden.scan()`)

### ✅ Q2: `before_tool_call` (Layer 3+4)
- **Async allowed**
- Returns `{ block?: boolean, blockReason?: string, params?: Record }`
- Event: `{ toolName, params, runId, toolCallId }`
- **Implication:** Can use API scan for tool arg validation

### ✅ Q3: `message_sending` (Layer 5)
- **Async allowed**
- Returns `{ content?: string, cancel?: boolean }`
- Event: `{ to, content, metadata }`
- **Implication:** Can mutate or cancel outgoing messages

### ✅ Q4: `before_prompt_build` (Layer 1+2)
- **Async allowed**
- Returns `{ prependSystemContext, appendSystemContext, prependContext, systemPrompt }`
- Event: `{ prompt, messages[] }`
- **Implication:** Can inject warnings into system context

### ✅ Q5: `registerCommand` (/warden)
- `{ name, description, acceptsArgs, requireAuth, handler }`
- Handler receives args + context
- **Implication:** Full /warden command support

## Remaining Decisions

1. Should Layer 0 (sync-only) be enough with offline scan, or do we need a workaround for API mode?
2. How to persist runtime layer toggles across gateway restarts? (Write back to config? Separate state file?)
3. Hook-pack vs native plugin — native gives us registerCommand + typed hooks, hook-pack is simpler install. **Decision: native plugin.**
