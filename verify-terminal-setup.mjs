#!/usr/bin/env node

import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function verifyTerminalSetup() {
  console.log('\n🔍 Verifying Helcim Smart Terminal Setup\n');
  console.log('=' .repeat(50));
  
  // 1. Check environment variables
  console.log('\n📋 1. Checking Environment Variables:\n');
  const requiredEnvVars = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'HELCIM_API_TOKEN': process.env.HELCIM_API_TOKEN,
    'HELCIM_API_URL': process.env.HELCIM_API_URL || 'https://api.helcim.com/v2',
    'HELCIM_WEBHOOK_URL': process.env.HELCIM_WEBHOOK_URL || process.env.TERMINAL_WEBHOOK_URL,
    'HELCIM_WEBHOOK_SECRET': process.env.HELCIM_WEBHOOK_SECRET,
    'CUSTOM_DOMAIN': process.env.CUSTOM_DOMAIN || process.env.PUBLIC_BASE_URL
  };
  
  let allEnvVarsSet = true;
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (value) {
      if (key.includes('TOKEN') || key.includes('SECRET') || key.includes('DATABASE')) {
        console.log(`✅ ${key}: ${value.substring(0, 10)}...`);
      } else {
        console.log(`✅ ${key}: ${value}`);
      }
    } else {
      console.log(`❌ ${key}: NOT SET`);
      if (key === 'HELCIM_API_TOKEN' || key === 'DATABASE_URL') {
        allEnvVarsSet = false;
      }
    }
  }
  
  if (!allEnvVarsSet) {
    console.error('\n❌ Critical environment variables are missing!');
    console.log('\n📝 To fix, set the following in your environment:');
    console.log('   HELCIM_API_TOKEN=<your_api_token>');
    console.log('   DATABASE_URL=<your_database_url>');
    process.exit(1);
  }
  
  // 2. Check database terminal configuration
  console.log('\n📋 2. Checking Database Terminal Configuration:\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Check if terminal_configurations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'terminal_configurations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ terminal_configurations table does not exist!');
      console.log('\n📝 To fix, run: node setup-terminal.mjs');
      process.exit(1);
    }
    
    console.log('✅ terminal_configurations table exists\n');
    
    // Get all terminal configurations
    const configs = await client.query(`
      SELECT 
        id,
        terminal_id,
        device_code,
        location_id,
        is_active,
        created_at,
        updated_at
      FROM terminal_configurations
      WHERE is_active = true
      ORDER BY updated_at DESC;
    `);
    
    if (configs.rows.length === 0) {
      console.log('⚠️  No active terminal configurations found!');
      console.log('\n📝 To fix, run: node setup-terminal.mjs');
      console.log('   You will need:');
      console.log('   - Terminal ID (e.g., GloUpCounterT1)');
      console.log('   - Device Code (shown on terminal)');
      console.log('   - Location ID (e.g., 4)');
      console.log('   - Helcim API Token');
    } else {
      console.log(`✅ Found ${configs.rows.length} active terminal configuration(s):\n`);
      configs.rows.forEach((config, index) => {
        console.log(`   Terminal ${index + 1}:`);
        console.log(`   - Terminal ID: ${config.terminal_id}`);
        console.log(`   - Device Code: ${config.device_code}`);
        console.log(`   - Location ID: ${config.location_id}`);
        console.log(`   - Active: ${config.is_active}`);
        console.log(`   - Last Updated: ${config.updated_at}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
  
  // 3. Test Helcim API connectivity
  console.log('\n📋 3. Testing Helcim API Connectivity:\n');
  
  const apiToken = process.env.HELCIM_API_TOKEN;
  const apiUrl = process.env.HELCIM_API_URL || 'https://api.helcim.com/v2';
  
  try {
    const response = await fetch(`${apiUrl}/card-transactions?limit=1`, {
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
      console.log(`   API URL: ${apiUrl}`);
      console.log(`   Status: ${response.status}`);
    } else {
      console.log('❌ Failed to connect to Helcim API');
      console.log(`   API URL: ${apiUrl}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Status Text: ${response.statusText}`);
      
      const errorText = await response.text();
      if (errorText) {
        console.log(`   Error: ${errorText}`);
      }
      
      if (response.status === 401) {
        console.log('\n📝 To fix: Check your HELCIM_API_TOKEN is correct');
      }
    }
  } catch (error) {
    console.error('❌ Error connecting to Helcim API:', error.message);
    console.log('\n📝 To fix: Check your network connection and API URL');
  }
  
  // 4. Check webhook configuration
  console.log('\n📋 4. Webhook Configuration:\n');
  
  const webhookUrl = process.env.HELCIM_WEBHOOK_URL || 
                     process.env.TERMINAL_WEBHOOK_URL ||
                     (process.env.CUSTOM_DOMAIN ? `${process.env.CUSTOM_DOMAIN}/api/terminal/webhook` : null) ||
                     (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/api/terminal/webhook` : null);
  
  if (webhookUrl) {
    console.log('✅ Webhook URL configured:');
    console.log(`   ${webhookUrl}`);
    console.log('\n📝 Make sure this URL is configured in your Helcim account:');
    console.log('   1. Log in to Helcim');
    console.log('   2. Go to Settings > API Access');
    console.log('   3. Set webhook URL to:', webhookUrl);
  } else {
    console.log('⚠️  No webhook URL configured');
    console.log('   Terminal payments will work with polling (2-4 second delay)');
    console.log('\n📝 To enable instant confirmations, set one of:');
    console.log('   - HELCIM_WEBHOOK_URL');
    console.log('   - TERMINAL_WEBHOOK_URL');
    console.log('   - CUSTOM_DOMAIN');
    console.log('   - PUBLIC_BASE_URL');
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('\n📊 SUMMARY:\n');
  
  const issueCount = 
    (!process.env.HELCIM_API_TOKEN ? 1 : 0) +
    (!process.env.DATABASE_URL ? 1 : 0) +
    (configs?.rows?.length === 0 ? 1 : 0);
  
  if (issueCount === 0) {
    console.log('✅ Terminal setup appears to be configured correctly!');
    console.log('\n🎯 Next steps:');
    console.log('   1. Test a terminal payment from your app');
    console.log('   2. Check the terminal receives the payment request');
    console.log('   3. Complete the payment on the terminal');
    console.log('   4. Verify the payment completes in your app');
  } else {
    console.log(`⚠️  Found ${issueCount} issue(s) that need attention`);
    console.log('\n🎯 Please address the issues above and run this script again');
  }
  
  console.log('\n' + '=' .repeat(50));
}

// Run verification
verifyTerminalSetup().catch(console.error);
