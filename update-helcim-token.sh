#!/bin/bash

echo "================================"
echo "Helcim API Token Update Script"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Created backup of .env"

echo ""
echo "Please enter your Helcim API token from https://app.helcim.com/"
echo "It should be 40+ characters with periods (e.g., adClJoT.dK7VjH9k...)"
echo ""
read -p "Enter your Helcim API Token: " HELCIM_TOKEN

# Validate token format (should contain periods and be long enough)
if [[ ! "$HELCIM_TOKEN" =~ \. ]] || [ ${#HELCIM_TOKEN} -lt 30 ]; then
    echo "⚠️  Warning: Token doesn't match expected Helcim format"
    echo "   Helcim tokens are usually 40+ chars with periods"
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
read -p "Enter your Helcim Account ID (e.g., 2500189508): " ACCOUNT_ID

# Update .env file
sed -i.tmp "s/^HELCIM_API_TOKEN=.*/HELCIM_API_TOKEN=$HELCIM_TOKEN/" .env
sed -i.tmp "s/^HELCIM_ACCOUNT_ID=.*/HELCIM_ACCOUNT_ID=$ACCOUNT_ID/" .env
sed -i.tmp "s/^VITE_HELCIM_ACCOUNT_ID=.*/VITE_HELCIM_ACCOUNT_ID=$ACCOUNT_ID/" .env

# Clean up temp files
rm -f .env.tmp

echo ""
echo "✅ Updated .env file with new Helcim credentials"
echo ""
echo "Testing connection..."
echo ""

# Kill existing server
pkill -f tsx 2>/dev/null

# Start server in background
npm run dev > /tmp/server.log 2>&1 &
SERVER_PID=$!

echo "Starting server... (waiting 10 seconds)"
sleep 10

# Test the API
echo ""
echo "Testing Helcim API..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3002/api/payments/helcim/initialize \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "description": "Test"}' 2>/dev/null)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed -n '1,/HTTP_STATUS/p' | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS! Helcim API is working correctly"
    echo ""
    echo "Response: $BODY" | head -c 100
    echo "..."
else
    echo "❌ FAILED! HTTP Status: $HTTP_STATUS"
    echo "Response: $BODY"
    echo ""
    echo "Please verify your API token is correct"
fi

echo ""
echo "Server is running on port 3002"
echo "Press Ctrl+C to stop the server"
echo ""

# Keep server running
wait $SERVER_PID
