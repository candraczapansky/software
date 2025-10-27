# Helcim Smart Terminal Fixes Applied - October 2025

## Overview
This document describes the fixes applied to restore Helcim smart terminal functionality based on the comprehensive issue summary provided.

## Environment Configuration

### Required Environment Variables
Ensure these are set in your production environment (Render):

```bash
HELCIM_API_TOKEN=adClJoT.d*$JlSAZi6u-sMSuUPX%aojxchf6_S-wen.x._u5isgwIGjP0oDL*r@k
HELCIM_API_URL=https://api.helcim.com/v2
HELCIM_WEBHOOK_SECRET=o4CdmeQzyxEKU2xmgN7STxo0sATuqMBi
```

### Webhook Configuration
The webhook URL should be set to your production URL:
- Production: `https://your-domain.com/api/terminal/webhook`
- Local Testing: Use ngrok and update `TERMINAL_WEBHOOK_URL`

## Fixes Applied

### 1. ✅ Authentication & Token Handling (terminal-config-service.ts)
**Problem:** Database-stored tokens couldn't be decrypted due to encryption key mismatch
**Solution:** Added graceful fallback to environment variable when decryption fails

```typescript
// Added try-catch around decryption with fallback
try {
  decryptedToken = await decrypt(row.api_token);
} catch (error) {
  console.warn('⚠️ Failed to decrypt stored API token, falling back to environment variable');
  decryptedToken = process.env.HELCIM_API_TOKEN || row.api_token;
}
```

### 2. ✅ Fixed Polling API Endpoint (helcim-terminal-service.ts)
**Problem:** Was using wrong endpoint `/payment/transactions` (404 error)
**Solution:** Changed to correct v2 API endpoint `/card-transactions`

```typescript
// Fixed endpoint from /payment/transactions to /card-transactions
const searchResponse = await this.makeRequest(
  'GET',
  `/card-transactions?invoiceNumber=${paymentId}&limit=1`,
  undefined,
  config.apiToken || process.env.HELCIM_API_TOKEN
);
```

### 3. ✅ Receipt & Amount Display
The existing code already handles:
- Storing base amount in session data (line 94-96 in helcim-terminal-service.ts)
- Retrieving amounts from session for display
- Calculating tips as: `totalAmount - baseAmount`

### 4. ✅ Webhook Processing
The webhook handling is already properly configured to:
- Cache payment status by transaction ID and invoice number
- Handle minimal webhooks from smart terminal (`{"id":"TXN_ID", "type":"cardTransaction"}`)
- Mark `cardTransaction` type as successful
- Calculate tips from session data

### 5. ✅ Sales History & Tips
The terminal routes already correctly:
- Create sales history records with proper tip amounts
- Store `serviceTotalAmount` as base amount (no tip)
- Store `tipAmount` separately
- Include tips in staff earnings calculations

## Terminal Setup Process

### 1. Configure Terminal in Database
Run the setup script:
```bash
node setup-terminal.mjs
```

You'll need:
- Terminal ID (e.g., GloUpCounterT1)
- Device Code (shown on terminal screen)
- Location ID (e.g., 4)
- Helcim API Token

### 2. Verify Setup
Run the verification script:
```bash
node verify-terminal-setup.mjs
```

This will check:
- Environment variables
- Database configuration
- API connectivity
- Webhook setup

### 3. Test Payment Flow
1. Initiate payment from app (POS or appointment)
2. Terminal receives payment request
3. Customer completes payment on terminal
4. App receives confirmation (via webhook or polling)
5. Receipt shows correct amounts including tips
6. Payment appears in reports with correct tip amounts

## Webhook Setup (Optional but Recommended)

### For Local Testing
```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Start ngrok tunnel
ngrok http 3002

# Update environment
export TERMINAL_WEBHOOK_URL=https://your-subdomain.ngrok-free.dev/api/terminal/webhook
```

### For Production
1. Log into Helcim account
2. Go to Settings > API Access
3. Set webhook URL to: `https://your-domain.com/api/terminal/webhook`
4. Select events: Card Transactions

## Troubleshooting

### Terminal Not Receiving Payments
1. Check terminal is configured: `node verify-terminal-setup.mjs`
2. Verify API token is correct
3. Ensure device code matches terminal display
4. Check network connectivity

### Payments Not Confirming
1. Check webhook URL is configured
2. Verify polling is working (2-4 second delay expected)
3. Check browser console for errors
4. Review server logs

### Tips Not Showing
1. Ensure service price is in database
2. Verify total amount includes tip from terminal
3. Check sales history record has separate `tipAmount` field
4. Review staff earnings calculations

### Receipt Shows $0
1. Check session data includes amounts
2. Verify webhook includes amount data
3. Review payment record in database

## Key Files Modified
1. `server/services/terminal-config-service.ts` - Added decryption fallback
2. `server/services/helcim-terminal-service.ts` - Fixed polling endpoint

## Scripts Created
1. `setup-terminal.mjs` - Configure terminal in database
2. `verify-terminal-setup.mjs` - Verify terminal configuration

## Important Notes
- System has automatic polling fallback (checks every 2 seconds)
- Webhook provides instant confirmation when configured  
- Service price always remains unchanged in reports
- Tips are calculated as: Total from Helcim - Service Price
- All payment methods create sales history records

## Testing Checklist
- [ ] Environment variables set correctly
- [ ] Terminal configured in database
- [ ] API connectivity verified
- [ ] Test payment completes successfully
- [ ] Receipt shows correct amounts
- [ ] Tips appear in reports
- [ ] Appointments turn green when paid
- [ ] Staff earnings include tips

## Support
If issues persist after applying these fixes:
1. Run `node verify-terminal-setup.mjs` to diagnose
2. Check server logs for specific error messages
3. Verify Helcim API token is valid and for production (not sandbox)
4. Ensure webhook URL is accessible from internet
