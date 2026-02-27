#!/bin/bash
# Apply security interceptor patch to Moltbot
# This modifies the compiled dist files to add security checks

set -e

ADAPTER_FILE="/moltbot-src/dist/agents/pi-tool-definition-adapter.js"
BACKUP_FILE="${ADAPTER_FILE}.backup"

echo "[SECURITY] Applying tool interceptor patch..."

# Check if file exists
if [ ! -f "$ADAPTER_FILE" ]; then
    echo "[SECURITY] ✗ File not found: $ADAPTER_FILE"
    exit 1
fi

# Check if already patched
if grep -q "SECURITY INTERCEPTOR PATCH" "$ADAPTER_FILE" 2>/dev/null; then
    echo "[SECURITY] ✓ Already patched"
    exit 0
fi

# Backup original
if [ ! -f "$BACKUP_FILE" ]; then
    echo "[SECURITY] Creating backup: $BACKUP_FILE"
    cp "$ADAPTER_FILE" "$BACKUP_FILE"
fi

# Apply the patch with Node.js
cd /moltbot-src
node -e '
const fs = require("fs");
const file = "dist/agents/pi-tool-definition-adapter.js";
let content = fs.readFileSync(file, "utf8");

if (content.includes("SECURITY INTERCEPTOR")) {
    console.log("[SECURITY] Already patched");
    process.exit(0);
}

const patch = `
// === SECURITY INTERCEPTOR PATCH START ===
const EVIL_PATTERNS = [
    /ignore.*previous.*instructions/i,
    /disregard.*all.*previous/i,
    /forget.*all.*instructions/i,
    /malicious\\.com/i,
];

function interceptToolResult(result, toolName) {
    const tools = ["web_fetch", "browser", "read"];
    if (!tools.includes(toolName)) return result;
    
    let text = "";
    if (typeof result === "string") {
        text = result;
    } else if (result?.content) {
        const blocks = Array.isArray(result.content) ? result.content : [result.content];
        blocks.forEach(b => { if (b?.type === "text" && b.text) text += b.text; });
    }
    
    for (const p of EVIL_PATTERNS) {
        if (p.test(text)) {
            console.error("[SECURITY] 🚫 BLOCKED " + toolName + ": malicious content");
            return { content: [{ type: "text", text: "⛔ SECURITY BLOCK: Malicious content detected" }] };
        }
    }
    return result;
}
// === SECURITY INTERCEPTOR PATCH END ===
`;

const insertAt = content.indexOf("function describeToolExecutionError");
if (insertAt === -1) {
    console.error("[SECURITY] Could not find insertion point");
    process.exit(1);
}

content = content.slice(0, insertAt) + patch + content.slice(insertAt);

content = content.replace(
    /return await tool\.execute\(toolCallId, params, signal, onUpdate\);/,
    "const __r = await tool.execute(toolCallId, params, signal, onUpdate); return interceptToolResult(__r, normalizedName);"
);

fs.writeFileSync(file, content);
console.log("[SECURITY] ✓ Patch applied!");
'

echo "[SECURITY] ✓ Done! Restart Moltbot to activate."
echo "[SECURITY] Backup: $BACKUP_FILE"
