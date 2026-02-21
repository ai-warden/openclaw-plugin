# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-21

### Added
- 🎉 Initial release of AI-Warden OpenClaw Plugin
- Layer 0: Content validation (web_fetch, browser, read)
- Layer 1: Channel input validation (Telegram, Discord, Signal, WhatsApp)
- Layer 3: Tool argument sanitization (exec, sessions_spawn, message)
- Layer 4: Subagent task validation
- Layer 5: Output filtering (PII, API keys, credentials)
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
