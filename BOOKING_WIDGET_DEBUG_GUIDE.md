# Booking Widget Notification Debug Guide

## The Issue
SMS and Email confirmations are not being sent when customers book through the booking widget.

## Changes Made to Debug

### 1. Server-Side Logging Added
In `/server/routes/appointments.ts`:
- Added logging at the start of appointment creation to show incoming data
- Shows `bookingMethod` value to confirm it's 'widget'
- Already has logs for "CONFIRMATION CODE IS REACHED" to verify flow

### 2. Client-Side Logging Added
In `/client/src/components/bookings/booking-widget.tsx`:
- Added detailed logging when creating appointment after card save
- Shows full booking data being sent
- Shows any errors during appointment creation

## What to Check

### When You Book Through the Widget:

#### 1. Browser Console (F12 → Console tab):
Look for these logs in order:
- `[BookingWidget] 🎯 About to create appointment after card save`
- `[BookingWidget] 📤 Calling createAppointmentAfterPayment with data:`
- `[BookingWidget] 🚀 createAppointmentAfterPayment called`
- `[BookingWidget] Creating appointment with data:` (should show bookingMethod: 'widget')
- Either:
  - `[BookingWidget] ✅ Appointment created successfully:` (SUCCESS)
  - `[BookingWidget] ❌ Failed to create appointment:` (ERROR - check error message)

#### 2. Server Console/Logs:
Look for:
- `🔍 [APPOINTMENT API] Received appointment request:` (shows bookingMethod value)
- `✅ CONFIRMATION CODE IS REACHED ✅` (repeated 3 times)
- `🚨 ENTERING CONFIRMATION TRY BLOCK 🚨`
- `isFromWidget: true`
- `Sending email confirmation` or `SMS confirmation sent`

## Troubleshooting

### If Browser Shows "Failed to create appointment":
- Check the error message for details
- Common issues:
  - Missing required fields (clientId, serviceId, staffId, dates)
  - Time conflict with existing appointment
  - Validation errors

### If Server Shows Request but NO "CONFIRMATION CODE IS REACHED":
- Appointment creation is failing before notifications
- Check for:
  - Validation errors (look for "Validation failed" in logs)
  - Conflict errors (overlapping appointments)
  - Database errors

### If "CONFIRMATION CODE IS REACHED" but no "isFromWidget: true":
- The `bookingMethod: 'widget'` is not being preserved
- Check that server shows `bookingMethod: 'widget'` in received request

### If "isFromWidget: true" but no notification logs:
- Client data retrieval might be failing
- Check if client exists and has email/phone

## Quick Test
To verify the API works independently, you can test in browser console:

```javascript
// This will create a test appointment and trigger notifications
fetch('/api/appointments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: 1, // Use a real client ID
    serviceId: 1, // Use a real service ID
    staffId: 1,   // Use a real staff ID
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    status: 'confirmed',
    bookingMethod: 'widget',
    locationId: 1
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

## Next Steps
1. Try booking through the widget
2. Check browser console for error messages
3. Check server logs for where the flow stops
4. Share the specific error messages or missing logs

The added logging will help identify exactly where the process is failing.
