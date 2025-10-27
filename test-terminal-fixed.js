#!/usr/bin/env node

/**
 * Test script to verify the Helcim Smart Terminal webhook flow is working correctly
 * This simulates the complete payment flow: start -> webhook -> poll
 */

const BASE_URL = 'http://localhost:3003';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTerminalFlow() {
  console.log(`${BLUE}=== Testing Helcim Smart Terminal Flow ===${RESET}\n`);

  // Step 1: Start a payment
  console.log(`${YELLOW}1. Starting payment on terminal...${RESET}`);
  
  const startResponse = await fetch(`${BASE_URL}/api/terminal/payment/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: 'test-location',
      amount: 100.00,
      description: 'Test payment'
    })
  });

  if (!startResponse.ok) {
    console.error(`${RED}✗ Failed to start payment: ${startResponse.status}${RESET}`);
    const text = await startResponse.text();
    console.error(text);
    return;
  }

  const startData = await startResponse.json();
  console.log(`${GREEN}✓ Payment started${RESET}`);
  console.log(`  Invoice Number: ${startData.invoiceNumber || startData.paymentId}`);
  console.log(`  Transaction ID: ${startData.transactionId || 'Not yet assigned'}`);

  const invoiceNumber = startData.invoiceNumber || startData.paymentId;
  
  // Wait a moment for session to be stored
  await sleep(500);

  // Step 2: Simulate webhook from Helcim (minimal webhook format)
  console.log(`\n${YELLOW}2. Simulating Helcim webhook...${RESET}`);
  
  // Generate a fake transaction ID
  const txId = 'TXN_' + Date.now();
  
  // Test both webhook endpoints
  const webhookEndpoints = [
    '/api/terminal/webhook',
    '/api/helcim/webhook'
  ];

  for (const endpoint of webhookEndpoints) {
    console.log(`  Sending to ${endpoint}...`);
    
    const webhookResponse = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: txId,
        type: 'cardTransaction'  // This indicates success
      })
    });

    if (!webhookResponse.ok) {
      console.error(`${RED}  ✗ Webhook failed: ${webhookResponse.status}${RESET}`);
    } else {
      console.log(`${GREEN}  ✓ Webhook accepted${RESET}`);
    }
  }

  // Wait for webhook processing
  await sleep(1000);

  // Step 3: Poll for payment status
  console.log(`\n${YELLOW}3. Polling for payment status...${RESET}`);
  
  let attempts = 0;
  let status = 'pending';
  
  while (attempts < 5 && status === 'pending') {
    attempts++;
    console.log(`  Attempt ${attempts}/5...`);
    
    const pollResponse = await fetch(`${BASE_URL}/api/terminal/payment/test-location/${invoiceNumber}`);
    
    if (!pollResponse.ok) {
      console.error(`${RED}  ✗ Poll failed: ${pollResponse.status}${RESET}`);
      break;
    }
    
    const pollData = await pollResponse.json();
    status = pollData.status;
    
    console.log(`  Status: ${status === 'completed' ? GREEN : YELLOW}${status}${RESET}`);
    
    if (status === 'completed') {
      console.log(`${GREEN}✓ Payment completed successfully!${RESET}`);
      console.log(`  Transaction ID: ${pollData.transactionId || txId}`);
      break;
    } else if (status === 'failed') {
      console.log(`${RED}✗ Payment failed${RESET}`);
      break;
    }
    
    if (attempts < 5) {
      await sleep(2000);
    }
  }
  
  if (status === 'pending') {
    console.log(`${RED}✗ Payment still pending after ${attempts} attempts${RESET}`);
    console.log(`${YELLOW}  This indicates the webhook was not properly matched to the session${RESET}`);
  }

  // Step 4: Check debug snapshot
  console.log(`\n${YELLOW}4. Checking debug snapshot...${RESET}`);
  
  const snapshotResponse = await fetch(`${BASE_URL}/api/terminal/debug/snapshot`);
  if (snapshotResponse.ok) {
    const snapshot = await snapshotResponse.json();
    console.log(`  Active sessions: ${snapshot.sessions?.length || 0}`);
    console.log(`  Webhook cache entries: ${snapshot.webhookCache?.length || 0}`);
    
    // Show recent webhook cache entries
    if (snapshot.webhookCache && snapshot.webhookCache.length > 0) {
      console.log(`\n  Recent webhook cache:`);
      snapshot.webhookCache.slice(0, 3).forEach(entry => {
        console.log(`    ${entry.key}: ${entry.status} (${Math.round((Date.now() - entry.updatedAt) / 1000)}s ago)`);
      });
    }
  }

  console.log(`\n${BLUE}=== Test Complete ===${RESET}`);
  
  // Summary
  console.log('\nSummary:');
  if (status === 'completed') {
    console.log(`${GREEN}✓ Webhook integration is working correctly!${RESET}`);
    console.log('  - Payment was started');
    console.log('  - Webhook was received and processed');
    console.log('  - Session was matched by transaction ID or recent time');
    console.log('  - Polling found the completed status');
  } else {
    console.log(`${RED}✗ Webhook integration needs attention${RESET}`);
    console.log('  Possible issues:');
    console.log('  1. Session not stored with transaction ID');
    console.log('  2. Webhook not finding matching session');
    console.log('  3. Cache key mismatch between webhook and polling');
    console.log('\n  Check server logs for:');
    console.log('  - "Found session by exact txId!" (good)');
    console.log('  - "Cached by NEWEST session invoice" (fallback)');
    console.log('  - "No recent sessions found" (problem)');
  }
}

// Run the test
testTerminalFlow().catch(err => {
  console.error(`${RED}Test failed with error:${RESET}`, err);
  process.exit(1);
});

