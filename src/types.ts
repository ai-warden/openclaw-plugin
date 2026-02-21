/**
 * AI-Warden Moltbot Plugin - Type Definitions
 */

export interface SecurityConfig {
  /** 
   * API key from https://prompt-shield.se/signup
   * Optional - will auto-detect from:
   * 1. This config field
   * 2. AI_WARDEN_API_KEY environment variable
   * 3. ~/.aiwardenrc (from `npx aiwarden login`)
   */
  apiKey?: string;
  
  /** API endpoint (default: https://api.prompt-shield.se/v1) */
  endpoint?: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Which security layers to enable */
  layers: {
    /** Layer 0: Content validation (web_fetch, browser, read) - CRITICAL */
    content: boolean;
    
    /** Layer 1: Channel input validation */
    channel: boolean;
    
    /** Layer 2: Pre-LLM gateway (future) */
    preLlm?: boolean;
    
    /** Layer 3: Tool argument sanitization */
    toolArgs: boolean;
    
    /** Layer 4: Subagent task validation */
    subagents: boolean;
    
    /** Layer 5: Output filtering (PII, credentials) */
    output: boolean;
  };
  
  /** Security policy thresholds */
  policy?: {
    /** Score above which content is blocked (0-1000) */
    blockThreshold: number;
    
    /** Score above which warnings are logged (0-1000) */
    warnThreshold: number;
    
    /** Cache TTL in seconds */
    cacheSeconds: number;
  };
  
  /** Content validation settings */
  content?: {
    scanUrls: boolean;
    scanFiles: boolean;
    maxContentSize: number;
  };
  
  /** Output filtering settings */
  output?: {
    redactEmails: boolean;
    redactApiKeys: boolean;
    redactPaths: boolean;
  };
}

export interface ScanResult {
  /** True if content should be blocked */
  blocked: boolean;
  
  /** Threat score (0-1000) */
  score: number;
  
  /** Human-readable reason for block/warning */
  reason?: string;
  
  /** Type of threat detected */
  threatType?: 'prompt_injection' | 'jailbreak' | 'pii' | 'malware' | 'phishing';
  
  /** Matched patterns (if available) */
  patterns?: string[];
  
  /** Confidence level (0-1) */
  confidence?: number;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  /** True if execution should be blocked */
  block: boolean;
  
  /** Reason for blocking */
  reason?: string;
  
  /** Confidence level (0-1) */
  confidence?: number;
}

export interface FilterResult {
  /** Filtered content (with redactions) */
  content: string;
  
  /** True if content was modified */
  modified: boolean;
  
  /** List of redacted items */
  matches?: Array<{
    type: string;
    value: string;
  }>;
}
