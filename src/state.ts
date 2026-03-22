import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LayerAction, LayerName, LayerStats, PIIMode, PluginConfig } from "./types.js";

const DEFAULT_LAYERS: Record<LayerName, LayerAction> = {
  content: "block",
  channel: "warn",
  preLlm: "off",
  toolArgs: "warn",
  subagents: "warn",
  output: "warn",
};

interface PersistedState {
  layers: Record<LayerName, LayerAction>;
  piiMode: PIIMode;
}

export class State {
  private layers: Record<LayerName, LayerAction>;
  private stats: Record<LayerName, LayerStats>;
  private piiMode: PIIMode;
  private hasPromptedUpgrade = false;
  private stateFile: string;

  constructor(config: PluginConfig, stateDir?: string) {
    // State file lives next to the plugin or in a provided dir
    const dir = stateDir || join(process.env.HOME || "~", ".openclaw", "state");
    this.stateFile = join(dir, "ai-warden-state.json");

    // Start from config defaults
    this.layers = { ...DEFAULT_LAYERS, ...config.layers };
    this.piiMode = config.pii || "mask";

    // Overlay persisted runtime overrides (from /warden commands)
    this.loadPersistedState();

    this.stats = {} as Record<LayerName, LayerStats>;
    for (const name of Object.keys(DEFAULT_LAYERS) as LayerName[]) {
      this.stats[name] = { scans: 0, blocked: 0, warned: 0 };
    }
  }

  private loadPersistedState(): void {
    try {
      const data = readFileSync(this.stateFile, "utf-8");
      const persisted: PersistedState = JSON.parse(data);
      if (persisted.layers) {
        for (const [k, v] of Object.entries(persisted.layers)) {
          if (k in this.layers) this.layers[k as LayerName] = v as LayerAction;
        }
      }
      if (persisted.piiMode) this.piiMode = persisted.piiMode;
      console.log(`[AI-Warden] Loaded persisted state from ${this.stateFile}`);
    } catch {
      // No persisted state yet — use config defaults
    }
  }

  private persistState(): void {
    try {
      const data: PersistedState = { layers: this.layers, piiMode: this.piiMode };
      mkdirSync(dirname(this.stateFile), { recursive: true });
      writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.warn(`[AI-Warden] Failed to persist state: ${err?.message}`);
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
    this.persistState();
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
    this.persistState();
  }

  resetStats(): void {
    for (const name of Object.keys(DEFAULT_LAYERS) as LayerName[]) {
      this.stats[name] = { scans: 0, blocked: 0, warned: 0 };
    }
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
