#!/usr/bin/env node

import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';
import readline from 'readline';
const { Client } = pg;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Simple encryption functions (matching server/utils/encryption.js)
function encrypt(text) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from((process.env.ENCRYPTION_KEY || 'default-key-change-in-production').padEnd(32, '0').slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

async function setupTerminal() {
  console.log('\n🚀 Helcim Smart Terminal Setup\n');
  console.log('=' .repeat(50));
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.log('\n📝 Please set DATABASE_URL in your .env file or environment');
    process.exit(1);
  }
  
  console.log('\n📋 Please provide the following information:\n');
  
  // Get terminal configuration from user
  const terminalId = await question('Terminal ID (e.g., GloUpCounterT1): ');
  const deviceCode = await question('Device Code (shown on terminal): ');
  const locationId = await question('Location ID (e.g., 4): ');
  const apiToken = await question('Helcim API Token: ') || process.env.HELCIM_API_TOKEN;
  
  if (!terminalId || !deviceCode || !locationId || !apiToken) {
    console.error('\n❌ All fields are required!');
    rl.close();
    process.exit(1);
  }
  
  console.log('\n📝 Configuration Summary:');
  console.log(`   Terminal ID: ${terminalId}`);
  console.log(`   Device Code: ${deviceCode}`);
  console.log(`   Location ID: ${locationId}`);
  console.log(`   API Token: ${apiToken.substring(0, 10)}...`);
  
  const confirm = await question('\n❓ Is this correct? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Setup cancelled');
    rl.close();
    process.exit(0);
  }
  
  // Connect to database
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('\n✅ Connected to database');
    
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS terminal_configurations (
        id SERIAL PRIMARY KEY,
        terminal_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        api_token TEXT NOT NULL,
        device_code TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(location_id, terminal_id)
      );
    `);
    
    console.log('✅ Terminal configurations table ready');
    
    // Encrypt the API token
    const encryptedToken = encrypt(apiToken);
    
    // Upsert the terminal configuration
    const result = await client.query(`
      INSERT INTO terminal_configurations (
        terminal_id, location_id, api_token, device_code, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      ON CONFLICT (location_id, terminal_id)
      DO UPDATE SET
        api_token = EXCLUDED.api_token,
        device_code = EXCLUDED.device_code,
        is_active = true,
        updated_at = NOW()
      RETURNING id;
    `, [terminalId, locationId, encryptedToken, deviceCode]);
    
    const configId = result.rows[0].id;
    console.log(`✅ Terminal configuration saved (ID: ${configId})`);
    
    // Test the configuration
    console.log('\n🔍 Testing configuration...');
    
    const testUrl = process.env.HELCIM_API_URL || 'https://api.helcim.com/v2';
    
    try {
      const response = await fetch(`${testUrl}/card-transactions?limit=1`, {
        method: 'GET',
        headers: {
          'api-token': apiToken,
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('✅ Successfully connected to Helcim API');
      } else {
        console.log('⚠️  Warning: Could not verify Helcim API connection');
        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log('   Please verify your API token is correct');
      }
    } catch (error) {
      console.log('⚠️  Warning: Could not test Helcim API connection');
      console.log(`   Error: ${error.message}`);
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('\n🎉 Terminal setup complete!\n');
    console.log('📝 Next steps:');
    console.log('   1. Ensure your terminal is powered on and connected');
    console.log('   2. Test a payment from your application');
    console.log('   3. The terminal should receive the payment request');
    console.log('\n💡 Troubleshooting tips:');
    console.log('   - Make sure HELCIM_API_TOKEN is set in your environment');
    console.log('   - Ensure HELCIM_API_URL is set to https://api.helcim.com/v2');
    console.log('   - Check that the device code matches what\'s shown on your terminal');
    console.log('   - For webhook support, configure your webhook URL in Helcim');
    
  } catch (error) {
    console.error('\n❌ Error setting up terminal:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    rl.close();
  }
}

// Run setup
setupTerminal().catch(console.error);
