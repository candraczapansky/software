# Helcim Smart Terminal Webhook - Complete Implementation Guide

## ⚠️ CRITICAL REQUIREMENT
**YOUR APP MUST BE RUNNING AND ACCESSIBLE** for webhooks to work. If your app returns 503 or is offline, webhooks will fail.

## The Core Problem
Helcim sends minimal webhooks: `{"id": "TRANSACTION_ID", "type": "cardTransaction"}`
- No invoice number included
- No explicit approval field
- Just transaction ID and type

## The Complete Solution

### 1. Payment Start Endpoint (`/api/terminal/payment/start`)

**Location**: `/server/routes/terminal-routes.ts` (lines 66-206)

```javascript
router.post('/payment/start', async (req, res) => {
  const data = req.body;
  
  // Create invoice number (what frontend will poll with)
  let invoiceNumber;
  if (appointmentId) {
    invoiceNumber = `INV${String(paymentId).padStart(6, '0')}`;
  } else {
    // For POS payments, use timestamp (Helcim doesn't like prefixes)
    invoiceNumber = String(Date.now()).slice(-10);
  }
  
  // Start payment on terminal
  const result = await terminalService.startPayment(
    data.locationId,
    data.amount,
    { invoiceNumber, appointmentId, paymentId }
  );
  
  // Extract Helcim transaction ID if available
  const helcimTxId = result.transactionId || result.paymentId || result.id;
  
  // CRITICAL: Store session with ALL possible keys
  if (terminalService.sessionStore) {
    const sessionData = {
      startedAt: Date.now(),
      locationId: data.locationId,
      totalAmount: data.amount,
      baseAmount: data.amount,
      invoiceNumber: invoiceNumber,
      helcimTxId: helcimTxId  // Store Helcim ID if we have it
    };
    
    // Store by invoice number (for polling)
    terminalService.sessionStore.set(invoiceNumber, sessionData);
    
    // CRITICAL: Also store by Helcim transaction ID if available
    // This allows webhook to find the session
    if (helcimTxId) {
      terminalService.sessionStore.set(String(helcimTxId), sessionData);
    }
  }
  
  // Return invoice number for frontend to poll with
  res.json({
    success: true,
    paymentId: invoiceNumber,  // Frontend polls with this
    transactionId: helcimTxId,
    invoiceNumber: invoiceNumber,
    status: 'pending'
  });
});
```

### 2. Webhook Handler (`/api/terminal/webhook`)

**Location**: `/server/routes/terminal-routes.ts` (lines 1585-1687)

```javascript
router.post('/webhook', async (req, res) => {
  try {
    // Log webhook receipt
    console.log('🚨🚨🚨 TERMINAL WEBHOOK RECEIVED 🚨🚨🚨');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Parse payload
    let payload = req.body || {};
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }
    
    // Extract data from minimal webhook
    const txId = payload?.id;
    const type = payload?.type;
    
    // Check query params for invoice number (if Helcim includes it)
    const queryInvoiceNumber = req.query?.invoiceNumber;
    
    // Process based on type
    if (type === 'cardTransaction' && txId) {
      // CRITICAL: 'cardTransaction' means SUCCESS
      let paymentStatus = 'completed';
      
      // Only override if explicit failure indicators
      const statusStr = [
        payload?.status,
        payload?.approved,
        payload?.error
      ].filter(s => s != null).join(' ').toLowerCase();
      
      if (statusStr.includes('declined') || 
          statusStr.includes('failed') ||
          payload?.approved === false) {
        paymentStatus = 'failed';
      }
      
      // Get webhook store
      const webhookStore = sharedTerminalService.webhookStore;
      const sessionStore = sharedTerminalService.sessionStore;
      
      const cacheData = {
        status: paymentStatus,
        transactionId: txId,
        updatedAt: Date.now()
      };
      
      // Cache by transaction ID
      webhookStore.set(String(txId), cacheData);
      
      // CRITICAL: Find and cache by invoice number
      if (queryInvoiceNumber) {
        // Best case: invoice number in query params
        webhookStore.set(String(queryInvoiceNumber), cacheData);
        console.log(`✅ Cached by query invoice: ${queryInvoiceNumber}`);
      } else if (sessionStore) {
        // Try to find session by transaction ID
        const sessionByTxId = sessionStore.get(String(txId));
        if (sessionByTxId && sessionByTxId.invoiceNumber) {
          webhookStore.set(String(sessionByTxId.invoiceNumber), cacheData);
          console.log(`✅ Found session by txId! Cached by invoice: ${sessionByTxId.invoiceNumber}`);
        } else {
          // Fallback: find most recent session
          const now = Date.now();
          let newestSession = null;
          sessionStore.forEach((session, key) => {
            if (now - session.startedAt <= 5 * 60 * 1000) {
              if (!newestSession || session.startedAt > newestSession.startedAt) {
                newestSession = { key, session };
              }
            }
          });
          
          if (newestSession && newestSession.session.invoiceNumber) {
            webhookStore.set(String(newestSession.session.invoiceNumber), cacheData);
            console.log(`✅ Cached by newest session invoice: ${newestSession.session.invoiceNumber}`);
          }
        }
      }
      
      // Process webhook asynchronously
      setImmediate(async () => {
        await sharedTerminalService.handleWebhook({
          id: txId,
          transactionId: txId,
          type: 'cardTransaction',
          status: paymentStatus,
          rawPayload: payload
        });
      });
    }
    
    // ALWAYS return 200 immediately (Helcim requirement)
    return res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    // Still return 200 to prevent retries
    return res.status(200).json({ received: true });
  }
});
```

