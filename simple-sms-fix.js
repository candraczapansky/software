// Simple SMS responder fix - JavaScript version
class SimpleSMSResponder {
  constructor() {
    this.conversations = new Map();
  }

  processSMS(sms) {
    console.log('📱 Processing:', sms.body);
    
    // Get conversation
    let conversation = this.conversations.get(sms.from);
    if (!conversation) {
      conversation = { phoneNumber: sms.from, step: 'start' };
    }
    
    // Get response
    const response = this.getResponse(sms.body, conversation);
    
    // Update conversation
    this.conversations.set(sms.from, conversation);
    
    console.log('📤 Response:', response.substring(0, 100) + '...');
    
    return {
      success: true,
      responseSent: true,
      response
    };
  }

  getResponse(message, conversation) {
    const text = message.toLowerCase().trim();
    
    console.log('🔍 Processing:', { text, step: conversation.step });
    
    // Handle greetings
    if (text === 'hi' || text === 'hello' || text === 'hey') {
      return 'Hey there! Welcome to Glo Head Spa! How can I help you today? 💆‍♀️✨';
    }
    
    // Handle business questions
    if (text.includes('how much') || text.includes('cost') || text.includes('price')) {
      return 'Here are our current prices:\n• Signature Head Spa - $99 (60 minutes)\n• Deluxe Head Spa - $160 (90 minutes)\n• Platinum Head Spa - $220 (120 minutes)\n\nWould you like to book an appointment? 💆‍♀️✨';
    }
    
    if (text.includes('services') || text.includes('what do you offer')) {
      return 'We offer these amazing services:\n• Signature Head Spa - $99 (60 minutes)\n• Deluxe Head Spa - $160 (90 minutes)\n• Platinum Head Spa - $220 (120 minutes)\n\nWhich service interests you? 💆‍♀️✨';
    }
    
    if (text.includes('hours') || text.includes('when are you open')) {
      return 'We\'re open Monday through Saturday, 9:00 AM to 6:00 PM. Sundays we\'re closed. What day works best for you? 📅';
    }
    
    // Handle reschedule/cancel
    if (text.includes('reschedule')) {
      return 'I\'d be happy to help you reschedule your appointment. Please call us at 9189325396 and we\'ll get that sorted out for you right away! 📞';
    }
    
    if (text.includes('cancel')) {
      return 'I\'d be happy to help you cancel your appointment. Please call us at 9189325396 and we\'ll take care of that for you right away! 📞';
    }
    
    // Handle booking flow
    return this.handleBookingFlow(text, conversation);
  }

