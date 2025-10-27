#!/bin/bash

echo "================================================"
echo "📧 Add SendGrid and Helcim API Keys"
echo "================================================"
echo ""
echo "Enter your API keys below (or press Enter to skip)"
echo ""

# SendGrid Configuration
echo "📧 SENDGRID CONFIGURATION:"
read -p "SENDGRID_API_KEY: " sendgrid_key
if [ ! -z "$sendgrid_key" ]; then
    sed -i '' "s|SENDGRID_API_KEY=.*|SENDGRID_API_KEY=$sendgrid_key|" .env
    echo "✅ Updated SENDGRID_API_KEY"
fi

read -p "SENDGRID_FROM_EMAIL (e.g., noreply@yourdomain.com): " sendgrid_email
if [ ! -z "$sendgrid_email" ]; then
    sed -i '' "s|SENDGRID_FROM_EMAIL=.*|SENDGRID_FROM_EMAIL=$sendgrid_email|" .env
    echo "✅ Updated SENDGRID_FROM_EMAIL"
fi

read -p "SENDGRID_FROM_NAME (e.g., Your Business Name): " sendgrid_name
if [ ! -z "$sendgrid_name" ]; then
    sed -i '' "s|SENDGRID_FROM_NAME=.*|SENDGRID_FROM_NAME=$sendgrid_name|" .env
    echo "✅ Updated SENDGRID_FROM_NAME"
fi

echo ""
echo "💳 HELCIM CONFIGURATION:"
read -p "HELCIM_API_TOKEN: " helcim_token
if [ ! -z "$helcim_token" ]; then
    sed -i '' "s|HELCIM_API_TOKEN=.*|HELCIM_API_TOKEN=$helcim_token|" .env
    echo "✅ Updated HELCIM_API_TOKEN"
fi

read -p "HELCIM_WEBHOOK_VERIFIER_TOKEN: " helcim_verifier
if [ ! -z "$helcim_verifier" ]; then
    sed -i '' "s|HELCIM_WEBHOOK_VERIFIER_TOKEN=.*|HELCIM_WEBHOOK_VERIFIER_TOKEN=$helcim_verifier|" .env
    echo "✅ Updated HELCIM_WEBHOOK_VERIFIER_TOKEN"
fi

read -p "VITE_HELCIM_ACCOUNT_ID: " helcim_account
if [ ! -z "$helcim_account" ]; then
    sed -i '' "s|VITE_HELCIM_ACCOUNT_ID=.*|VITE_HELCIM_ACCOUNT_ID=$helcim_account|" .env
    echo "✅ Updated VITE_HELCIM_ACCOUNT_ID"
fi

read -p "VITE_HELCIM_TERMINAL_ID: " helcim_terminal
if [ ! -z "$helcim_terminal" ]; then
    sed -i '' "s|VITE_HELCIM_TERMINAL_ID=.*|VITE_HELCIM_TERMINAL_ID=$helcim_terminal|" .env
    echo "✅ Updated VITE_HELCIM_TERMINAL_ID"
fi

read -p "VITE_HELCIM_JS_TOKEN: " helcim_js
if [ ! -z "$helcim_js" ]; then
    sed -i '' "s|VITE_HELCIM_JS_TOKEN=.*|VITE_HELCIM_JS_TOKEN=$helcim_js|" .env
    echo "✅ Updated VITE_HELCIM_JS_TOKEN"
fi

echo ""
echo "================================================"
echo "✅ Configuration Updated!"
echo "================================================"
echo ""
echo "Restart your servers to apply changes:"
echo "1. Press Ctrl+C to stop current servers"
echo "2. Run: npm run dev"
echo ""
