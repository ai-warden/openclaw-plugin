/**
 * SecurityValidator - Wrapper around ai-warden core package
 * Provides OpenClaw-specific validation logic
 */

import AIWarden from 'ai-warden';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SecurityConfig, ScanResult, ValidationResult, FilterResult } from './types.js';

interface CachedResult {
  result: ScanResult;
  timestamp: number;
}

export class SecurityValidator {
  private warden: AIWarden;
  private cache: Map<string, CachedResult>;
  private config: SecurityConfig;
  private notifyApiDown?: (message: string) => void;
  
  constructor(config: SecurityConfig, notifyApiDown?: (message: string) => void) {
    this.notifyApiDown = notifyApiDown;
    this.config = config;
    
    // Resolve API key from multiple sources (priority chain)
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
    
    this.warden = new AIWarden(apiKey, {
      mode: 'balanced',
      verbose: config.verbose || false
    });
    
    this.cache = new Map();
    
    // Periodic cache cleanup
    setInterval(() => this.cleanupCache(), 60_000); // Every minute
  }
  
  /**
   * Resolve API key from multiple sources (priority chain)
   * 1. Config file (highest priority)
   * 2. Environment variable
   * 3. ~/.aiwardenrc (from `aiwarden login`)
   */
  private resolveApiKey(configKey?: string): string | undefined {
    // Priority 1: Config file
    if (configKey) {
      if (this.config.verbose) {
        console.log('[AI-Warden] Using API key from config file');
      }
      return configKey;
    }
    
    // Priority 2: Environment variable
    const envKey = process.env.AI_WARDEN_API_KEY;
    if (envKey) {
      if (this.config.verbose) {
        console.log('[AI-Warden] Using API key from environment variable');
      }
      return envKey;
    }
    
    // Priority 3: ~/.aiwardenrc
    const rcPath = path.join(os.homedir(), '.aiwardenrc');
    if (fs.existsSync(rcPath)) {
      try {
        const rcContent = fs.readFileSync(rcPath, 'utf8');
        const rc = JSON.parse(rcContent);
        if (rc.apiKey) {
          if (this.config.verbose) {
            console.log('[AI-Warden] Using API key from ~/.aiwardenrc');
          }
          return rc.apiKey;
        }
      } catch (error) {
        console.warn('[AI-Warden] Failed to read ~/.aiwardenrc:', error);
      }
    }
    
    return undefined;
  }
  
  /**
   * Scan content for prompt injection and malicious patterns
   */
  async scanContent(params: {
    content: string;
    source: string;
    metadata?: Record<string, unknown>;
  }): Promise<ScanResult> {
    const { content, source, metadata } = params;
    
    // Check cache first
    const cacheKey = this.getCacheKey(content);
    const cached = this.cache.get(cacheKey);
    
    if (cached && !this.isCacheExpired(cached)) {
      if (this.config.verbose) {
        console.log(`[AI-Warden] Cache hit for ${source}`);
      }
      return cached.result;
    }
    
    // Call AI-Warden API
    try {
      const apiResult: any = await this.warden.validate(content, {
        context: source,
        metadata
      });
      
      // DEBUG: Log raw API response
      console.log('[AI-Warden] Raw API response:', JSON.stringify(apiResult, null, 2));
      
      // AI-Warden API returns: safe, risk, layer, message
      // (NOT threat, score, reason - those are legacy!)
      const result: ScanResult = {
        safe: apiResult.safe !== undefined ? apiResult.safe : !apiResult.threat,
        risk: apiResult.risk !== undefined ? apiResult.risk : (apiResult.score || 0),
        layer: apiResult.layer || source,
        message: apiResult.message || apiResult.reason || '',
        // Legacy fields for backward compatibility
        blocked: apiResult.threat || !apiResult.safe || false,
        score: apiResult.risk || apiResult.score || 0,
        reason: apiResult.message || apiResult.reason,
        threatType: apiResult.type as any,
        patterns: apiResult.details?.matched_patterns || apiResult.patterns,
        confidence: apiResult.details?.confidence || apiResult.confidence
      };
      
      // Cache the result
      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      return result;
      
    } catch (error: any) {
      // Notify about API error (rate-limited)
      if (this.notifyApiDown) {
        this.notifyApiDown(
          `⚠️ **AI-Warden API Unavailable**\n\n` +
          `Error: ${error.message}\n` +
          `Falling back to local pattern matching (~70-80% protection)\n\n` +
          `This message is rate-limited to once per hour.`
        );
      }
      
      // Check fail-open policy
      const failOpen = this.config.policy?.failOpen !== false; // Default: true
      
      if (failOpen) {
        // Fallback to local scanning if API fails
        console.warn(`[AI-Warden] API error, falling back to local scan: ${error.message}`);
        return this.scanContentLocal(content);
      } else {
        // Fail closed - strict security mode
        console.error(`[AI-Warden] API unavailable (fail-closed mode): ${error.message}`);
        throw new Error('[AI-Warden] Security validation unavailable. Please try again later.');
      }
    }
  }
  
  /**
   * Fallback: Local scanning without API
   */
  private scanContentLocal(content: string): ScanResult {
    const localResult = this.warden.scan(content);
    
    return {
      safe: !localResult.threat,
      risk: localResult.score || 0,
      layer: 'local',
      message: localResult.reason || 'Local pattern match',
      // Legacy fields for backward compatibility
      blocked: localResult.threat || false,
      score: localResult.score || 0,
      reason: localResult.reason || 'Local pattern match',
      patterns: localResult.patterns,
      confidence: 0.7 // Lower confidence for local-only
    };
  }
  
