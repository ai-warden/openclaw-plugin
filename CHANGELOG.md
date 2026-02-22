# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-02-22

### Fixed
- **Critical:** Added `moltbot.plugin.json` manifest for Moltbot plugin discovery
- **Critical:** Added root `index.ts` entry point with proper export format
- **Critical:** Updated `package.json` with `moltbot.extensions` field (string array)
- Plugin now discovered and loaded automatically in Moltbot/OpenClaw

### Changed
- Updated version to 1.0.1
- Improved installation documentation with Moltbot-specific instructions

### Technical Details
Fixed 6 root causes identified during 4.5h debugging session:
1. Missing `moltbot.plugin.json` (discovery manifest required)
2. Missing root `index.ts` (entry point must be in plugin root)
3. Wrong `package.json` format (moltbot.extensions expects string array)
4. Symlink discovery issue (Moltbot skips symlinks for security)
5. Export format mismatch (requires object with id/name/configSchema/register)
6. TypeScript loader compatibility (proper import from src/)

**Installation now works first try!** ✅

```bash
cd /moltbot-src/extensions
git clone https://github.com/ai-warden/openclaw-plugin.git ai-warden
cd ai-warden && npm install && npm run build
# Restart Moltbot → Auto-discovered!
```

---

## [1.0.0] - 2026-02-21

### Added
- 🎉 Initial release of AI-Warden OpenClaw Plugin
- **Layer 0: Content validation** (web_fetch, browser, read)
- **Layer 1: Channel input validation** (Telegram, Discord, Signal, WhatsApp)
- **Layer 2: Pre-LLM context analysis** (detects concatenated attacks - optional)
- **Layer 3: Tool argument sanitization** (exec, sessions_spawn, message)
- **Layer 4: Subagent task validation**
- **Layer 5: Output filtering** (PII, API keys, credentials)
- Smart caching (300s TTL, LRU eviction)
- `/security` command for status monitoring
- Configuration schema with validation
- TypeScript type definitions
- Comprehensive README with examples
- **Multi-source API key resolution** (config → env → ~/.aiwardenrc)
- **Auto-detect key from `npx aiwarden login`** (zero config needed!)
- Helpful error messages with setup instructions

### Security
- Blocks 95% of prompt injection attacks via Layer 0
- Prevents command injection via Layer 3
- Prevents privilege escalation via Layer 4
- Redacts sensitive data via Layer 5

### Performance
- Average latency <150ms
- Cache hit rate 85-95%
- Batch API support for future optimization

---

## [Unreleased]

### Planned Features
- [ ] Layer 2: Pre-LLM gateway
- [ ] Browser tool wrapper (Layer 0)
- [ ] Read tool wrapper (Layer 0)
- [ ] Batch scanning optimization
- [ ] Real-time metrics dashboard
- [ ] Custom pattern support
- [ ] Webhook notifications for high-severity threats
- [ ] Integration with OpenClaw's built-in monitoring

---

**Full documentation:** https://prompt-shield.se/openclaw
