#!/bin/bash
# Push moltbot-plugin to GitHub
# Usage: ./scripts/push-to-github.sh [repo-url]

set -e

REPO_URL=${1:-""}

if [ -z "$REPO_URL" ]; then
  echo "❌ Error: Repository URL required"
  echo ""
  echo "Usage:"
  echo "  ./scripts/push-to-github.sh git@github.com:ai-warden/moltbot-plugin.git"
  echo ""
  echo "Or set remote first:"
  echo "  git remote add origin git@github.com:ai-warden/moltbot-plugin.git"
  echo "  ./scripts/push-to-github.sh"
  exit 1
fi

echo "🚀 Pushing AI-Warden Moltbot Plugin to GitHub"
echo "=============================================="
echo ""

# Check if remote exists
if git remote | grep -q "origin"; then
  echo "✅ Remote 'origin' already exists"
  CURRENT_URL=$(git remote get-url origin)
  echo "   Current URL: $CURRENT_URL"
  
  if [ "$CURRENT_URL" != "$REPO_URL" ]; then
    echo "⚠️  URL mismatch! Updating..."
    git remote set-url origin "$REPO_URL"
    echo "✅ Updated to: $REPO_URL"
  fi
else
  echo "➕ Adding remote 'origin'..."
  git remote add origin "$REPO_URL"
  echo "✅ Remote added: $REPO_URL"
fi

echo ""
echo "📤 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Successfully pushed to GitHub!"
echo ""
echo "🔗 View repo:"
echo "   ${REPO_URL/.git/}"
echo ""
echo "📦 Next steps:"
echo "   1. Create release on GitHub (v1.0.0)"
echo "   2. Publish to NPM: npm publish --access public"
echo "   3. Add topics: moltbot, security, ai-warden"
echo ""
