---
name: ai-warden-setup
version: 2.0.0
description: >
  Install, configure, and manage the AI-Warden prompt injection protection plugin for OpenClaw.
  Use when: (1) setting up AI-Warden on a new OpenClaw instance, (2) configuring security layers
  or API keys, (3) troubleshooting AI-Warden plugin issues, (4) updating the plugin, (5) checking
  warden status or accuracy. Triggers on phrases like "install ai-warden", "setup prompt injection
  protection", "configure warden", "security plugin", "protect my agent".
homepage: https://ai-warden.io
source: https://github.com/ai-warden/openclaw-plugin
credentials:
  - name: AI_WARDEN_API_KEY
    description: "API key from ai-warden.io (optional — offline mode works without it, ~60% accuracy vs 98.9% with key)"
    required: false
    format: "sk_live_..."
    storage: "Stored in ~/.openclaw/openclaw.json under plugins.entries.ai-warden.config.apiKey"
---

# AI-Warden Setup

Prompt injection protection for OpenClaw agents. 5 security shields that detect and block attacks in real-time.

## Requirements

- OpenClaw 2026.3.14+
- Node.js 18+

## Installation — FOLLOW THESE STEPS EXACTLY

### Step 1: Install files (single exec command — run ALL lines together)

```bash
mkdir -p ~/.openclaw/extensions/ai-warden && cd ~/.openclaw/extensions/ai-warden && echo '{"private":true}' > package.json && npm install openclaw-ai-warden@latest --quiet --no-fund --no-audit && cp node_modules/openclaw-ai-warden/index.ts . && cp node_modules/openclaw-ai-warden/openclaw.plugin.json . && cp -r node_modules/openclaw-ai-warden/src . && echo "INSTALL OK: $(grep VERSION index.ts | head -1)"
```

⚠️ **CRITICAL**: Run this as ONE command. All lines joined with `&&`. If any step fails, the whole command fails and you'll see the error.

**Verify**: The output MUST end with `INSTALL OK: const VERSION = "2.x.x"`. If not, the install failed.

### Step 2: Configure OpenClaw (use node to patch JSON safely)

Run this exec command to add the plugin config. It preserves existing config:

```bash
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.openclaw/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!cfg.plugins) cfg.plugins = {};
cfg.plugins.enabled = true;
if (!cfg.plugins.allow) cfg.plugins.allow = [];
if (!cfg.plugins.allow.includes('ai-warden')) cfg.plugins.allow.push('ai-warden');
if (!cfg.plugins.entries) cfg.plugins.entries = {};
cfg.plugins.entries['ai-warden'] = {
  enabled: true,
  config: {
    layers: { content: 'block', channel: 'warn', preLlm: 'off', toolArgs: 'block', subagents: 'block', output: 'off' },
    sensitivity: 'balanced'
  }
};
fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
console.log('CONFIG OK');
"
```

**Verify**: Output must be `CONFIG OK`.

**If the user provided an API key**, run a second command to add it:

```bash
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.openclaw/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
cfg.plugins.entries['ai-warden'].config.apiKey = 'API_KEY_HERE';
fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
console.log('API KEY ADDED');
"
```

Replace `API_KEY_HERE` with the actual key.

### Step 3: Restart gateway

Use the gateway tool to restart:

```
openclaw gateway restart
```

Or if using the gateway tool programmatically: call `gateway restart`.

### Step 4: Verify

After restart, check logs or send `/warden` command. You should see:
```
🛡️ v2.x.x ready (mode: api|offline, layers: X/6)
```

## DO NOT

- Do NOT use `edit` tool on `openclaw.json` — JSON whitespace matching is fragile
- Do NOT use `config.patch` with nested objects — it often fails with format errors  
- Do NOT skip the `cp` step — OpenClaw loads from the extension directory, not node_modules
- Do NOT restart multiple times — wait at least 15 seconds between restarts

## Updating

```bash
cd ~/.openclaw/extensions/ai-warden && npm install openclaw-ai-warden@latest --quiet && cp node_modules/openclaw-ai-warden/index.ts . && cp -r node_modules/openclaw-ai-warden/src . && echo "UPDATE OK"
```

Then restart gateway.

## Security Shields

| Shield | Protects against | Default | Hook |
|--------|-----------------|---------|------|
| **File Shield** | Poisoned files & web pages | `block` | `before_message_write` + `tool_result_persist` |
| **Chat Shield** | Injections in messages | `warn` | `before_prompt_build` |
| **System Shield** | Full context manipulation | `off` | `before_prompt_build` (expensive) |
| **Tool Shield** | Malicious tool arguments | `block` | `before_tool_call` |
| **Agent Shield** | Sub-agent attack chains | `block` | `before_tool_call` |

## Runtime Commands

```
/warden                      → status overview
/warden stats                → scan/block counts  
/warden shield file block    → set File Shield to block mode
/warden shield chat warn     → set Chat Shield to warn mode
/warden reset                → reset statistics
```

## Detection Modes

| Mode | Accuracy | Cost |
|------|----------|------|
| **Offline** (no key) | ~60% | Free |
| **API** (Smart Cascade) | 98.9% | Free tier: 5K calls/month |

Get API key: https://ai-warden.io/signup

## Troubleshooting

- **"plugin not found"**: `openclaw.plugin.json` missing from extension dir. Re-run Step 1.
- **"plugin id mismatch"**: Warning only, plugin still works. Safe to ignore.
- **Config errors after install**: Re-run Step 2 (the node command is idempotent).
- **Bot won't start**: Check `journalctl -u openclaw-gateway -n 20` for the actual error.

## Links

- Plugin: https://github.com/ai-warden/openclaw-plugin
- Engine: https://github.com/ai-warden/ai-warden  
- Website: https://ai-warden.io
- NPM: https://www.npmjs.com/package/openclaw-ai-warden
