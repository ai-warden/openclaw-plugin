/**
 * AI-Warden OpenClaw Plugin - Type Definitions
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
  
  /** Enable statistics tracking and reporting */
  enableStats?: boolean;
  
  /** Which security layers to enable */
  layers: {
    /** Layer 0: Content validation (web_fetch, browser, read) - CRITICAL */
    content: boolean;
    
    /** Layer 1: Channel input validation */
    channel: boolean;
    
    /** Layer 2: Pre-LLM gateway (context analysis for concatenated attacks) */
    preLlm: boolean;
    
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
    
    /** 
     * Fail-open mode: If API is unavailable, allow requests through
     * - true (default): Bot keeps working, falls back to local patterns
     * - false: Strict security, block if API down
     */
    failOpen?: boolean;
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
    /** PII handling mode: "ignore" (detect only), "mask" (replace with labels), "remove" (delete) */
    piiMode?: 'ignore' | 'mask' | 'remove';
  };
}

/** PII detection statistics */
export interface PIIStats {
  totalScans: number;
  piiDetected: number;
  itemsProcessed: number;
  byType: Record<string, number>;
}

export interface ScanResult {
  /** True if content is safe, false if attack detected */
  safe: boolean;
  
  /** Risk score 0-100 */
  risk: number;
  
  /** Which layer detected the threat */
  layer: string;
  
  /** Human-readable description */
  message: string;
  
  /** Original or cleaned text */
  cleanText?: string;
  
  /** Optional detailed breakdown */
  details?: {
    pattern_score?: number;
    ml_score?: number;
    scout_verdict?: string;
    confidence?: number;
    matched_patterns?: string[];
  };
  
  /** Settings used for validation */
  appliedSettings?: Record<string, unknown>;
  
  /** Sandwich scan metadata */
  sandwich?: {
    enabled: boolean;
    originalWords: number;
    scannedWords: number;
    headWords: number;
    tailWords: number;
  };
  
  // Legacy fields for backward compatibility
  blocked?: boolean;
  score?: number;
  reason?: string;
  threatType?: 'prompt_injection' | 'jailbreak' | 'pii' | 'malware' | 'phishing';
  patterns?: string[];
  confidence?: number;
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
