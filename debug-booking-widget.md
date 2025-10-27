# Debug Steps for Booking Widget Notifications

## To Debug the Issue:

1. **Open Browser Developer Console** (F12)
2. **Go to the booking widget page** 
3. **Look for these console logs during booking:**
   - `[BookingWidget] Creating appointment with data:` - Check if bookingMethod is 'widget'
   - `[BookingWidget] Appointment created:` - Check if appointment was created successfully

## Server-Side Logs to Check:

When you submit the booking, the server should log:
1. `🎯 APPOINTMENT CREATED SUCCESSFULLY 🎯`
2. `✅ CONFIRMATION CODE IS REACHED ✅` (3 times)
3. `🚨 ENTERING CONFIRMATION TRY BLOCK 🚨`
4. `isFromWidget: true`
5. Either `Sending email confirmation` or `SMS confirmation sent`

## What to Check:

### If you don't see `CONFIRMATION CODE IS REACHED`:
- The appointment creation is failing
- Check for error messages in console
- Check network tab for failed API calls

### If you see `CONFIRMATION CODE IS REACHED` but no notification logs:
- The client data retrieval might be failing
- Check if client was created properly

## Quick Test Commands:

To test if the API is working, run this in browser console:

```javascript
// Test if appointments API is accessible
fetch('/api/appointments', { 
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
}).then(r => r.json()).then(console.log).catch(console.error);

// Test creating a simple appointment (will likely fail validation but shows errors)
fetch('/api/appointments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: 1,
    serviceId: 1,
    staffId: 1,
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    status: 'confirmed',
    bookingMethod: 'widget'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

## Most Likely Issues:

1. **Validation Error**: The appointment data might not pass validation
2. **Conflict Check**: The appointment might be conflicting with existing appointments
3. **Missing Required Fields**: The widget might not be sending all required fields
4. **Server Error**: Check server logs for any crash or error messages
