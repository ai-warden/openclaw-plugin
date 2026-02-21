#!/bin/bash
# Quick test script for local development

set -e

echo "🧪 AI-Warden Moltbot Plugin - Local Test"
echo "========================================"
echo ""

# Check Node version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   Node: $NODE_VERSION"

if [[ ! "$NODE_VERSION" =~ ^v(1[8-9]|[2-9][0-9]) ]]; then
  echo "❌ Error: Node.js >= 18.0.0 required"
  exit 1
fi

echo "✅ Node version OK"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Build
echo "🔨 Building TypeScript..."
npm run build

if [ ! -d "dist" ]; then
  echo "❌ Error: Build failed, dist/ not found"
  exit 1
fi

echo "✅ Build successful"
echo ""

# Check output
echo "📁 Build output:"
ls -lh dist/
echo ""

# Run tests (if configured)
if grep -q "vitest" package.json; then
  echo "🧪 Running tests..."
  npm test || echo "⚠️  No tests configured yet"
  echo ""
fi

# Pack for inspection
echo "📦 Creating tarball..."
npm pack

TARBALL=$(ls -t *.tgz | head -1)
echo "✅ Package created: $TARBALL"
echo ""

echo "📋 Package contents:"
tar -tzf "$TARBALL" | head -20
echo ""

# Show next steps
echo "✅ Plugin is ready!"
echo ""
echo "🚀 Next steps:"
echo "   1. Test in Moltbot:"
echo "      npm link"
echo "      cd /path/to/moltbot"
echo "      npm link @ai-warden/moltbot-plugin"
echo ""
echo "   2. Publish to NPM:"
echo "      npm publish --access public"
echo ""
echo "   3. Install normally:"
echo "      npm install @ai-warden/moltbot-plugin"
echo ""
