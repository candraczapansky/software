#!/bin/bash

# Optimization script for Render deployment
# This script can be run before deployment to ensure optimal build settings

echo "🚀 Starting build optimization for Render deployment..."

# 1. Clean unnecessary files
echo "📦 Cleaning unnecessary files..."
rm -rf node_modules/.cache
rm -rf .parcel-cache
rm -rf dist
rm -rf .vite
rm -rf coverage
rm -rf *.log

# 2. Set production environment
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=2048"

# 3. Install dependencies with optimizations
echo "📦 Installing dependencies with optimizations..."
npm ci --prefer-offline --no-audit --no-fund --production=false

# 4. Build the application
echo "🔨 Building application..."
npm run build:prod

# 5. Prune dev dependencies (optional - only if not needed for runtime)
# echo "🧹 Pruning dev dependencies..."
# npm prune --production

echo "✅ Build optimization complete!"
echo "📊 Build size report:"
du -sh dist/public

# Optional: Create build info file
echo "{
  \"buildTime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"nodeVersion\": \"$(node -v)\",
  \"npmVersion\": \"$(npm -v)\"
}" > dist/build-info.json

echo "🎉 Ready for deployment to Render!"