### 3. Polling Endpoint (`/api/terminal/payment/:locationId/:paymentId`)

**Location**: `/server/routes/terminal-routes.ts` (lines 212-360)

```javascript
router.get('/payment/:locationId/:paymentId', async (req, res) => {
  const { locationId, paymentId } = req.params;
  
  console.log('🔍 Checking webhook cache for paymentId:', paymentId);
  
  // Check webhook cache
  const cached = terminalService.checkWebhookCache(paymentId);
  console.log('📦 Cache result:', cached || 'NOT FOUND');
  
  if (cached) {
    return res.json({
      success: cached.status === 'completed',
      status: cached.status,
      transactionId: cached.transactionId || paymentId
    });
  }
  
  // Check payment status (will look in sessions)
  const status = await terminalService.checkPaymentStatus(locationId, paymentId);
  
  res.json({
    success: status.status === 'completed',
    status: status.status || 'pending',
    transactionId: status.transactionId || paymentId
  });
});
```

### 4. Helcim Webhook Handler (`/api/helcim/webhook`)

**Location**: `/server/routes/helcim-webhooks.ts` (lines 15-810)

```javascript
const handler = async (req, res) => {
  try {
    // Log everything for debugging
    console.log('❗❗❗ HELCIM WEBHOOK RECEIVED ❗❗❗');
    console.log('Query:', req.query);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Extract query params (critical for matching)
    const queryInvoiceNumber = req.query?.invoiceNumber;
    
    // Parse payload
    const payload = req.body;
    const txId = payload?.id;
    const type = payload?.type;
    
    // Determine status
    let paymentStatus = 'pending';
    
    // CRITICAL: 'cardTransaction' type means SUCCESS
    if (type === 'cardTransaction') {
      paymentStatus = 'completed';
      console.log('✅ Smart Terminal cardTransaction webhook - marking as COMPLETED');
    } else if (type === 'terminalDecline' || type === 'terminalCancel') {
      paymentStatus = 'failed';
    }
    
    // Check for explicit status indicators
    if (payload?.approved === true) {
      paymentStatus = 'completed';
    } else if (payload?.approved === false) {
      paymentStatus = 'failed';
    }
    
    // Cache the result
    const cacheData = {
      status: paymentStatus,
      transactionId: txId,
      amount: payload?.amount,
      tipAmount: payload?.tipAmount || 0,
      updatedAt: Date.now()
    };
    
    // Cache by transaction ID
    webhookStore.set(String(txId), cacheData);
    
    // Cache by invoice number if available
    let invoiceNumber = queryInvoiceNumber || payload?.invoiceNumber;
    
    if (invoiceNumber) {
      webhookStore.set(String(invoiceNumber), cacheData);
    } else {
      // Find most recent session
      sessionStore.forEach((session, key) => {
        if (Date.now() - session.startedAt <= 5 * 60 * 1000) {
          webhookStore.set(key, cacheData);
          if (session.invoiceNumber) {
            webhookStore.set(session.invoiceNumber, cacheData);
          }
        }
      });
    }
    
    // Process webhook (update database, etc.)
    await terminalService.handleWebhook({
      id: txId,
      transactionId: txId,
      type: type,
      status: paymentStatus,
      invoiceNumber: invoiceNumber,
      rawPayload: payload
    });
    
    // ALWAYS return 200
    return res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(200).json({ received: true });
  }
};
```

