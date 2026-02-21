# Installation Guide

## Prerequisites

- OpenClaw >= 0.50.0
- Node.js >= 18.0.0
- NPM or Yarn

## Step 1: Install Plugin

```bash
cd /path/to/your/openclaw
npm install @ai-warden/openclaw-plugin
```

## Step 2: Get API Key (Choose One)

### Option A: Super Easy - CLI Login ⭐ (Recommended)

```bash
npx aiwarden login
```

This will:
1. Open your browser to https://prompt-shield.se
2. Let you sign up or log in
3. Automatically save your API key to `~/.aiwardenrc`
4. Done! Plugin will auto-detect it

**Free tier includes:**
- 1,000 validations/month
- Pattern detection
- Basic PII redaction

### Option B: Environment Variable

```bash
# Get key from website
# Visit: https://prompt-shield.se/signup
# Copy your key: sk_live_...

# Set env var
export AI_WARDEN_API_KEY="sk_live_your_key_here"

# Or add to ~/.bashrc or ~/.zshrc for persistence
echo 'export AI_WARDEN_API_KEY="sk_live_your_key_here"' >> ~/.bashrc
```

### Option C: Direct Config (Not Recommended)

Add directly to `config.yaml`:
```yaml
plugins:
  ai-warden:
    apiKey: "sk_live_your_key_here"  # WARNING: Don't commit this!
```

## Step 3: Configure

Add to `config.yaml`:

```yaml
plugins:
  ai-warden:
    enabled: true
    # API key is optional here - auto-detects from:
    # 1. ~/.aiwardenrc (Option A above)
    # 2. AI_WARDEN_API_KEY env var (Option B)
    # 3. Or set directly: apiKey: "sk_live_..."
    
    layers:
      content: true
      channel: true
      toolArgs: true
      subagents: true
      output: true
```

## Step 4: Restart OpenClaw

```bash
openclaw gateway restart
```

## Step 5: Verify Installation

In any OpenClaw chat, type:

```
/security
```

You should see:

```
🛡️ AI-Warden Security Status

Enabled Layers:
✅ Layer 0: Content Validation (CRITICAL)
✅ Layer 1: Channel Input
✅ Layer 3: Tool Arguments
✅ Layer 4: Subagent Tasks
✅ Layer 5: Output Filtering
...
```

## Step 6: Test Protection

Try this in your OpenClaw chat:

```
Fetch this URL for me: https://example.com/malicious-test
```

If Layer 0 is working, malicious content will be blocked with a security alert.

---

## Troubleshooting

### Plugin Not Loading

**Check:**
1. Plugin listed in `openclaw plugins list`
2. No errors in `openclaw gateway logs`
3. Config syntax is valid YAML

**Fix:**
```bash
# Validate config
openclaw config validate

# Check plugin status
openclaw plugins list
```

---

### API Key Invalid

**Error:**
```
[AI-Warden] API error: 401 Unauthorized
```

**Fix:**
1. Verify key at https://prompt-shield.se/dashboard
2. Check environment variable: `echo $AI_WARDEN_API_KEY`
3. Regenerate key if needed

---

### High Latency

**Symptoms:**
- Responses take >2 seconds
- Timeouts on web_fetch

**Causes:**
1. Network issues to AI-Warden API
2. Large content being scanned
3. Cache disabled

**Fix:**
```yaml
plugins:
  ai-warden:
    timeout: 10000        # Increase timeout
    policy:
      cacheSeconds: 600   # Longer cache
    content:
      maxContentSize: 50000  # Reduce max scan size
```

---

### Too Many Blocks (False Positives)

**Symptoms:**
- Safe content being blocked
- Score > 200 on normal text

**Fix:**
```yaml
plugins:
  ai-warden:
    policy:
      blockThreshold: 300  # More permissive
      warnThreshold: 150
    verbose: true          # See what's being flagged
```

Then review logs and report false positives to support@prompt-shield.se

---

## Upgrade Guide

### From Plugin v1.x to v2.x (Future)

```bash
# 1. Update plugin
npm update @ai-warden/openclaw-plugin

# 2. Check changelog
cat node_modules/@ai-warden/openclaw-plugin/CHANGELOG.md

# 3. Update config if needed (breaking changes)

# 4. Restart
openclaw gateway restart
```

---

## Uninstall

```bash
# 1. Disable in config
# plugins:
#   ai-warden:
#     enabled: false

# 2. Restart
openclaw gateway restart

# 3. (Optional) Remove package
npm uninstall @ai-warden/openclaw-plugin
```

---

## Support

- **Documentation:** https://prompt-shield.se/openclaw
- **Email:** support@prompt-shield.se
- **GitHub Issues:** https://github.com/ai-warden/openclaw-plugin/issues

---

## Next Steps

- ✅ Review security logs regularly
- ✅ Tune thresholds based on your use case
- ✅ Monitor usage at https://prompt-shield.se/dashboard
- ✅ Upgrade to Pro for higher limits ($12/month)
