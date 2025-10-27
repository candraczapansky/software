#!/bin/bash

echo "Testing booking widget notification on port 3002..."

curl -X POST http://localhost:3002/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": 22624,
    "serviceId": 104,
    "staffId": 6,
    "locationId": 4,
    "startTime": "2025-09-30T14:00:00.000Z",
    "endTime": "2025-09-30T15:00:00.000Z",
    "status": "confirmed",
    "paymentStatus": "unpaid",
    "bookingMethod": "widget",
    "notes": "TEST - Should send notifications"
  }'

echo ""
echo "Check your server console for these logs:"
echo "1. 🔍 [APPOINTMENT API] Received appointment request"
echo "2. ✅ CONFIRMATION CODE IS REACHED ✅"
echo "3. 📱 [NOTIFICATION CHECK] About to send notifications"
echo "4. isFromWidget: true"



