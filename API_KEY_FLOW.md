# API Key Authentication Flow

## 🔑 Three Ways to Provide API Key

The plugin uses a **priority chain** to find your API key:

```
1. Config file        (highest priority)
   ↓
2. Environment var
   ↓
3. ~/.aiwardenrc      (from CLI login)
   ↓
4. Not found → Error with helpful message
```

---

## ⭐ Option 1: CLI Login (Recommended)

**Easiest and most secure:**

```bash
# One command to get & save key
npx aiwarden login
```

**What happens:**
1. Opens browser to https://prompt-shield.se
2. User signs up or logs in
3. Website redirects to `http://localhost:8765?key=sk_live_...`
4. CLI receives key and saves to `~/.aiwardenrc`:
   ```json
   {
     "apiKey": "sk_live_abc123..."
   }
   ```
5. Plugin auto-detects key from this file

**Config:**
```yaml
plugins:
  ai-warden:
    enabled: true
    # No apiKey needed - auto-detected from ~/.aiwardenrc
    layers: { ... }
```

**Advantages:**
- ✅ One command
- ✅ No manual copy/paste
- ✅ Not in config file (safer)
- ✅ Not in environment (cleaner)
- ✅ Persists across sessions

---

## 🌍 Option 2: Environment Variable

**Good for containers/Docker:**

```bash
export AI_WARDEN_API_KEY="sk_live_your_key_here"
```

**Config:**
```yaml
plugins:
  ai-warden:
    enabled: true
    # apiKey auto-detected from environment
    layers: { ... }
```

**Or with explicit reference:**
```yaml
plugins:
  ai-warden:
    enabled: true
    apiKey: ${AI_WARDEN_API_KEY}  # Moltbot substitutes from env
    layers: { ... }
```

**Advantages:**
- ✅ Not in config file
- ✅ Easy for Docker/CI/CD
- ✅ Standard practice

**Disadvantages:**
- ❌ Must set in every shell
- ❌ Easy to forget in new terminals

---

## 📝 Option 3: Config File

**Direct in config.yaml:**

```yaml
plugins:
  ai-warden:
    enabled: true
    apiKey: "sk_live_your_key_here"
    layers: { ... }
```

**Advantages:**
- ✅ Simple
- ✅ Explicit

**Disadvantages:**
- ❌ Risk of committing to git
- ❌ Less secure (key visible in config)
- ❌ Must update config to change key

⚠️ **Not recommended for production**

---

## 🔍 How the Plugin Resolves Keys

**Code flow in `SecurityValidator`:**

```typescript
constructor(config: SecurityConfig) {
  // Resolve API key from multiple sources
  const apiKey = this.resolveApiKey(config.apiKey);
  
  if (!apiKey) {
    throw new Error(
      'AI-Warden API key required. Get one by:\n' +
      '  1. Run: npx aiwarden login (easiest)\n' +
      '  2. Set env var: export AI_WARDEN_API_KEY="sk_live_..."\n' +
      '  3. Add to config: apiKey: "sk_live_..."\n' +
      'Sign up for free: https://prompt-shield.se/signup'
    );
  }
  
  this.warden = new AIWarden(apiKey, { ... });
}

private resolveApiKey(configKey?: string): string | undefined {
  // Priority 1: Config file
  if (configKey) {
    console.log('[AI-Warden] Using API key from config file');
    return configKey;
  }
  
  // Priority 2: Environment variable
  const envKey = process.env.AI_WARDEN_API_KEY;
  if (envKey) {
    console.log('[AI-Warden] Using API key from environment variable');
    return envKey;
  }
  
  // Priority 3: ~/.aiwardenrc
  const rcPath = path.join(os.homedir(), '.aiwardenrc');
  if (fs.existsSync(rcPath)) {
    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    if (rc.apiKey) {
      console.log('[AI-Warden] Using API key from ~/.aiwardenrc');
      return rc.apiKey;
    }
  }
  
  return undefined;
}
```

---

## 🎯 Recommended Setup

**For individual users:**
```bash
npx aiwarden login
```
Done! No config changes needed.

**For teams/CI/CD:**
```bash
export AI_WARDEN_API_KEY="sk_live_..."
```
Set once in environment.

**For development:**
```bash
# Dev environment - disable plugin
plugins:
  ai-warden:
    enabled: false
```

**For production:**
```bash
# Use environment variable
export AI_WARDEN_API_KEY="sk_live_..."

# Or use CLI login
npx aiwarden login
```

---

## 🔒 Security Best Practices

1. **Never commit API keys to git**
   - Use `.gitignore` for config files with keys
   - Use environment variables or ~/.aiwardenrc

2. **Rotate keys regularly**
   ```bash
   # Generate new key on website
   npx aiwarden logout
   npx aiwarden login
   ```

3. **Use different keys for dev/prod**
   - `sk_test_...` for testing
   - `sk_live_...` for production

4. **Check key status**
   ```bash
   npx aiwarden whoami
   ```

---

## 🆘 Troubleshooting

### "API key required" error

**Check which method you're using:**
```bash
# Check env var
echo $AI_WARDEN_API_KEY

# Check ~/.aiwardenrc
cat ~/.aiwardenrc

# Check current status
npx aiwarden whoami
```

**Fix:**
```bash
# Easiest: Use CLI login
npx aiwarden login

# Or set env var
export AI_WARDEN_API_KEY="sk_live_your_key_here"
```

### Key works in terminal but not in Moltbot

**Cause:** Environment variable not set in Moltbot's shell

**Fix:**
```bash
# Use ~/.aiwardenrc instead (persists)
npx aiwarden login

# Or add to system profile
echo 'export AI_WARDEN_API_KEY="sk_live_..."' >> ~/.bashrc
source ~/.bashrc
```

### Want to use different keys per environment

**Solution:** Use config file with environment-specific configs

```yaml
# config.dev.yaml
plugins:
  ai-warden:
    apiKey: "sk_test_dev_key"

# config.prod.yaml
plugins:
  ai-warden:
    apiKey: ${AI_WARDEN_API_KEY}  # From environment
```

---

## 📊 Priority Examples

### Example 1: All three set
```bash
# ~/.aiwardenrc
{ "apiKey": "sk_live_from_rc" }

# Environment
export AI_WARDEN_API_KEY="sk_live_from_env"

# config.yaml
apiKey: "sk_live_from_config"
```

**Result:** Uses `sk_live_from_config` (highest priority)

### Example 2: Env + RC set
```bash
# ~/.aiwardenrc
{ "apiKey": "sk_live_from_rc" }

# Environment
export AI_WARDEN_API_KEY="sk_live_from_env"

# config.yaml
# (no apiKey set)
```

**Result:** Uses `sk_live_from_env` (priority 2)

### Example 3: Only RC set
```bash
# ~/.aiwardenrc
{ "apiKey": "sk_live_from_rc" }

# Environment
# (not set)

# config.yaml
# (no apiKey set)
```

**Result:** Uses `sk_live_from_rc` (priority 3)

---

## 🎓 User Education

**Include in onboarding:**

> **Getting Started with AI-Warden**
> 
> The easiest way to authenticate is:
> ```bash
> npx aiwarden login
> ```
> This opens your browser, logs you in, and saves your key automatically.
> No manual configuration needed!
> 
> Alternative: Set environment variable:
> ```bash
> export AI_WARDEN_API_KEY="your_key_here"
> ```

---

**Summary:** ✅ All three methods implemented with clear priority chain and helpful error messages.
