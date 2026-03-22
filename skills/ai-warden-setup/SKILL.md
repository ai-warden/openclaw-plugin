---
name: ai-warden-setup
description: >
  Install, configure, and manage the AI-Warden prompt injection protection plugin for OpenClaw.
  Use when: (1) setting up AI-Warden on a new OpenClaw instance, (2) configuring security layers
  or API keys, (3) troubleshooting AI-Warden plugin issues, (4) updating the plugin, (5) checking
  warden status or accuracy. Triggers on phrases like "install ai-warden", "setup prompt injection
  protection", "configure warden", "security plugin", "protect my agent".
---

# AI-Warden Setup

Install and configure prompt injection protection for any OpenClaw instance.

## Prerequisites

- OpenClaw 2026.3.x or later running
- Node.js 18+
- Shell access (exec tool)

## Installation

### Quick Install (recommended)

Run the installer script. It handles everything: npm install, file copy, config update.

```bash
# Offline mode (~60% accuracy, no API key needed)
mkdir -p ~/.openclaw/extensions/ai-warden && cd $_
[ ! -f package.json ] && echo '{"private":true}' > package.json
npm install openclaw-ai-warden@latest --quiet --no-fund --no-audit
cp node_modules/openclaw-ai-warden/index.ts .
cp node_modules/openclaw-ai-warden/openclaw.plugin.json .
cp -r node_modules/openclaw-ai-warden/src .
```

### Configure OpenClaw

Add to `~/.openclaw/openclaw.json` under `plugins`:

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["ai-warden"],
    "entries": {
      "ai-warden": {
        "enabled": true,
        "config": {
          "layers": {
            "content": "block",
            "channel": "warn",
            "preLlm": "off",
            "toolArgs": "warn",
            "subagents": "warn",
            "output": "warn"
          },
          "pii": "mask",
          "sensitivity": "balanced"
        }
      }
    }
  }
}
```

### With API Key (recommended, ~90% accuracy)

Add `"apiKey": "sk_live_YOUR_KEY"` inside the config block above.

Get a free key at https://ai-warden.io/signup

### Activate

Restart the gateway after installation:

```bash
openclaw gateway restart
```

## Security Layers

6 layers protect at every stage:

| Layer | What it scans | Default | When |
|-------|---------------|---------|------|
| Content (0) | web_fetch, browser, file read results | `block` | Tool results arrive |
| Channel (1) | Incoming user messages | `warn` | Message received |
| Pre-LLM (2) | Full conversation context | `off` | Before LLM call (expensive) |
| Tool Args (3) | exec, write, edit parameters | `warn` | Before tool execution |
| Subagents (4) | sessions_spawn task text | `warn` | Before spawning |
| Output (5) | Outgoing messages to user | `warn` | Before sending |

Actions: `block` (prevent + replace message), `warn` (inject system warning), `off` (disabled)

## Runtime Commands

Control via chat — no restart needed:

```
/warden                      → status overview
/warden stats                → scan/block/warn counts
/warden layer content warn   → change layer action
/warden layer preLlm block   → enable a disabled layer
/warden pii mask             → PII mode (ignore/mask/remove)
/warden reset                → reset statistics
```

Layer changes persist across restarts (saved to `~/.openclaw/state/ai-warden-state.json`).

## Detection Modes

| Mode | Accuracy | Latency | Cost |
|------|----------|---------|------|
| **Offline** (no key) | ~60% | <1ms | Free |
| **API** (Smart Cascade) | ~90% | ~93ms | Usage-based |

API mode uses XGBoost ML + pattern matching + vector similarity. Catches DAN jailbreaks, base64 obfuscation, role-play overrides, indirect injection, and markdown payloads that offline misses.

## Updating

```bash
cd ~/.openclaw/extensions/ai-warden
npm install openclaw-ai-warden@latest --quiet
cp node_modules/openclaw-ai-warden/index.ts .
cp -r node_modules/openclaw-ai-warden/src .
openclaw gateway restart
```

## Troubleshooting

- **"plugin not found"**: Verify `openclaw.plugin.json` exists in `~/.openclaw/extensions/ai-warden/`
- **"plugin id mismatch"**: The `package.json` name field must NOT be `openclaw-ai-warden` — rename to `ai-warden` or delete package.json name
- **100% false positives**: Update `ai-warden` npm to ≥1.1.1 (API response normalization fix)
- **High RAM usage**: Plugin adds ~140MB. Needs 2GB+ total for OpenClaw + Telegram + plugin
- **Config not loading**: Check JSON syntax in `~/.openclaw/openclaw.json` — use `openclaw gateway status`

## Architecture

```
openclaw-ai-warden (plugin) → hooks, commands, state persistence
  └── ai-warden (npm)       → all detection logic (offline + API)
```

Plugin is a thin wrapper. Updating `ai-warden` npm improves detection for all users without plugin changes.

## Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | `""` | API key. Empty = offline mode |
| `layers.*` | `block\|warn\|off` | varies | Per-layer action |
| `pii` | `ignore\|mask\|remove` | `mask` | PII handling |
| `sensitivity` | `low\|balanced\|high\|paranoid` | `balanced` | Detection threshold |
| `verbose` | boolean | `false` | Log all scans |

## Links

- Website: https://ai-warden.io
- NPM engine: https://www.npmjs.com/package/ai-warden
- NPM plugin: https://www.npmjs.com/package/openclaw-ai-warden
