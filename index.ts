/**
 * AI-Warden Security Plugin for OpenClaw — v2.0
 *
 * Multi-layer prompt injection protection.
 * All detection logic lives in the `ai-warden` npm package.
 * This plugin only wires it to OpenClaw's plugin API.
 */

import { execSync } from "node:child_process";
import { Scanner } from "./src/scanner.js";
import { State } from "./src/state.js";
import { registerLayers } from "./src/layers.js";
import { registerCommands } from "./src/commands.js";
import type { PluginConfig, LayerAction } from "./src/types.js";

const TAG = "[AI-Warden]";
const VERSION = "2.0.0";

function register(api: any) {
  console.log(`${TAG} Plugin v${VERSION} initializing...`);

  // ── Read config ─────────────────────────────────────────────────────
  const raw = api.pluginConfig || {};

  const config: PluginConfig = {
    apiKey: raw.apiKey || process.env.AI_WARDEN_API_KEY || "",
    layers: {
      content: raw.layers?.content || "block",
      channel: raw.layers?.channel || "warn",
      preLlm: raw.layers?.preLlm || "off",
      toolArgs: raw.layers?.toolArgs || "warn",
      subagents: raw.layers?.subagents || "warn",
      output: raw.layers?.output || "warn",
    },
    pii: raw.pii || "mask",
    sensitivity: raw.sensitivity || "balanced",
    autoUpdate: raw.autoUpdate !== false,
    verbose: raw.verbose || false,
    whitelist: raw.whitelist || [".openclaw/workspace/", ".openclaw/agents/"],
  };

  // ── Auto-update ai-warden (disabled during hot-reload) ──────────────
  // NOTE: npm install modifies node_modules which triggers OpenClaw's
  // file watcher → plugin reload → register() → npm install → infinite loop.
  // Auto-update should only run via a scheduled command, not in register().
  // TODO: Move to /warden update command or startup hook

  // ── Initialize scanner ──────────────────────────────────────────────
  const scanner = new Scanner(config.apiKey);
  const state = new State(config, api.stateDir);

  // ── Register layers ─────────────────────────────────────────────────
  registerLayers(api, scanner, state, config.verbose);

  // ── Register /warden command ────────────────────────────────────────
  registerCommands(api, state);

  // ── Ready ───────────────────────────────────────────────────────────
  const enabledLayers = Object.entries(config.layers)
    .filter(([_, v]) => v !== "off")
    .map(([k]) => k);

  console.log(
    `${TAG} 🛡️ v${VERSION} ready (mode: ${scanner.mode}, layers: ${enabledLayers.length}/6: ${enabledLayers.join(", ")})`
  );
}

export default {
  id: "ai-warden",
  name: "AI-Warden Security",
  description: "Multi-layer prompt injection protection for OpenClaw agents",
  version: VERSION,
  register,
};
