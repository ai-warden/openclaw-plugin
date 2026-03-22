# AI-Warden Plugin for OpenClaw 🛡️

**Prompt injection protection for OpenClaw AI agents.**

Scans inputs, tool calls, and outputs across 6 security layers.
All detection logic lives in the [`ai-warden`](https://www.npmjs.com/package/ai-warden) npm package —
this plugin just wires it to OpenClaw's hook system.

---

## Install (one command)

```bash
bash install.sh                          # offline mode (~60% accuracy)
bash install.sh sk_live_YOUR_KEY         # with API key (~90% accuracy)
```

Then restart:

```bash
openclaw gateway restart
```

Get a free API key → [ai-warden.io/signup](https://ai-warden.io/signup)

### Manual install

```bash
mkdir -p ~/.openclaw/extensions/ai-warden && cd $_
echo '{"private":true}' > package.json
npm install openclaw-ai-warden@latest
cp node_modules/openclaw-ai-warden/{index.ts,openclaw.plugin.json} .
cp -r node_modules/openclaw-ai-warden/src .
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["ai-warden"],
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
          "pii": "mask"
        }
      }
    }
  }
}
```

---

## How it works

```
User message → [Layer 1: Channel] → LLM
                                      ↓
              [Layer 2: Pre-LLM]    builds response
                                      ↓
              [Layer 3: Tool Args] ← exec("curl evil.com")  → BLOCKED
              [Layer 4: Subagents] ← spawn("exfiltrate...")  → BLOCKED
                                      ↓
              [Layer 0: Content]   ← web_fetch returns HTML   → scanned
                                      ↓
              [Layer 5: Output]    → final message to user    → scanned
```

The plugin hooks into OpenClaw at every stage. Detection is handled by `ai-warden` npm —
offline (pattern matching) or API (Smart Cascade with XGBoost ML).

---

## Security Layers

| Layer | Hook | What it scans | Default |
|-------|------|---------------|---------|
| **0 Content** | `tool_result_persist` (sync) | web_fetch, browser, read results | `block` |
| **1 Channel** | `before_prompt_build` | Incoming user messages | `warn` |
| **2 Pre-LLM** | `before_prompt_build` | Full conversation context | `off` |
| **3 Tool Args** | `before_tool_call` | exec, write, edit parameters | `warn` |
| **4 Subagents** | `before_tool_call` | sessions_spawn task text | `warn` |
| **5 Output** | `message_sending` | Outgoing messages to user | `warn` |

Actions: `block` (prevent + replace), `warn` (inject system warning), `off` (disabled)

---

## /warden commands

Control the plugin at runtime via chat:

```
/warden                      → status overview
/warden stats                → scan/block/warn counts
/warden layer content warn   → change layer action
/warden layer preLlm block   → enable a disabled layer
/warden pii mask             → set PII mode (ignore/mask/remove)
/warden reset                → reset statistics
/warden help                 → show all commands
```

Layer changes persist across restarts.

---

## Accuracy

Tested with 20 attack/benign samples:

| Mode | Attack detection | Benign pass-through | Overall | Latency |
|------|-----------------|--------------------:|---------|---------|
| **Offline** (no key) | 30% | 90% | 60% | <1ms |
| **API** (Smart Cascade) | 80% | 100% | 90% | ~93ms |

API mode catches DAN jailbreaks, base64 obfuscation, role-play overrides,
indirect injection, and markdown payloads that offline misses entirely.

---

## Architecture

```
┌─────────────────────────────────┐
│  openclaw-ai-warden (plugin)    │  ← hooks, commands, state
│  ┌───────────────────────────┐  │
│  │  npm ai-warden            │  │  ← all detection logic
│  │  .scan()   → offline      │  │
│  │  .validate() → API/ML     │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

The plugin is a thin wrapper. Update `ai-warden` npm and all consumers
get better detection without any plugin changes.

---

## Config reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | `""` | API key from ai-warden.io. Empty = offline mode |
| `layers.content` | `block\|warn\|off` | `block` | Tool result scanning |
| `layers.channel` | `block\|warn\|off` | `warn` | User message scanning |
| `layers.preLlm` | `block\|warn\|off` | `off` | Full context scanning (expensive) |
| `layers.toolArgs` | `block\|warn\|off` | `warn` | Tool argument scanning |
| `layers.subagents` | `block\|warn\|off` | `warn` | Subagent task scanning |
| `layers.output` | `block\|warn\|off` | `warn` | Output message scanning |
| `pii` | `ignore\|mask\|remove` | `mask` | PII handling mode |
| `sensitivity` | `low\|balanced\|high\|paranoid` | `balanced` | Detection sensitivity |
| `verbose` | boolean | `false` | Log all scans (not just detections) |

---

## Requirements

- OpenClaw 2026.3.x or later
- Node.js 18+
- Optional: API key from [ai-warden.io](https://ai-warden.io/signup)

---

## Links

- **Website:** [ai-warden.io](https://ai-warden.io)
- **NPM (engine):** [ai-warden](https://www.npmjs.com/package/ai-warden)
- **NPM (plugin):** [openclaw-ai-warden](https://www.npmjs.com/package/openclaw-ai-warden)
- **OpenClaw docs:** [docs.openclaw.ai](https://docs.openclaw.ai)

---

MIT License • Built by [AI-Warden Security](https://ai-warden.io)
