#!/bin/bash

# Test the complete terminal payment flow

echo "=== Testing Helcim Terminal Payment Flow ==="
echo ""

BASE_URL=${BASE_URL:-"http://localhost:3003"}
LOCATION_ID="1"
AMOUNT="50.00"

# Step 1: Start a payment
echo "1. Starting payment..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/payment/start" \
  -H "Content-Type: application/json" \
  -d "{\"locationId\":\"$LOCATION_ID\",\"amount\":$AMOUNT}")

echo "   Response: $RESPONSE"

# Extract the payment ID (invoice number) from response
PAYMENT_ID=$(echo $RESPONSE | grep -o '"paymentId":"[^"]*' | cut -d'"' -f4)
TX_ID=$(echo $RESPONSE | grep -o '"transactionId":"[^"]*' | cut -d'"' -f4)

echo "   Payment ID: $PAYMENT_ID"
echo "   Transaction ID: $TX_ID"
echo ""

# Step 2: Simulate webhook from Helcim (minimal format)
echo "2. Simulating Helcim webhook..."
WEBHOOK_BODY="{\"id\":\"TEST-$(date +%s)\",\"type\":\"cardTransaction\"}"
echo "   Sending: $WEBHOOK_BODY"

curl -s -X POST "$BASE_URL/api/terminal/webhook" \
  -H "Content-Type: application/json" \
  -d "$WEBHOOK_BODY" > /dev/null

echo "   Webhook sent"
echo ""

# Step 3: Check payment status
echo "3. Checking payment status..."
sleep 1

STATUS_RESPONSE=$(curl -s "$BASE_URL/api/terminal/payment/$LOCATION_ID/$PAYMENT_ID")
echo "   Status response: $STATUS_RESPONSE"

STATUS=$(echo $STATUS_RESPONSE | grep -o '"status":"[^"]*' | cut -d'"' -f4)
echo "   Payment status: $STATUS"
echo ""

if [ "$STATUS" = "completed" ]; then
  echo "✅ SUCCESS: Payment marked as completed!"
else
  echo "❌ FAILED: Payment is still $STATUS"
  echo ""
  echo "4. Checking debug snapshot..."
  curl -s "$BASE_URL/api/terminal/debug/snapshot" | python3 -m json.tool
fi