## What NOT to Do (Things That Didn't Work)

### ❌ DON'T #1: Don't assume Helcim sends detailed webhooks
**Problem**: Waiting for `approved: true` field that never comes
**Reality**: Helcim sends minimal `{"id": "TXN", "type": "cardTransaction"}`

### ❌ DON'T #2: Don't default unclear webhooks to "pending"
**Problem**: Keeping `cardTransaction` as pending forever
**Reality**: `type: "cardTransaction"` IS the success indicator

### ❌ DON'T #3: Don't rely on webhook URL in payment request
**Problem**: Sending webhook URL with invoice number in payment request
**Reality**: Helcim uses their dashboard-configured static URL

### ❌ DON'T #4: Don't assume webhook includes invoice number
**Problem**: Expecting invoice number in webhook body
**Reality**: Only transaction ID is guaranteed

### ❌ DON'T #5: Don't try to query Helcim API for transaction details
**Problem**: Trying to fetch transaction by ID to get invoice number
**Reality**: Helcim v2 API doesn't have this endpoint

### ❌ DON'T #6: Don't forget to check if app is running
**Problem**: Debugging code when app returns 503
**Reality**: App must be deployed and running to receive webhooks

## Testing Checklist

### 1. Verify App is Running
```bash
curl -I https://your-domain.com/api/terminal/webhook
# Should return 200 or 404, NOT 503
```

### 2. Test Webhook Manually
```bash
curl -X POST https://your-domain.com/api/terminal/webhook \
  -H "Content-Type: application/json" \
  -d '{"id":"TEST123","type":"cardTransaction"}'
# Should return {"received": true}
```

### 3. Check Debug Logs
Look for these in server logs:
- `🚨🚨🚨 TERMINAL WEBHOOK RECEIVED` - Webhook arrived
- `✅ Found session by txId!` - Session matched successfully
- `📦 Cache result: { status: 'completed' }` - Polling found result

### 4. Debug Snapshot
```bash
GET /api/terminal/debug/snapshot
```
Shows recent sessions and webhook cache entries

## Helcim Configuration

### Dashboard Webhook Settings
- **URL**: `https://your-domain.com/api/terminal/webhook`
- **Events**: Card Transaction, Terminal Cancel, Terminal Decline
- **Method**: POST
- **Format**: JSON

### Environment Variables
```bash
HELCIM_API_TOKEN=your-token
PUBLIC_BASE_URL=https://your-domain.com  # Optional
```

## Manual Recovery

If webhook fails, manually complete payment:
```bash
POST /api/terminal/fix-payment/{TRANSACTION_ID}
{
  "status": "completed",
  "appointmentId": 123,
  "tipAmount": 15.00,
  "totalAmount": 115.00
}
```

## Key Success Factors

1. **App must be running** - 503 = no webhooks
2. **Recognize webhook types** - `cardTransaction` = success
3. **Store sessions properly** - By both invoice and transaction ID
4. **Match webhook to session** - Find invoice number from session
5. **Cache for polling** - Under invoice number frontend uses
6. **Always return 200** - Prevent Helcim retries

## The Flow That Works

1. Payment starts → Session stored with `invoiceNumber` and `helcimTxId`
2. Webhook arrives → `{"id": "TXN123", "type": "cardTransaction"}`
3. Find session by `TXN123` → Get `invoiceNumber`
4. Cache result under `invoiceNumber`
5. Frontend polls with `invoiceNumber` → Finds completed status ✅

This is the complete, working solution. The key insight is that `type: "cardTransaction"` means success, and we must match the webhook to the session to find the invoice number for caching.
