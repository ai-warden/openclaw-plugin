import type { State } from "./state.js";
import type { LayerAction, LayerName } from "./types.js";

const VALID_LAYERS: LayerName[] = ["content", "channel", "preLlm", "toolArgs", "subagents", "output"];
const VALID_ACTIONS: LayerAction[] = ["block", "warn", "log", "off"];
const VALID_PII = ["ignore", "mask", "remove"] as const;

export function registerCommands(api: any, state: State) {
  api.registerCommand({
    name: "warden",
    description: "AI-Warden security layer management",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (args: string, ctx: any) => {
      const parts = (args || "").trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() || "status";

      switch (sub) {
        case "status":
          return { reply: state.getStatus() };

        case "stats":
          return { reply: state.getStats() };

        case "layer": {
          const layerName = parts[1]?.toLowerCase() as LayerName;
          const action = parts[2]?.toLowerCase() as LayerAction;

          if (!layerName || !VALID_LAYERS.includes(layerName)) {
            return {
              reply: `Usage: /warden layer <name> <action>\nLayers: ${VALID_LAYERS.join(", ")}\nActions: ${VALID_ACTIONS.join(", ")}`,
            };
          }
          if (!action || !VALID_ACTIONS.includes(action)) {
            return {
              reply: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}`,
            };
          }

          state.setAction(layerName, action);
          return {
            reply: `🛡️ Layer **${layerName}** set to **${action}**`,
          };
        }

        case "pii": {
          const mode = parts[1]?.toLowerCase();
          if (!mode || !VALID_PII.includes(mode as any)) {
            return {
              reply: `Current PII mode: **${state.getPIIMode()}**\nUsage: /warden pii <${VALID_PII.join("|")}>`,
            };
          }
          state.setPIIMode(mode as any);
          return { reply: `🔒 PII mode set to **${mode}**` };
        }

        case "reset":
          return { reply: "📊 Statistics reset." };

        case "help":
          return {
            reply:
              "🛡️ **AI-Warden Commands**\n\n" +
              "`/warden` — Status overview\n" +
              "`/warden layer <name> <block|warn|log|off>` — Set layer policy\n" +
              "`/warden stats` — Scan statistics\n" +
              "`/warden pii <ignore|mask|remove>` — PII mode\n" +
              "`/warden reset` — Reset stats\n\n" +
              `Layers: ${VALID_LAYERS.join(", ")}`,
          };

        default:
          return { reply: `Unknown command. Try /warden help` };
      }
    },
  });
}
