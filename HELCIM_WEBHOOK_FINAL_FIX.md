# Helcim Smart Terminal Webhook - Final Fix Summary

## The Core Problem
When Helcim sends a minimal webhook `{"id": "TRANSACTION_ID", "type": "cardTransaction"}`, the app can't match it to the original payment because:

1. The frontend polls with the invoice number (e.g., `INV000001` or timestamp)
2. The webhook only has the Helcim transaction ID
3. The webhook cache stores by transaction ID, not invoice number
4. There's no way to connect the two without the invoice number in the webhook

## The Solution Path

### Option 1: Configure Helcim Webhook (Recommended)
In Helcim Dashboard, configure the webhook URL to be:
```
https://your-domain.com/api/helcim/webhook?invoiceNumber={{invoiceNumber}}
```
This way Helcim will include the invoice number in the webhook.

### Option 2: Use Session Matching (Current Approach)
The code tries to match the webhook to the most recent payment session, but this can fail if:
- Multiple payments happen close together
- The session key format doesn't match expectations
- The timing window expires

### Option 3: Query Helcim API
After receiving the webhook, query Helcim's API to get the full transaction details including the invoice number. This requires the transaction lookup endpoint to work.

## What's Currently Happening

1. **Payment Starts:**
   - Invoice number created: `INV000001` or timestamp
   - Session stored with this key
   - Payment sent to terminal with webhook URL including `?invoiceNumber=INV000001`

2. **Webhook Received:**
   - Helcim sends: `{"id": "TXN123", "type": "cardTransaction"}`
   - Code recognizes `cardTransaction` as success ✅
   - Tries to cache by:
     - Transaction ID: `TXN123` ✅
     - Invoice number from query params: Often missing ❌
     - Most recent session key: May not match ❌

3. **Polling Fails:**
   - Frontend polls with `INV000001`
   - Cache lookup for `INV000001` fails
   - Payment stays pending forever

## The Real Fix Needed

### 1. Ensure Invoice Number is Available
The webhook MUST know which invoice number to cache under. Either:
- Helcim includes it in the webhook body
- Helcim includes it in the query params
- We can reliably match it from sessions

### 2. Debug What's Actually Happening
Run with these logs enabled to see:
- What webhook URL is being sent to Helcim
- What webhook is actually received
- What keys are being used for caching
- What the polling endpoint is checking

### 3. Verify Helcim Configuration
Check in Helcim Dashboard:
- Is a static webhook URL configured?
- Does it override the dynamic URL we send?
- Can we use webhook templates with variables?

## Quick Test

1. Start a payment and note the invoice number
2. Check server logs for the webhook URL being sent
3. When webhook arrives, check if query params are included
4. Check what keys the webhook is cached under
5. Check what key the polling is using

## Temporary Workaround

If the webhook can't be matched properly, you can manually mark payments as complete using:

```bash
POST /api/terminal/fix-payment/{TRANSACTION_ID}
{
  "status": "completed",
  "appointmentId": 123,
  "tipAmount": 15.00,
  "totalAmount": 115.00
}
```

## The Code That Needs to Work

The critical connection is in the webhook handler:

```javascript
// This MUST successfully extract or determine the invoice number
let invoiceNumber = 
  queryInvoiceNumber ||           // From URL query params
  payload?.invoiceNumber ||        // From webhook body
  matchFromSession();              // From recent sessions

// Then cache with BOTH keys so polling can find it
webhookStore.set(transactionId, cacheData);    // By Helcim ID
webhookStore.set(invoiceNumber, cacheData);     // By our invoice number
```

Without this connection, the payment will never complete in the app.


