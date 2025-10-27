# Helcim Smart Terminal Webhook - Complete Solution

## The Problem
The Helcim webhook URL configured in their dashboard is static:
```
https://your-domain.com/api/terminal/webhook
```

It doesn't include the invoice number, so when Helcim sends:
```json
{"id": "TRANSACTION_ID", "type": "cardTransaction"}
```

The app can't match it to the original payment being polled.

## The Solution Implemented

### 1. Enhanced Session Storage
When a payment starts, we now store the session with THREE keys:
- Invoice number (what frontend polls with)
- Payment ID 
- **Helcim transaction ID** (if available)

```javascript
// Store session by all possible identifiers
sessionStore.set(invoiceNumber, sessionData);        // For polling
sessionStore.set(`payment_${paymentId}`, sessionData); // For DB lookup
sessionStore.set(helcimTxId, sessionData);            // For webhook matching
```

### 2. Improved Webhook Matching
When webhook arrives with only transaction ID:
1. First check if we have a session stored by that transaction ID
2. If found, cache the webhook result by the invoice number from that session
3. Fallback to most recent session matching

```javascript
// Try to find session by transaction ID
const sessionByTxId = sessionStore.get(txId);
if (sessionByTxId && sessionByTxId.invoiceNumber) {
  webhookStore.set(sessionByTxId.invoiceNumber, cacheData);
  console.log(`✅ Found session by txId! Cached by invoice: ${sessionByTxId.invoiceNumber}`);
}
```

### 3. Webhook Type Recognition
- `type: "cardTransaction"` = Payment succeeded ✅
- `type: "terminalDecline"` = Payment failed ❌
- `type: "terminalCancel"` = User cancelled ❌

## What Happens Now

1. **Payment Starts:**
   - Invoice: `INV000001`
   - Helcim returns txId: `TXN123`
   - Sessions stored: `INV000001`, `TXN123`, `payment_1`

2. **Webhook Received:**
   - Helcim sends: `{"id": "TXN123", "type": "cardTransaction"}`
   - Find session by `TXN123`
   - Get invoice number: `INV000001`
   - Cache as completed under both `TXN123` and `INV000001`

3. **Polling Succeeds:**
   - Frontend polls with `INV000001`
   - Cache lookup finds completed status
   - Payment completes! ✅

## Configuration Required

### In Your Helcim Dashboard
Webhook URL should be:
```
https://your-domain.com/api/terminal/webhook
```

### Environment Variables
```bash
# Optional but helpful
PUBLIC_BASE_URL=https://your-domain.com
```

## Testing

Run this to test the flow:
```bash
chmod +x test-terminal-flow.sh
./test-terminal-flow.sh
```

## Debug Logs to Check

When running a real payment, look for these in server logs:

### Payment Start:
```
💾 Stored session by invoice: INV000001
💾 Stored session by Helcim txId: TXN123
```

### Webhook Received:
```
🚨🚨🚨 TERMINAL WEBHOOK RECEIVED 🚨🚨🚨
Body: {"id": "TXN123", "type": "cardTransaction"}
✅ Found session by txId! Cached by invoice: INV000001
```

### Polling:
```
🔍 Checking webhook cache for paymentId: INV000001
📦 Cache result: { status: 'completed', transactionId: 'TXN123' }
```

## If It Still Doesn't Work

1. **Check if Helcim returns a transaction ID immediately**
   - Look for "Updated payment X with Helcim TX" in logs
   - If no txId, the session can't be matched

2. **Check webhook is being received**
   - Look for "TERMINAL WEBHOOK RECEIVED"
   - If not, check Helcim dashboard webhook status

3. **Check session timing**
   - Sessions expire after 5 minutes
   - If webhook comes later, it won't match

4. **Manual fix available**
   ```bash
   POST /api/terminal/fix-payment/{TRANSACTION_ID}
   {
     "status": "completed",
     "tipAmount": 15.00,
     "totalAmount": 115.00
   }
   ```

## Summary

The fix ensures that even without an invoice number in the webhook, we can match it to the original payment by:
1. Storing sessions by transaction ID when available
2. Looking up the session when webhook arrives
3. Caching the result by the invoice number for polling

This should resolve the endless polling issue!


