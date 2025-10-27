#!/bin/bash

echo "================================================"
echo "🔐 Quick Secrets Setup (Minimal to Get Started)"
echo "================================================"
echo ""
echo "✅ JWT_SECRET is already set!"
echo ""
echo "If you have these in Replit, enter them now."
echo "Press Enter to skip any you don't have."
echo ""

# Just get the essentials
echo "📱 TWILIO (for SMS - optional):"
read -p "TWILIO_ACCOUNT_SID (starts with AC): " twilio_sid
if [ ! -z "$twilio_sid" ]; then
    sed -i '' "s|TWILIO_ACCOUNT_SID=.*|TWILIO_ACCOUNT_SID=$twilio_sid|" .env
    echo "✅ Updated TWILIO_ACCOUNT_SID"
fi

read -p "TWILIO_AUTH_TOKEN: " twilio_auth
if [ ! -z "$twilio_auth" ]; then
    sed -i '' "s|TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=$twilio_auth|" .env
    echo "✅ Updated TWILIO_AUTH_TOKEN"
fi

read -p "TWILIO_PHONE_NUMBER (+1234567890): " twilio_phone
if [ ! -z "$twilio_phone" ]; then
    sed -i '' "s|TWILIO_PHONE_NUMBER=.*|TWILIO_PHONE_NUMBER=$twilio_phone|" .env
    echo "✅ Updated TWILIO_PHONE_NUMBER"
fi

echo ""
echo "🤖 OPENAI (for AI features - optional):"
read -p "OPENAI_API_KEY (starts with sk-): " openai_key
if [ ! -z "$openai_key" ]; then
    sed -i '' "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$openai_key|" .env
    echo "✅ Updated OPENAI_API_KEY"
fi

echo ""
echo "================================================"
echo "✅ Done! Your app is ready to use!"
echo "================================================"
echo ""
echo "🌐 Open in browser: http://localhost:5174"
echo ""
echo "The app works without all secrets!"
echo "You can add more later by editing the .env file."
echo ""
