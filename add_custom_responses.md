# 🎯 How to Add Custom Responses to AI Responder

## Quick Start: Add a New Response in 3 Steps

### Step 1: Choose Where to Add It

| Response Type | File to Edit | Best For |
|--------------|--------------|----------|
| General AI behavior | `llm_service.py` | Personality, tone, general knowledge |
| Booking flows | `conversation_manager.py` | Step-by-step booking process |
| Voice fallbacks | `voice_service.py` | Voice call responses when AI fails |
| FAQs & Info | `business_knowledge.json` | Static business information |

---

## Method 1: Update System Prompt (Most Common)

**File:** `/home/runner/workspace/python_sms_responder/llm_service.py`

```python
# Find the _get_system_prompt function (around line 40)
def _get_system_prompt(self) -> str:
    return """You are an AI assistant for Glo Head Spa...
    
    # ADD YOUR CUSTOM RESPONSES HERE:
    COMMON RESPONSES:
    - "Do you take walk-ins?": "Walk-ins welcome but appointments recommended! 📅"
    - "Gift cards?": "Yes! Gift certificates available for all services 🎁"
    - "Parking?": "Free parking right in front! Super convenient 🚗"
    - "First time?": "Welcome! Our Signature Head Spa ($99) is perfect for first-timers!"
    """
```

---

## Method 2: Add Specific Response Patterns

**File:** `/home/runner/workspace/python_sms_responder/conversation_manager.py`

```python
# In the _handle_greeting function (around line 122)
def _handle_greeting(self, state: ConversationState, message: str):
    message_lower = message.lower()
    
    # ADD CUSTOM PATTERNS HERE:
    if "gift" in message_lower and "card" in message_lower:
        return {
            "response": "Yes! We offer gift certificates for all our services! Perfect for any occasion 🎁✨",
            "step": "greeting",
            "requires_booking": False
        }
    
    if "first time" in message_lower:
        return {
            "response": "Welcome! For first-timers, we recommend our Signature Head Spa ($99). It's the perfect introduction to our services! Ready to book? 💆‍♀️",
            "step": "greeting",
            "requires_booking": False
        }
```

---

## Method 3: Add Voice Call Fallback Responses

**File:** `/home/runner/workspace/python_sms_responder/voice_service.py`

```python
# Around line 370 in _generate_ai_response function
# Add your custom voice responses:

elif any(word in user_speech_lower for word in ['gift', 'certificate', 'gift card']):
    response = "Yes! We offer gift certificates for all our services. They make perfect gifts for birthdays, holidays, or just to show someone you care. Would you like to purchase one?"

elif any(word in user_speech_lower for word in ['parking', 'where to park']):
    response = "We have free parking available right in front of our spa! It's very convenient and easy to find. Would you like directions to our location?"
```

---

## Method 4: Update Business Knowledge (FAQs)

**File:** `/home/runner/workspace/python_sms_responder/business_knowledge.json`

```json
{
  "faqs": [
    {
      "question": "Do you offer gift cards?",
      "answer": "Yes! Gift certificates are available for all services and make perfect gifts! 🎁"
    },
    {
      "question": "Is there parking?",
      "answer": "Free parking is available right in front of our spa for your convenience!"
    },
    {
      "question": "Good for first timers?",
      "answer": "Absolutely! Our Signature Head Spa ($99) is perfect for first-time visitors!"
    }
  ]
}
```

---

## Method 5: Quick Promotions & Specials

Add temporary promotions to the system prompt:

```python
# In llm_service.py
CURRENT PROMOTIONS:
- "New client special: 20% off your first Signature Head Spa!"
- "Refer a friend and both get 15% off"
- "Book 3 sessions, get the 4th free!"
```

---

## Testing Your New Responses

After adding responses, restart the Python responder:

```bash
# 1. Stop the current responder
pkill -f "python.*main"

# 2. Start with new responses
cd /home/runner/workspace/python_sms_responder
python main.py &

# 3. Test your new response
curl -X POST http://localhost:8000/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+19185551234&To=+19187277348&Body=Do you have gift cards?"
```

---

## Pro Tips 💡

1. **Keep responses under 160 characters for SMS** (1 text message)
2. **Use emojis sparingly** - they help but don't overdo it
3. **Always test with actual phrases** customers might use
4. **Update the system prompt** for general knowledge
5. **Use conversation_manager.py** for structured flows
6. **Add to voice_service.py** for phone call fallbacks

---

## Common Response Templates

### Greeting Variations
- "Hi! Welcome to Glo Head Spa! How can I make your day more relaxing? 💆‍♀️"
- "Hello! Ready to experience ultimate relaxation? 🌟"
- "Hey there! Let's get you booked for some well-deserved pampering! ✨"

### Booking Starters
- "Perfect! Let me help you book that. When works best for you?"
- "Excellent choice! What day were you thinking?"
- "I'd love to get you scheduled! Do you have a preferred time?"

### Service Recommendations
- "For stress relief, our Deluxe Head Spa is amazing!"
- "First-timers love our Signature treatment!"
- "The Platinum is our ultimate luxury experience!"

### Closing Messages
- "Can't wait to see you! You're going to love it! 💕"
- "All set! See you soon for your relaxation session! 🌸"
- "Booked! Time to treat yourself! ✨"

---

## Need Help?

If responses aren't working:
1. Check Python responder is running: `ps aux | grep python`
2. Check logs: `tail -f python_responder.log`
3. Verify no syntax errors in edited files
4. Restart the responder after changes



