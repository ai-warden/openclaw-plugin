import type { State } from "./state.js";
import type { LayerAction, LayerName } from "./types.js";

const VALID_LAYERS: LayerName[] = ["content", "channel", "preLlm", "toolArgs", "subagents", "output"];
const VALID_ACTIONS: LayerAction[] = ["block", "warn", "log", "off"];
const VALID_PII = ["ignore", "mask", "remove"] as const;

export function registerCommands(api: any, state: State) {
  api.registerCommand?.({
    name: "warden",
    description: "AI-Warden security layer management",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (args: any, ctx: any) => {
      // Handle multiple arg formats
      let argsStr: string;
      if (typeof args === 'string') {
        argsStr = args;
      } else if (Array.isArray(args)) {
        argsStr = args.join(' ');
      } else if (args?.args) {
        argsStr = typeof args.args === 'string' ? args.args : args.args.join(' ');
      } else if (args?.commandBody) {
        argsStr = args.commandBody.replace(/^\/warden\s*/, '');
      } else {
        argsStr = '';
      }
      
      const parts = argsStr.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() || "status";

      switch (sub) {
        case "status":
          return { text: state.getStatus() };

        case "stats":
          return { text: state.getStats() };

        case "layer": {
          const layerName = parts[1]?.toLowerCase() as LayerName;
          const action = parts[2]?.toLowerCase() as LayerAction;

          if (!layerName || !VALID_LAYERS.includes(layerName)) {
            return {
              text: `Usage: /warden layer <name> <action>\nLayers: ${VALID_LAYERS.join(", ")}\nActions: ${VALID_ACTIONS.join(", ")}`,
            };
          }
          if (!action || !VALID_ACTIONS.includes(action)) {
            return {
              text: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}`,
            };
          }

          state.setAction(layerName, action);
          return {
            text: `🛡️ Layer **${layerName}** set to **${action}**`,
          };
        }

        case "pii": {
          const mode = parts[1]?.toLowerCase();
          if (!mode || !VALID_PII.includes(mode as any)) {
            return {
              text: `Current PII mode: **${state.getPIIMode()}**\nUsage: /warden pii <${VALID_PII.join("|")}>`,
            };
          }
          state.setPIIMode(mode as any);
          return { text: `🔒 PII mode set to **${mode}**` };
        }

        case "reset":
          state.resetStats();
          return { text: "📊 Statistics reset." };

        case "whitelist": {
          const wlAction = parts[1]?.toLowerCase();
          const wlPath = parts.slice(2).join(" ");

          if (!wlAction || wlAction === "list") {
            const wl = state.getWhitelist();
            if (wl.length === 0) {
              return { text: "📋 **Whitelist:** (empty)\nUse `/warden whitelist add <path>` to add paths." };
            }
            return {
              text: `📋 **Whitelist** (${wl.length} paths):\n${wl.map(p => `  • \`${p}\``).join("\n")}\n\nUse \`/warden whitelist add <path>\` or \`remove <path>\` to manage.`,
            };
          }

          if (wlAction === "add") {
            if (!wlPath) return { text: "Usage: `/warden whitelist add <path-prefix>`" };
            const added = state.addWhitelistPath(wlPath);
            return {
              text: added
                ? `✅ Added to whitelist: \`${wlPath}\``
                : `⚠️ Path already in whitelist: \`${wlPath}\``,
            };
          }

          if (wlAction === "remove" || wlAction === "rm") {
            if (!wlPath) return { text: "Usage: `/warden whitelist remove <path-prefix>`" };
            const removed = state.removeWhitelistPath(wlPath);
            return {
              text: removed
                ? `🗑️ Removed from whitelist: \`${wlPath}\``
                : `⚠️ Path not found in whitelist: \`${wlPath}\``,
            };
          }

          return { text: "Usage: `/warden whitelist [list|add|remove] [path]`" };
        }

        case "help":
          return {
            text:
              "🛡️ **AI-Warden Commands**\n\n" +
              "`/warden` — Status overview\n" +
              "`/warden layer <name> <block|warn|log|off>` — Set layer policy\n" +
              "`/warden stats` — Scan statistics\n" +
              "`/warden pii <ignore|mask|remove>` — PII mode\n" +
              "`/warden whitelist [list|add|remove] [path]` — Manage path whitelist\n" +
              "`/warden reset` — Reset stats\n\n" +
              `Layers: ${VALID_LAYERS.join(", ")}`,
          };

        default:
          return { text: `Unknown command. Try /warden help` };
      }
    },
  });
}
