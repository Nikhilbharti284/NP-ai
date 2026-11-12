#!/usr/bin/env bash
set -e

REPO_NAME="agi-astra-ultra"

# 1. Git इनिशियलाइज़ करें और सारी फ़ाइलें जोड़ें
git init
git branch -M main
git add index.html sw.js manifest.json .github/workflows/deploy.yml
git commit -m "Launch AGI Astra Ultra v5.0 Static Cloud Supercomputer"

# 2. GitHub CLI (gh) से पब्लिक रिपॉजिटरी बनाएं और कोड पुश करें
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push

# 3. GitHub Pages को GitHub Actions मोड पर इनेबल करें
OWNER=$(gh api user -q .login)
gh api -X POST "repos/$OWNER/$REPO_NAME/pages" -f build_type="workflow" || true

echo "✅ Deployed! Your live URL will be ready in ~45 seconds at:"
echo "🌐 https://$OWNER.github.io/$REPO_NAME/"