  handleBookingFlow(text, conversation) {
    console.log('🔄 handleBookingFlow:', { text, step: conversation.step });
    
    // Step 1: Start booking
    if (conversation.step === 'start') {
      conversation.step = 'service';
      return 'Great! I\'d love to help you book an appointment. What service would you like?\n\nOur services include:\n• Signature Head Spa - $99 (60 minutes)\n• Deluxe Head Spa - $160 (90 minutes)\n• Platinum Head Spa - $220 (120 minutes)\n\nJust let me know which service you\'d like to book! 💆‍♀️✨';
    }
    
    // Step 2: Service selection
    if (conversation.step === 'service') {
      if (text.includes('signature')) {
        conversation.service = 'signature head spa';
        conversation.step = 'date';
        return 'Perfect! What date would you like to come in? You can say "tomorrow", "Friday", or any day that works for you. 📅';
      } else if (text.includes('deluxe')) {
        conversation.service = 'deluxe head spa';
        conversation.step = 'date';
        return 'Perfect! What date would you like to come in? You can say "tomorrow", "Friday", or any day that works for you. 📅';
      } else if (text.includes('platinum')) {
        conversation.service = 'platinum head spa';
        conversation.step = 'date';
        return 'Perfect! What date would you like to come in? You can say "tomorrow", "Friday", or any day that works for you. 📅';
      } else {
        return 'I didn\'t catch that. Could you please choose from our services:\n• Signature Head Spa - $99 (60 minutes)\n• Deluxe Head Spa - $160 (90 minutes)\n• Platinum Head Spa - $220 (120 minutes)';
      }
    }
    
    // Step 3: Date selection
    if (conversation.step === 'date') {
      if (text.includes('tomorrow') || text.includes('monday') || text.includes('tuesday') || 
          text.includes('wednesday') || text.includes('thursday') || text.includes('friday') || 
          text.includes('saturday') || text.includes('sunday')) {
        conversation.date = text;
        conversation.step = 'time';
        return `Great! Here are the available times for ${text}:\n\n• 9:00 AM\n• 11:00 AM\n• 1:00 PM\n• 3:00 PM\n• 5:00 PM\n\nWhich time works best for you? ⏰`;
      } else {
        return 'I didn\'t catch that. Could you please tell me what day you\'d like to come in? You can say "tomorrow", "Friday", or any specific day. 📅';
      }
    }
    
    // Step 4: Time selection - THIS IS THE FIX
    if (conversation.step === 'time') {
      console.log('⏰ Time selection step, input:', text);
      
      // Check for time patterns - FIXED LOGIC
      if (text.includes('3pm') || text.includes('3:00pm') || text.includes('3 pm') || text === '3') {
        conversation.time = '3pm';
        conversation.step = 'complete';
        return `Perfect! I've booked your ${conversation.service} appointment for ${conversation.date} at 3pm. You'll receive a confirmation shortly. Thank you for choosing Glo Head Spa! ✨`;
      } else if (text.includes('9am') || text.includes('9:00am') || text.includes('9 am') || text === '9') {
        conversation.time = '9am';
        conversation.step = 'complete';
        return `Perfect! I've booked your ${conversation.service} appointment for ${conversation.date} at 9am. You'll receive a confirmation shortly. Thank you for choosing Glo Head Spa! ✨`;
      } else if (text.includes('11am') || text.includes('11:00am') || text.includes('11 am') || text === '11') {
        conversation.time = '11am';
        conversation.step = 'complete';
        return `Perfect! I've booked your ${conversation.service} appointment for ${conversation.date} at 11am. You'll receive a confirmation shortly. Thank you for choosing Glo Head Spa! ✨`;
      } else if (text.includes('1pm') || text.includes('1:00pm') || text.includes('1 pm') || text === '1') {
        conversation.time = '1pm';
        conversation.step = 'complete';
        return `Perfect! I've booked your ${conversation.service} appointment for ${conversation.date} at 1pm. You'll receive a confirmation shortly. Thank you for choosing Glo Head Spa! ✨`;
      } else if (text.includes('5pm') || text.includes('5:00pm') || text.includes('5 pm') || text === '5') {
        conversation.time = '5pm';
        conversation.step = 'complete';
        return `Perfect! I've booked your ${conversation.service} appointment for ${conversation.date} at 5pm. You'll receive a confirmation shortly. Thank you for choosing Glo Head Spa! ✨`;
      } else {
        return 'I didn\'t catch that. Could you please choose from the available times:\n• 9:00 AM\n• 11:00 AM\n• 1:00 PM\n• 3:00 PM\n• 5:00 PM';
      }
    }
    
    // If we get here, reset to start
    console.log('⚠️ Unexpected step, resetting to start');
    conversation.step = 'start';
    return 'Great! I\'d love to help you book an appointment. What service would you like?\n\nOur services include:\n• Signature Head Spa - $99 (60 minutes)\n• Deluxe Head Spa - $160 (90 minutes)\n• Platinum Head Spa - $220 (120 minutes)\n\nJust let me know which service you\'d like to book! 💆‍♀️✨';
  }

  // Public methods
  clearConversation(phoneNumber) {
    this.conversations.delete(phoneNumber);
  }

  getConversationStats() {
    return {
      activeConversations: this.conversations.size,
      conversations: Array.from(this.conversations.entries()).map(([phone, conv]) => ({
        phone,
        step: conv.step,
        service: conv.service,
        date: conv.date,
        time: conv.time
      }))
    };
  }
}

// Test the fix
function testTimeFix() {
  console.log('🧪 Testing Time Fix\n');
  
  const responder = new SimpleSMSResponder();
  const phoneNumber = '+1234567890';
  const messages = [
    'Hi',
    'I want to book an appointment',
    'Signature Head Spa',
    'Tomorrow',
    '3pm'  // This was causing the issue
  ];
  
  console.log('📱 Testing conversation flow:');
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`\n${i + 1}. User: "${message}"`);
    
    const result = responder.processSMS({
      from: phoneNumber,
      to: '+1987654321',
      body: message,
      timestamp: new Date().toISOString(),
      messageId: `test-${i}`
    });
    
    if (result.success && result.responseSent) {
      console.log(`   Bot: "${result.response?.substring(0, 150)}..."`);
      
      // Check if the last message (3pm) was handled correctly
      if (i === 4 && message === '3pm') {
        if (result.response?.includes('booked your appointment')) {
          console.log('✅ SUCCESS: Time "3pm" was correctly processed!');
        } else if (result.response?.includes('What service would you like')) {
          console.log('❌ FAILED: Time "3pm" reset to service selection');
          console.log('This means the conversation state was lost');
        } else if (result.response?.includes('available times')) {
          console.log('❌ FAILED: Time "3pm" went back to time selection');
          console.log('This means the time extraction failed');
        } else {
          console.log('❌ FAILED: Unexpected response');
          console.log('Response:', result.response);
        }
      }
    } else {
      console.log(`   Bot: [No response - ${result.error}]`);
    }
  }
  
  console.log('\n📊 Conversation Stats:');
  console.log(JSON.stringify(responder.getConversationStats(), null, 2));
  
  console.log('\n✅ Test completed');
}

// Run the test
testTimeFix(); 