  /**
   * Validate tool arguments (Layer 3)
   */
  async validateToolArgs(params: {
    toolName: string;
    params: Record<string, unknown>;
  }): Promise<ValidationResult> {
    switch (params.toolName) {
      case 'exec':
        return this.validateExec(params.params);
      case 'sessions_spawn':
        return this.validateSubagent(params.params);
      case 'message':
        return this.validateMessage(params.params);
      default:
        return { block: false };
    }
  }
  
  /**
   * Filter output for PII and credentials (Layer 5)
   */
  async filterOutput(content: string): Promise<FilterResult> {
    let filtered = content;
    let modified = false;
    const matches: Array<{ type: string; value: string }> = [];
    
    if (this.config.output?.redactApiKeys) {
      const apiKeyPatterns = [
        { type: 'openai', pattern: /sk-[a-zA-Z0-9]{48}/g },
        { type: 'anthropic', pattern: /sk-ant-[a-zA-Z0-9-]{95}/g },
        { type: 'google', pattern: /AIza[0-9A-Za-z-_]{35}/g },
        { type: 'github', pattern: /ghp_[a-zA-Z0-9]{36}/g },
        { type: 'ai-warden', pattern: /sk_live_[a-zA-Z0-9]{32}/g },
      ];
      
      for (const { type, pattern } of apiKeyPatterns) {
        const found = filtered.match(pattern);
        if (found) {
          matches.push(...found.map(value => ({ type, value })));
          filtered = filtered.replace(pattern, `[REDACTED_${type.toUpperCase()}_API_KEY]`);
          modified = true;
        }
      }
    }
    
    if (this.config.output?.redactEmails) {
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const found = filtered.match(emailPattern);
      if (found) {
        matches.push(...found.map(value => ({ type: 'email', value })));
        filtered = filtered.replace(emailPattern, '[REDACTED_EMAIL]');
        modified = true;
      }
    }
    
    if (this.config.output?.redactPaths) {
      const pathPatterns = [
        /\/home\/[a-zA-Z0-9_-]+/g,
        /\/Users\/[a-zA-Z0-9_-]+/g,
        /C:\\Users\\[a-zA-Z0-9_-]+/g
      ];
      
      for (const pattern of pathPatterns) {
        if (pattern.test(filtered)) {
          filtered = filtered.replace(pattern, '[REDACTED_PATH]');
          modified = true;
        }
      }
    }
    
    return { content: filtered, modified, matches };
  }
  
  /**
   * Validate exec command (Layer 3)
   */
  private validateExec(params: Record<string, unknown>): ValidationResult {
    const command = String(params.command || '');
    
    // Command injection patterns
    const dangerousPatterns = [
      { pattern: /;\s*(rm|curl|wget|bash|sh)\s/i, reason: 'Command chaining detected' },
      { pattern: /\$\([^)]*\)/, reason: 'Command substitution detected' },
      { pattern: /`[^`]*`/, reason: 'Backtick execution detected' },
      { pattern: /\|\s*(nc|netcat|telnet)/i, reason: 'Network exfiltration attempt' },
      { pattern: />\s*\/dev\/(tcp|udp)/, reason: 'Network file descriptor manipulation' },
      { pattern: /eval\s*\(/, reason: 'Eval injection attempt' }
    ];
    
    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(command)) {
        return { block: true, reason, confidence: 0.9 };
      }
    }
    
    return { block: false };
  }
  
  /**
   * Validate subagent task (Layer 4)
   */
  private validateSubagent(params: Record<string, unknown>): ValidationResult {
    const task = String(params.task || '');
    
    // Privilege escalation patterns
    const escalationPatterns = [
      { pattern: /elevated\s*=\s*true/i, reason: 'Elevated execution requested' },
      { pattern: /sudo|su\s/i, reason: 'Privilege elevation command' },
      { pattern: /delete\s+(all|everything|.*database)/i, reason: 'Mass deletion attempt' },
      { pattern: /chmod\s+777/i, reason: 'Permission manipulation' }
    ];
    
    for (const { pattern, reason } of escalationPatterns) {
      if (pattern.test(task)) {
        return { block: true, reason, confidence: 0.85 };
      }
    }
    
    return { block: false };
  }
  
  /**
   * Validate message send (Layer 3)
   */
  private validateMessage(params: Record<string, unknown>): ValidationResult {
    const message = String(params.message || '');
    
    // Prevent spam or abuse
    if (message.length > 10000) {
      return { block: true, reason: 'Message exceeds maximum length', confidence: 1.0 };
    }
    
    // Check for mass messaging attempts
    if (Array.isArray(params.targets) && params.targets.length > 50) {
      return { block: true, reason: 'Mass messaging attempt detected', confidence: 0.9 };
    }
    
    return { block: false };
  }
  
  /**
   * Generate cache key from content
   */
  private getCacheKey(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);
  }
  
  /**
   * Check if cached result is expired
   */
  private isCacheExpired(cached: CachedResult): boolean {
    const ttl = (this.config.policy?.cacheSeconds || 300) * 1000;
    return Date.now() - cached.timestamp > ttl;
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    for (const [key, cached] of this.cache.entries()) {
      if (this.isCacheExpired(cached)) {
        this.cache.delete(key);
      }
    }
  }
}
