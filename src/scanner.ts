import { createRequire } from "node:module";
import type { ScanResult } from "./types.js";

const require = createRequire(import.meta.url);

export class Scanner {
  private warden: any;
  private hasApiKey: boolean;

  constructor(apiKey?: string) {
    const AIWarden = require("ai-warden");
    this.hasApiKey = !!apiKey;
    this.warden = apiKey ? new AIWarden(apiKey) : new AIWarden();
  }

  /** Sync offline scan — pattern matching only. Use for sync hooks. */
  scan(text: string): ScanResult {
    return this.warden.scan(text);
  }

  /** Async scan — uses API if key set, falls back to offline. */
  async validate(text: string): Promise<ScanResult> {
    if (!this.hasApiKey) return this.scan(text);
    try {
      const raw = await this.warden.validate(text);
      return this.normalizeApiResult(raw);
    } catch (err: any) {
      console.warn(`[AI-Warden] API error, falling back to offline: ${err?.message}`);
      return this.scan(text);
    }
  }

  /** Normalize API response (safe/decision/confidence) to ScanResult (passed/riskScore/findings) */
  private normalizeApiResult(raw: any): ScanResult {
    // API returns: { safe, decision, riskScore, confidence, layer, latency_ms, cleanText }
    // We need:    { passed, riskScore, riskLevel, findings, stats }
    
    // If it already has 'passed' (offline format), return as-is
    if (typeof raw.passed === "boolean") return raw;

    const passed = raw.safe === true || raw.decision === "ALLOW";
    const confidence = raw.confidence || 0;
    const riskScore = passed ? 0 : Math.round(confidence * 1000);
    
    let riskLevel = "NONE";
    if (!passed) {
      if (confidence >= 0.9) riskLevel = "CRITICAL";
      else if (confidence >= 0.7) riskLevel = "HIGH";
      else if (confidence >= 0.4) riskLevel = "MEDIUM";
      else riskLevel = "LOW";
    }

    return {
      passed,
      riskScore,
      riskLevel,
      findings: passed ? [] : [{ name: `API: ${raw.layer || "cascade"}`, severity: riskLevel }],
      stats: { scanTimeMs: raw.latency_ms || 0 },
      cleanText: raw.cleanText,
    } as ScanResult;
  }

  get mode(): string {
    return this.hasApiKey ? "api" : "offline";
  }
}
