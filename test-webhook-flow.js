#!/usr/bin/env node

// Test script to debug webhook flow
const baseUrl = process.env.BASE_URL || 'http://localhost:3003';

async function testWebhook() {
  console.log('\n=== Testing Helcim Webhook Flow ===\n');
  
  // Simulate what Helcim sends for a successful payment
  const webhookData = {
    id: 'TEST-' + Date.now(),
    type: 'cardTransaction'
  };
  
  // Test with invoice number in query params (how Helcim actually sends it)
  const invoiceNumber = 'INV000001';
  const webhookUrl = `${baseUrl}/api/helcim/webhook?invoiceNumber=${invoiceNumber}`;
  
  console.log('1. Sending webhook to:', webhookUrl);
  console.log('   Payload:', JSON.stringify(webhookData, null, 2));
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    const result = await response.json();
    console.log('   Response:', response.status, result);
  } catch (error) {
    console.error('   Error sending webhook:', error.message);
  }
  
  // Now test polling
  console.log('\n2. Testing polling endpoint:');
  const pollUrl = `${baseUrl}/api/terminal/payment/1/${invoiceNumber}`;
  console.log('   Polling:', pollUrl);
  
  try {
    const response = await fetch(pollUrl);
    const result = await response.json();
    console.log('   Poll result:', JSON.stringify(result, null, 2));
    
    if (result.status === 'completed') {
      console.log('   ✅ SUCCESS: Payment marked as completed!');
    } else {
      console.log('   ❌ ISSUE: Payment status is', result.status);
    }
  } catch (error) {
    console.error('   Error polling:', error.message);
  }
  
  // Also test with transaction ID
  console.log('\n3. Testing polling with transaction ID:');
  const pollUrl2 = `${baseUrl}/api/terminal/payment/1/${webhookData.id}`;
  console.log('   Polling:', pollUrl2);
  
  try {
    const response = await fetch(pollUrl2);
    const result = await response.json();
    console.log('   Poll result:', JSON.stringify(result, null, 2));
    
    if (result.status === 'completed') {
      console.log('   ✅ SUCCESS: Payment marked as completed!');
    } else {
      console.log('   ❌ ISSUE: Payment status is', result.status);
    }
  } catch (error) {
    console.error('   Error polling:', error.message);
  }
  
  // Check debug snapshot
  console.log('\n4. Checking debug snapshot:');
  try {
    const response = await fetch(`${baseUrl}/api/terminal/debug/snapshot`);
    const snapshot = await response.json();
    console.log('   Sessions:', snapshot.sessions?.length || 0);
    console.log('   Webhooks:', snapshot.webhooks?.length || 0);
    if (snapshot.webhooks?.length > 0) {
      console.log('   Recent webhooks:');
      snapshot.webhooks.slice(-3).forEach(w => {
        console.log(`     - Key: ${w.key}, Status: ${w.status}, TxId: ${w.transactionId}`);
      });
    }
  } catch (error) {
    console.error('   Error getting snapshot:', error.message);
  }
}

testWebhook().catch(console.error);


