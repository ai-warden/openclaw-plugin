#!/bin/bash
# AI-Warden Plugin Installer
# Auto-detects Moltbot/Clawdbot and installs to correct location

set -e

echo "🛡️  AI-Warden Security Plugin Installer"
echo ""

# Detect installation type
EXTENSIONS_DIR=""
LOG_DIR=""
INSTALL_TYPE=""

if [ -d "$HOME/.moltbot" ]; then
    EXTENSIONS_DIR="$HOME/.moltbot/extensions"
    LOG_DIR="$HOME/.moltbot/logs"
    INSTALL_TYPE="Moltbot"
elif [ -d "$HOME/.clawdbot" ]; then
    EXTENSIONS_DIR="$HOME/.clawdbot/extensions"
    LOG_DIR="$HOME/.clawdbot/logs"
    INSTALL_TYPE="Clawdbot"
else
    echo "❌ Error: Neither ~/.moltbot nor ~/.clawdbot found!"
    echo ""
    echo "Please install Moltbot first:"
    echo "  https://docs.molt.bot/installation"
    exit 1
fi

echo "✅ Detected: $INSTALL_TYPE"
echo "📁 Extensions: $EXTENSIONS_DIR"
echo ""

# Create extensions directory if it doesn't exist
if [ ! -d "$EXTENSIONS_DIR" ]; then
    echo "📂 Creating extensions directory..."
    mkdir -p "$EXTENSIONS_DIR"
fi

# Navigate to extensions directory
cd "$EXTENSIONS_DIR"

# Check if already installed
if [ -d "ai-warden" ]; then
    echo "⚠️  AI-Warden already installed!"
    read -p "Do you want to update? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Updating AI-Warden..."
        cd ai-warden
        git pull origin main
        npm install
        npm run build
        echo "✅ Updated successfully!"
    else
        echo "❌ Installation cancelled"
        exit 0
    fi
else
    # Fresh installation
    echo "📥 Cloning AI-Warden plugin..."
    git clone https://github.com/ai-warden/openclaw-plugin.git ai-warden
    
    cd ai-warden
    
    echo "📦 Installing dependencies..."
    npm install
    
    echo "🔨 Building plugin..."
    npm run build
    
    echo ""
    echo "✅ AI-Warden installed successfully!"
fi

echo ""
echo "🔄 Next steps:"
echo "1. Restart Moltbot:"
echo "   moltbot gateway restart"
echo ""
echo "2. Verify installation:"
echo "   tail -f $LOG_DIR/moltbot.log | grep AI-Warden"
echo ""
echo "3. Test in chat:"
echo "   /warden"
echo ""
echo "📖 Full documentation:"
echo "   https://github.com/ai-warden/openclaw-plugin"
echo ""
echo "🎉 Done! Your agent is now protected."
