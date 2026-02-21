/**
 * Type declarations for ai-warden package
 */

declare module 'ai-warden' {
  export interface ValidateOptions {
    context?: string;
    metadata?: Record<string, unknown>;
    forceFull?: boolean;
  }

  export interface ValidateResult {
    threat?: boolean;
    score?: number;
    reason?: string;
    type?: string;
    patterns?: string[];
    confidence?: number;
    data?: any;
  }

  export interface ScanResult {
    threat?: boolean;
    score?: number;
    reason?: string;
    patterns?: string[];
    piiDetected?: boolean;
    details?: any;
  }

  export interface PIIOptions {
    types?: string[];
    context?: string;
  }

  export default class AIWarden {
    constructor(apiKey?: string, options?: { mode?: string; threshold?: number; verbose?: boolean; context?: string });
    
    scan(content: string, options?: any): ScanResult;
    validate(content: string, options?: ValidateOptions): Promise<ValidateResult>;
    validateLocal(content: string, options?: ValidateOptions): Promise<ValidateResult>;
    detectPII(content: string, options?: PIIOptions): any;
    maskPII(content: string, findings: any, options?: any): string;
    init(): Promise<void>;
    refreshSettings(): Promise<void>;
    getSettings(): any;
    isInitialized(): boolean;
  }
}
