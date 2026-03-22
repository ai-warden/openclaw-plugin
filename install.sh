#!/usr/bin/env bash
# AI-Warden Plugin Installer for OpenClaw
#
# One-liner:
#   curl -fsSL https://ai-warden.io/install.sh | bash
#   curl -fsSL https://ai-warden.io/install.sh | bash -s -- sk_live_YOUR_KEY
#
# Or download and run:
#   bash install.sh                          # offline mode
#   bash install.sh sk_live_YOUR_KEY         # with API key
#   bash install.sh --api-key=sk_live_xxx    # alternative syntax
#
set -euo pipefail

PLUGIN_ID="ai-warden"
PLUGIN_DIR="${HOME}/.openclaw/extensions/${PLUGIN_ID}"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ai-warden]${NC} $*"; }
warn() { echo -e "${YELLOW}[ai-warden]${NC} $*"; }
err()  { echo -e "${RED}[ai-warden]${NC} $*" >&2; }

# Parse args
API_KEY=""
for arg in "$@"; do
  case "$arg" in
    --api-key=*) API_KEY="${arg#*=}" ;;
    sk_*) API_KEY="$arg" ;;
  esac
done

# Prerequisites
command -v node >/dev/null 2>&1 || { err "Node.js not found."; exit 1; }
command -v npm >/dev/null 2>&1  || { err "npm not found."; exit 1; }
[ ! -f "$CONFIG_FILE" ] && { err "OpenClaw not found. Run: npm i -g openclaw"; exit 1; }

echo ""
echo -e "${BLUE}🛡️  AI-Warden Plugin Installer${NC}"
echo ""

# Install the plugin (one npm command does everything)
log "Installing..."
mkdir -p "${PLUGIN_DIR}"
cd "${PLUGIN_DIR}"
[ ! -f package.json ] && echo '{"private":true}' > package.json
npm install openclaw-ai-warden@latest --quiet --no-fund --no-audit 2>/dev/null

# Copy plugin files from npm package to extension root
cp -f node_modules/openclaw-ai-warden/index.ts .
cp -f node_modules/openclaw-ai-warden/openclaw.plugin.json .
cp -rf node_modules/openclaw-ai-warden/src .

# ai-warden (the detection engine) is a transitive dep
VER=$(node -e "console.log(require('ai-warden/package.json').version)")
PVER=$(node -e "console.log(require('openclaw-ai-warden/package.json').version)")

# Update OpenClaw config
log "Configuring..."
python3 -c "
import json
with open('${CONFIG_FILE}') as f: cfg = json.load(f)
p = cfg.setdefault('plugins', {})
p['enabled'] = True
p.setdefault('allow', [])
if '${PLUGIN_ID}' not in p['allow']: p['allow'].append('${PLUGIN_ID}')
e = p.setdefault('entries', {})
if '${PLUGIN_ID}' not in e:
    e['${PLUGIN_ID}'] = {'enabled': True, 'config': {
        'layers': {'content':'block','channel':'warn','preLlm':'off','toolArgs':'warn','subagents':'warn','output':'warn'},
        'pii': 'mask', 'sensitivity': 'balanced'
    }}
if '${API_KEY}':
    e['${PLUGIN_ID}'].setdefault('config', {})['apiKey'] = '${API_KEY}'
with open('${CONFIG_FILE}', 'w') as f: json.dump(cfg, f, indent=2)
" 2>/dev/null || warn "python3 missing — edit ${CONFIG_FILE} manually"

# Done
echo ""
echo -e "${GREEN}✅ AI-Warden installed!${NC}"
echo -e "   Plugin: v${PVER} | Engine: v${VER}"
echo ""
if [ -z "$API_KEY" ]; then
  echo -e "   ${YELLOW}📴 Offline mode (~60% accuracy)${NC}"
  echo "   Get a free API key → https://ai-warden.io/signup"
else
  echo -e "   ${GREEN}🔑 API mode (Smart Cascade)${NC}"
fi
echo ""
echo "   Activate: openclaw gateway restart"
echo ""
