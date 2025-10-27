#!/usr/bin/env node

import fetch from 'node-fetch';

async function testNotificationFlow() {
  console.log('🔬 Testing Notification Flow for Widget Bookings\n');
  console.log('=' . repeat(60));
  
  const API_BASE = 'http://localhost:3002';
  
  try {
    // First, check the client data
    console.log('\n1️⃣ Checking client data...');
    const clientRes = await fetch(`${API_BASE}/api/users/22624`);
    if (clientRes.ok) {
      const client = await clientRes.json();
      console.log('Client found:', {
        id: client.id,
        email: client.email,
        phone: client.phone,
        smsAppointmentReminders: client.smsAppointmentReminders,
        emailAppointmentReminders: client.emailAppointmentReminders
      });
      
      if (!client.email) console.log('⚠️  Client has NO EMAIL!');
      if (!client.phone) console.log('⚠️  Client has NO PHONE!');
    } else {
      console.log('❌ Could not fetch client 22624');
    }
    
    // Now create a test appointment with widget method
    console.log('\n2️⃣ Creating appointment with bookingMethod: widget...');
    
    const appointmentData = {
      clientId: 22624,
      serviceId: 104,
      staffId: 6,
      locationId: 4,
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: new Date(Date.now() + 90000000).toISOString(),
      status: 'confirmed',
      paymentStatus: 'unpaid',
      bookingMethod: 'widget',
      notes: 'NOTIFICATION TEST - Widget booking'
    };
    
    console.log('\nSending:', JSON.stringify(appointmentData, null, 2));
    
    const response = await fetch(`${API_BASE}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointmentData)
    });
    
    if (response.ok) {
      const appointment = await response.json();
      console.log('\n✅ Appointment created successfully!');
      console.log('Appointment ID:', appointment.id);
      
      console.log('\n3️⃣ Check your SERVER CONSOLE for these logs:');
      console.log('   - "🔍 [APPOINTMENT API] Received appointment request"');
      console.log('   - "✅ CONFIRMATION CODE IS REACHED ✅"');
      console.log('   - "📱 [NOTIFICATION CHECK] About to send notifications"');
      console.log('   - "isFromWidget: true"');
      console.log('\nIf you DON\'T see these, the notification code isn\'t running!');
    } else {
      const error = await response.text();
      console.log('❌ Failed to create appointment:', response.status);
      console.log('Error:', error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testNotificationFlow();


