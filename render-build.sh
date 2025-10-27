#!/bin/bash
# Render build script for production deployment

echo "Starting Render build process..."

# Install dependencies
echo "Installing dependencies..."
npm ci --production=false

# Build the application
echo "Building application..."
npm run build

# Run database migrations if needed
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  node run-migrations.js
fi

echo "Build complete!"
