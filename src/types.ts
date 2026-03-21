export type LayerAction = "block" | "warn" | "log" | "off";
export type PIIMode = "ignore" | "mask" | "remove";

export type LayerName = "content" | "channel" | "preLlm" | "toolArgs" | "subagents" | "output";

export interface PluginConfig {
  apiKey?: string;
  layers: Record<LayerName, LayerAction>;
  pii: PIIMode;
  sensitivity: string;
  autoUpdate: boolean;
  verbose: boolean;
}

export interface ScanResult {
  passed: boolean;
  riskScore: number;
  riskLevel: string;
  findings: Array<{ name: string; severity: string }>;
  stats?: { scanTimeMs?: number };
}

export interface LayerStats {
  scans: number;
  blocked: number;
  warned: number;
  lastScan?: number;
}
