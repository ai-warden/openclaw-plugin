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
      return await this.warden.validate(text);
    } catch (err: any) {
      console.warn(`[AI-Warden] API error, falling back to offline: ${err?.message}`);
      return this.scan(text);
    }
  }

  get mode(): string {
    return this.hasApiKey ? "api" : "offline";
  }
}
