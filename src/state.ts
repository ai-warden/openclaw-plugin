import type { LayerAction, LayerName, LayerStats, PIIMode, PluginConfig } from "./types.js";

const DEFAULT_LAYERS: Record<LayerName, LayerAction> = {
  content: "block",
  channel: "warn",
  preLlm: "off",
  toolArgs: "warn",
  subagents: "warn",
  output: "warn",
};

export class State {
  private layers: Record<LayerName, LayerAction>;
  private stats: Record<LayerName, LayerStats>;
  private piiMode: PIIMode;
  private hasPromptedUpgrade = false;

  constructor(config: PluginConfig) {
    this.layers = { ...DEFAULT_LAYERS, ...config.layers };
    this.piiMode = config.pii || "mask";
    this.stats = {} as Record<LayerName, LayerStats>;
    for (const name of Object.keys(DEFAULT_LAYERS) as LayerName[]) {
      this.stats[name] = { scans: 0, blocked: 0, warned: 0 };
    }
  }

  action(layer: LayerName): LayerAction {
    return this.layers[layer];
  }

  isEnabled(layer: LayerName): boolean {
    return this.layers[layer] !== "off";
  }

  setAction(layer: LayerName, action: LayerAction): void {
    this.layers[layer] = action;
  }

  record(layer: LayerName, action: "scan" | "block" | "warn"): void {
    this.stats[layer].scans++;
    this.stats[layer].lastScan = Date.now();
    if (action === "block") this.stats[layer].blocked++;
    if (action === "warn") this.stats[layer].warned++;
  }

  getPIIMode(): PIIMode {
    return this.piiMode;
  }

  setPIIMode(mode: PIIMode): void {
    this.piiMode = mode;
  }

  shouldPromptUpgrade(): boolean {
    if (this.hasPromptedUpgrade) return false;
    this.hasPromptedUpgrade = true;
    return true;
  }

  getStatus(): string {
    const LAYER_LABELS: Record<LayerName, string> = {
      content: "Layer 0: Content Validation",
      channel: "Layer 1: Channel Input",
      preLlm: "Layer 2: Pre-LLM Context",
      toolArgs: "Layer 3: Tool Arguments",
      subagents: "Layer 4: Subagent Tasks",
      output: "Layer 5: Output Filtering",
    };

    const ICONS: Record<LayerAction, string> = {
      block: "🛑",
      warn: "⚠️",
      log: "📝",
      off: "⬛",
    };

    let out = "🛡️ **AI-Warden Security Status**\n\n";

    for (const [name, label] of Object.entries(LAYER_LABELS)) {
      const action = this.layers[name as LayerName];
      const icon = ICONS[action];
      const s = this.stats[name as LayerName];
      out += `${icon} ${label}: **${action}**`;
      if (s.scans > 0) {
        out += ` (${s.scans} scans, ${s.blocked} blocked, ${s.warned} warned)`;
      }
      out += "\n";
    }

    out += `\nPII Mode: **${this.piiMode}**`;
    return out;
  }

  getStats(): string {
    let total = 0, totalBlocked = 0, totalWarned = 0;
    for (const s of Object.values(this.stats)) {
      total += s.scans;
      totalBlocked += s.blocked;
      totalWarned += s.warned;
    }
    return (
      `📊 **AI-Warden Statistics**\n\n` +
      `Total scans: ${total}\n` +
      `Blocked: ${totalBlocked}\n` +
      `Warned: ${totalWarned}\n` +
      `Pass rate: ${total > 0 ? ((1 - totalBlocked / total) * 100).toFixed(1) : "N/A"}%`
    );
  }
}
