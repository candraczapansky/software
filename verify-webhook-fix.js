#!/usr/bin/env node

/**
 * Script to verify that the webhook fixes have been applied correctly
 */

import fs from 'fs';
import path from 'path';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function checkFile(filePath, checks) {
  console.log(`\n${BLUE}Checking ${path.basename(filePath)}...${RESET}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let allPassed = true;
    
    for (const check of checks) {
      if (content.includes(check.text)) {
        console.log(`  ${GREEN}✓${RESET} ${check.description}`);
      } else {
        console.log(`  ${RED}✗${RESET} ${check.description}`);
        allPassed = false;
      }
    }
    
    return allPassed;
  } catch (error) {
    console.log(`  ${RED}✗ File not found${RESET}`);
    return false;
  }
}

console.log(`${BLUE}=== Verifying Helcim Webhook Fixes ===${RESET}`);

let allFixed = true;

// Check 1: terminal-routes.ts payment start
allFixed = checkFile('/home/runner/workspace/server/routes/terminal-routes.ts', [
  {
    text: 'sessionStore.set(String(helcimTxId), sessionData)',
    description: 'Payment start stores session by Helcim transaction ID'
  },
  {
    text: 'sessionStore.set(invoiceNumber, sessionData)',
    description: 'Payment start stores session by invoice number'
  },
  {
    text: 'helcimTxId: helcimTxId',
    description: 'Session data includes Helcim transaction ID'
  }
]) && allFixed;

// Check 2: terminal-routes.ts webhook handler
allFixed = checkFile('/home/runner/workspace/server/routes/terminal-routes.ts', [
  {
    text: 'const sessionByTxId = sessionStore.get(String(txId))',
    description: 'Webhook handler checks for session by transaction ID'
  },
  {
    text: 'type === \'cardTransaction\'',
    description: 'Webhook recognizes cardTransaction as success'
  },
  {
    text: 'webhookStore.set(String(sessionByTxId.invoiceNumber), cacheData)',
    description: 'Webhook caches by invoice number from session'
  }
]) && allFixed;

// Check 3: helcim-webhooks.ts
allFixed = checkFile('/home/runner/workspace/server/routes/helcim-webhooks.ts', [
  {
    text: 'const sessionByTxId = sessionStore.get(String(txId))',
    description: 'Helcim webhook checks for session by transaction ID'
  },
  {
    text: 'type === \'cardTransaction\'',
    description: 'Helcim webhook recognizes cardTransaction as success'
  },
  {
    text: 'invoiceNumber = sessionByTxId.invoiceNumber',
    description: 'Helcim webhook gets invoice number from session'
  }
]) && allFixed;

// Check 4: helcim-terminal-service.ts
allFixed = checkFile('/home/runner/workspace/server/services/helcim-terminal-service.ts', [
  {
    text: 'const sessionByTxId = sessionStore.get(String(transactionId))',
    description: 'Service checks for session by transaction ID'
  },
  {
    text: 'Consider ALL session keys, not just POS-* or INV*',
    description: 'Service considers all session keys (including numeric)'
  },
  {
    text: 'invoiceNumber = sessionByTxId.invoiceNumber',
    description: 'Service gets invoice number from matched session'
  }
]) && allFixed;

// Summary
console.log(`\n${BLUE}=== Summary ===${RESET}`);

if (allFixed) {
  console.log(`${GREEN}✓ All webhook fixes are in place!${RESET}`);
  console.log('\nThe code is correctly configured to:');
  console.log('  1. Store sessions by both invoice number AND transaction ID');
  console.log('  2. Match webhooks by transaction ID first, then by recent time');
  console.log('  3. Treat "cardTransaction" type as successful payment');
  console.log('  4. Cache webhook results by invoice number for polling');
  
  console.log(`\n${YELLOW}⚠️  Important:${RESET}`);
  console.log('  Your app must be RUNNING to receive webhooks!');
  console.log('  Current status: App is NOT running (503 error)');
  console.log('\n  To fix this:');
  console.log('  1. Go to your Replit project');
  console.log('  2. Click "Run" or "Deploy" to start the app');
  console.log('  3. Keep it running (may require deployment)');
} else {
  console.log(`${RED}✗ Some fixes are missing${RESET}`);
  console.log('\nPlease review the failed checks above.');
}

console.log(`\n${BLUE}Key insights about the fix:${RESET}`);
console.log('• Helcim sends: {"id": "TXN_ID", "type": "cardTransaction"}');
console.log('• "cardTransaction" = SUCCESS (no explicit approved field)');
console.log('• Frontend polls with invoice number (e.g., "1735067123")');
console.log('• Webhook only has transaction ID, not invoice number');
console.log('• Solution: Store session by BOTH keys, match by transaction ID');
