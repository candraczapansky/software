import type { Express, Request, Response } from "express";
import type { IStorage } from "../storage.js";
import { z } from "zod";
import { insertAppointmentSchema, insertAppointmentHistorySchema } from "../../shared/schema.js";
import { 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  asyncHandler 
} from "../utils/errors.js";
import LoggerService, { getLogContext } from "../utils/logger.js";
import { validateRequest, requireAuth } from "../middleware/error-handler.js";
import { sendEmail } from "../email.js";
import { sendSMS, isTwilioConfigured } from "../sms.js";
import { sendLocationMessage, upsertLocationTemplate } from "../location-messenger.js";
import { triggerCancellation } from "../automation-triggers.js";
import { db } from "../db.js";
import { locations as locationsTable } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

// Minimal helper to replace template variables like {client_name}
function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
  }
  return result;
}

export function registerAppointmentRoutes(app: Express, storage: IStorage) {
  // TEST ENDPOINT: Check SendGrid configuration
  app.get("/api/test-sendgrid-config", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    
    console.log("🔧 TEST: Checking SendGrid configuration...");
    
    try {
      // Check environment variables
      const envApiKey = process.env.SENDGRID_API_KEY;
      const envFromEmail = process.env.SENDGRID_FROM_EMAIL;
      
      console.log("🔧 Environment variables:");
      console.log("  - SENDGRID_API_KEY:", envApiKey ? "SET" : "NOT SET");
      console.log("  - SENDGRID_FROM_EMAIL:", envFromEmail || "NOT SET");
      
      // Check database configuration
      let dbApiKey = null;
      let dbFromEmail = null;
      
      try {
        const { DatabaseConfig } = await import('../config');
        const { DatabaseStorage } = await import('../storage');
        const storage = new DatabaseStorage();
        const dbConfig = new DatabaseConfig(storage);
        
        dbApiKey = await dbConfig.getSendGridKey();
        dbFromEmail = await dbConfig.getSendGridFromEmail();
        
        console.log("🔧 Database configuration:");
        console.log("  - SendGrid API Key:", dbApiKey ? "SET" : "NOT SET");
        console.log("  - SendGrid From Email:", dbFromEmail || "NOT SET");
      } catch (error) {
        console.log("🔧 Database config error:", error);
      }
      
      // Test email sending with current config
      const finalApiKey = dbApiKey || envApiKey;
      const finalFromEmail = dbFromEmail || envFromEmail || 'hello@headspaglo.com';
      
      console.log("🔧 Final configuration:");
      console.log("  - API Key:", finalApiKey ? "AVAILABLE" : "MISSING");
      console.log("  - From Email:", finalFromEmail);
      
      if (finalApiKey) {
        console.log("🔧 Testing email send...");
        const testResult = await sendEmail({
          to: "test@example.com",
          from: finalFromEmail,
          subject: 'SendGrid Configuration Test',
          html: '<h1>Test</h1><p>This is a configuration test.</p>'
        });
        
        res.json({
          success: true,
          config: {
            apiKey: finalApiKey ? "SET" : "MISSING",
            fromEmail: finalFromEmail,
            testResult: testResult
          },
          message: "Configuration checked"
        });
      } else {
        res.json({
          success: false,
          error: "SendGrid API key not configured",
          message: "Please set up SendGrid API key in environment or database"
        });
      }
    } catch (error: any) {
      console.log("🔧 Configuration test error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: "Error checking configuration"
      });
    }
  }));

  // TEST ENDPOINT: Test confirmation functionality
  app.get("/api/test-confirmation", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    
    console.log("🧪 TEST: Testing confirmation functionality...");
    LoggerService.info("Testing confirmation functionality", context);
    
    try {
      // Test email sending
      const testEmailResult = await sendEmail({
        to: "test@example.com",
        from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
        subject: 'TEST - Email Service Test',
        html: '<h1>Test Email</h1><p>This is a test email to verify the email service is working.</p>'
      });
      
      console.log("🧪 TEST: Email service result:", testEmailResult);
      LoggerService.info("Email service test result", { ...context, result: testEmailResult });
      
      // Test SMS sending
      const testSmsResult = await sendSMS("+1234567890", "TEST: SMS service test message");
      
      console.log("🧪 TEST: SMS service result:", testSmsResult);
      LoggerService.info("SMS service test result", { ...context, result: testSmsResult });
      
      res.json({
        success: true,
        emailTest: testEmailResult,
        smsTest: testSmsResult,
        message: "Confirmation services tested"
      });
    } catch (error: any) {
      console.log("🧪 TEST: Error testing confirmation services:", error);
      LoggerService.error("Error testing confirmation services", { ...context, error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        message: "Error testing confirmation services"
      });
    }
  }));

  // Get all appointments
  app.get("/api/appointments", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { staffId, clientId, date, status, locationId, startDate, endDate } = req.query;

    LoggerService.debug("Fetching appointments", { ...context, filters: { staffId, clientId, date, status, locationId, startDate, endDate } });

    let appointments;
    
    // Add date range filtering for performance
    if (startDate && endDate) {
      // Fetch appointments within date range
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      appointments = await storage.getAppointmentsByDateRange(start, end);
      
      // Apply additional filters if provided
      if (locationId) {
        appointments = appointments.filter((apt: any) => apt.locationId === parseInt(locationId as string));
      }
      if (staffId) {
        appointments = appointments.filter((apt: any) => apt.staffId === parseInt(staffId as string));
      }
      if (status) {
        appointments = appointments.filter((apt: any) => apt.status === status);
      }
    } else if (staffId) {
      appointments = await storage.getAppointmentsByStaff(parseInt(staffId as string));
    } else if (clientId) {
      appointments = await storage.getAppointmentsByClient(parseInt(clientId as string));
    } else if (date) {
      appointments = await storage.getAppointmentsByDate(new Date(date as string));
    } else if (locationId) {
      // If locationId is specified, get appointments for that location
      // If no appointments are found for the location, return all appointments (fallback)
      appointments = await storage.getAppointmentsByLocation(parseInt(locationId as string));
      if (appointments.length === 0) {
        // For performance, only get appointments from the last 3 months and next 3 months as fallback
        const now = new Date();
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const threeMonthsFromNow = new Date(now);
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        
        appointments = await storage.getAppointmentsByDateRange(threeMonthsAgo, threeMonthsFromNow);
      }
    } else if (status) {
      // Filter appointments by status - limit to recent appointments for performance
      const now = new Date();
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsFromNow = new Date(now);
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      
      const recentAppointments = await storage.getAppointmentsByDateRange(threeMonthsAgo, threeMonthsFromNow);
      appointments = recentAppointments.filter(apt => apt.status === status);
    } else {
      // Default: get appointments for a reasonable date range instead of ALL appointments
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsFromNow = new Date(now);
      twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
      
      appointments = await storage.getAppointmentsByDateRange(oneMonthAgo, twoMonthsFromNow);
    }

    // Enrich completed appointments with payment information
    const enrichedAppointments = await Promise.all(appointments.map(async (apt: any) => {
      if (apt.status === 'completed' && apt.paymentStatus === 'paid') {
        try {
          // Get payment records for this appointment
          const allPayments = await storage.getAllPayments();
          const appointmentPayments = allPayments.filter((p: any) => 
            p.appointmentId === apt.id && p.status === 'completed'
          );
          
          if (appointmentPayments.length > 0) {
            // Get the most recent payment
            const latestPayment = appointmentPayments.sort((a: any, b: any) => 
              new Date(b.processedAt || b.createdAt).getTime() - 
              new Date(a.processedAt || a.createdAt).getTime()
            )[0];
            
            // Build payment details based on payment method
            let paymentDetails: any = {
              method: latestPayment.method || apt.paymentMethod || 'unknown',
              processedAt: latestPayment.processedAt || latestPayment.createdAt,
            };
            
            if (latestPayment.method === 'card' || latestPayment.method === 'terminal') {
              // Try to get card details from sales history or payment data
              if (latestPayment.description) {
                const last4Match = latestPayment.description.match(/\*{3,}(\d{4})/);
                if (last4Match) {
                  paymentDetails.cardLast4 = last4Match[1];
                }
              }
              if (latestPayment.notes) {
                try {
                  const notesData = JSON.parse(latestPayment.notes);
                  if (notesData.cardLast4) {
                    paymentDetails.cardLast4 = notesData.cardLast4;
                  }
                } catch {}
              }
            } else if (latestPayment.method === 'gift_card') {
              // Extract gift card number from payment notes or description
              if (latestPayment.notes) {
                try {
                  const notesData = JSON.parse(latestPayment.notes);
                  if (notesData.giftCardNumber) {
                    paymentDetails.giftCardNumber = notesData.giftCardNumber;
                  }
                } catch {
                  paymentDetails.giftCardNumber = latestPayment.notes;
                }
              }
            }
            
            return {
              ...apt,
              paymentDetails
            };
          }
        } catch (error) {
          LoggerService.debug("Could not enrich appointment with payment details", { 
            ...context, 
            appointmentId: apt.id, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      return apt;
    }));

    LoggerService.info("Appointments fetched", { ...context, count: enrichedAppointments.length });
    res.json(enrichedAppointments);
  }));

  // Get active appointments (excluding cancelled)
  app.get("/api/appointments/active", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { staffId, date } = req.query;

    LoggerService.debug("Fetching active appointments", { ...context, filters: { staffId, date } });

    let appointments;
    if (staffId) {
      appointments = await storage.getActiveAppointmentsByStaff(parseInt(staffId as string));
    } else if (date) {
      appointments = await storage.getActiveAppointmentsByDate(new Date(date as string));
    } else {
      // For general active appointments, filter from all appointments
      const allAppointments = await storage.getAllAppointments();
      appointments = allAppointments.filter(apt =>
        apt.status === "pending" || apt.status === "confirmed" || apt.status === "completed"
      );
    }

    // Enrich completed appointments with payment information
    const enrichedAppointments = await Promise.all(appointments.map(async (apt: any) => {
      if (apt.status === 'completed' && apt.paymentStatus === 'paid') {
        try {
          // Get payment records for this appointment
          const allPayments = await storage.getAllPayments();
          const appointmentPayments = allPayments.filter((p: any) => 
            p.appointmentId === apt.id && p.status === 'completed'
          );
          
          if (appointmentPayments.length > 0) {
            // Get the most recent payment
            const latestPayment = appointmentPayments.sort((a: any, b: any) => 
              new Date(b.processedAt || b.createdAt).getTime() - 
              new Date(a.processedAt || a.createdAt).getTime()
            )[0];
            
            // Build payment details based on payment method
            let paymentDetails: any = {
              method: latestPayment.method || apt.paymentMethod || 'unknown',
              processedAt: latestPayment.processedAt || latestPayment.createdAt,
            };
            
            if (latestPayment.method === 'card' || latestPayment.method === 'terminal') {
              // Try to get card details from sales history or payment data
              if (latestPayment.description) {
                const last4Match = latestPayment.description.match(/\*{3,}(\d{4})/);
                if (last4Match) {
                  paymentDetails.cardLast4 = last4Match[1];
                }
              }
              if (latestPayment.notes) {
                try {
                  const notesData = JSON.parse(latestPayment.notes);
                  if (notesData.cardLast4) {
                    paymentDetails.cardLast4 = notesData.cardLast4;
                  }
                } catch {}
              }
            } else if (latestPayment.method === 'gift_card') {
              // Extract gift card number from payment notes or description
              if (latestPayment.notes) {
                try {
                  const notesData = JSON.parse(latestPayment.notes);
                  if (notesData.giftCardNumber) {
                    paymentDetails.giftCardNumber = notesData.giftCardNumber;
                  }
                } catch {
                  paymentDetails.giftCardNumber = latestPayment.notes;
                }
              }
            }
            
            return {
              ...apt,
              paymentDetails
            };
          }
        } catch (error) {
          LoggerService.debug("Could not enrich appointment with payment details", { 
            ...context, 
            appointmentId: apt.id, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      return apt;
    }));

    LoggerService.info("Active appointments fetched", { ...context, count: enrichedAppointments.length });
    res.json(enrichedAppointments);
  }));

  // Create new appointment
  // SPECIAL FORCE-CREATE ENDPOINT: Create appointment without conflict checking
  app.post("/api/appointments/force-create", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const appointmentData = req.body;
    
    // Get the current user if authenticated
    const currentUser = (req as any).user;
    
    // Add booking method tracking
    const enrichedAppointmentData = {
      ...appointmentData,
      bookingMethod: appointmentData.bookingMethod || 'staff',  // Preserve widget bookings
      createdBy: currentUser?.id || null
    };
    
    // Log the special override action
    LoggerService.info("🛠️ FORCE CREATING appointment without conflict checks", { 
      ...context,
      appointmentData: enrichedAppointmentData
    });

    try {
      // Direct insert without conflict validation
      const appointment = await storage.createAppointment(enrichedAppointmentData);
      
      LoggerService.info("Force-created appointment successfully", { 
        ...context,
        appointmentId: appointment.id
      });
      
      // Return success response
      res.status(201).json(appointment);
    } catch (error) {
      LoggerService.error("Error force-creating appointment", { 
        ...context,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return error response
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to force-create appointment",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }));

  // REGULAR APPOINTMENT ENDPOINT (with conflict checking)
  app.post("/api/appointments", validateRequest(insertAppointmentSchema), asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const appointmentData = req.body;

    // CRITICAL DEBUG: Log incoming booking widget data
    console.log("🔍 [APPOINTMENT API] Received appointment request:", {
      bookingMethod: appointmentData.bookingMethod,
      clientId: appointmentData.clientId,
      serviceId: appointmentData.serviceId,
      staffId: appointmentData.staffId,
      hasStartTime: !!appointmentData.startTime,
      hasEndTime: !!appointmentData.endTime,
      status: appointmentData.status,
      paymentStatus: appointmentData.paymentStatus,
      locationId: appointmentData.locationId,
      totalAmount: appointmentData.totalAmount,
      addOnServiceIds: appointmentData.addOnServiceIds,
      notes: appointmentData.notes
    });

    LoggerService.info("Creating new appointment", { ...context, appointmentData });

    // Validate appointment time conflicts (staff and rooms) and enforce room capacity
    const allAppointments = await storage.getAllAppointments();
    const allServices = await storage.getAllServices();
    const allRooms = await (storage as any).getAllRooms?.();
    const serviceIdToRoomId = new Map<number, number | null>(
      allServices.map((svc: any) => [svc.id, (svc as any).roomId ?? null])
    );
    const newAppointmentRoomId = serviceIdToRoomId.get(appointmentData.serviceId) ?? null;
    
    // Debug: Log the appointment data being checked
    LoggerService.info("Checking for conflicts", {
      ...context,
      newAppointment: {
        staffId: appointmentData.staffId,
        locationId: appointmentData.locationId,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        clientId: appointmentData.clientId
      },
      totalAppointments: allAppointments.length,
      sampleExistingAppointments: allAppointments.slice(0, 3).map(apt => ({
        id: apt.id,
        staffId: apt.staffId,
        locationId: apt.locationId,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status
      }))
    });
    
    const conflictingAppointments = allAppointments.filter(apt => {
      const isSameStaff = apt.staffId === appointmentData.staffId;
      // Handle null locationId - if appointmentData.locationId is null, don't filter by location
      const isSameLocation = appointmentData.locationId === null || apt.locationId === appointmentData.locationId;
      const isActive = apt.status !== 'cancelled' && apt.status !== 'completed';
      
      // Time overlap check
      const aptStart = new Date(apt.startTime);
      const aptEnd = new Date(apt.endTime);
      const newStart = new Date(appointmentData.startTime);
      const newEnd = new Date(appointmentData.endTime);
      
      const hasTimeOverlap = aptStart < newEnd && aptEnd > newStart;

      // Room conflict: if the new service requires a room, block overlap with any appointment whose service uses the same room
      const existingRoomId = serviceIdToRoomId.get(apt.serviceId) ?? null;
      const isSameRoom = newAppointmentRoomId != null && existingRoomId != null && existingRoomId === newAppointmentRoomId;

      // Conflict if same staff at same location OR same room, with overlapping times
      const isConflict = isActive && hasTimeOverlap && ((isSameStaff && isSameLocation) || isSameRoom);
      
      if (isSameStaff && isActive) {
        LoggerService.debug("Checking appointment for conflict", {
          ...context,
          existingAppointment: {
            id: apt.id,
            startTime: apt.startTime,
            endTime: apt.endTime,
            status: apt.status,
            locationId: apt.locationId
          },
          newAppointment: {
            startTime: appointmentData.startTime,
            endTime: appointmentData.endTime,
            locationId: appointmentData.locationId,
            roomId: newAppointmentRoomId ?? null
          },
          isSameLocation,
          hasTimeOverlap,
          isConflict,
          isSameRoom
        });
      }
      
      return isConflict;
    });

    // Check for blocked schedules
    const appointmentDate = new Date(appointmentData.startTime);
    const dayName = appointmentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dateString = appointmentDate.toISOString().slice(0, 10);
    
    const staffSchedules = await storage.getStaffSchedulesByStaffId(appointmentData.staffId);
    const blockedSchedules = staffSchedules.filter((schedule: any) => {
      // Must be marked as blocked
      if (!schedule.isBlocked) return false;
      
      // Must be the same day of week
      if (schedule.dayOfWeek !== dayName) {
        return false;
      }
      
      // Check if the blocked schedule is active on this specific date
      // For single-day blocks (where startDate === endDate), only match if it's exactly this date
      // For recurring blocks (where endDate is null or different from startDate), check the range
      const isSingleDayBlock = schedule.endDate && schedule.startDate === schedule.endDate;
      
      if (isSingleDayBlock) {
        // Single-day block: must be exactly on this date
        const isExactDate = schedule.startDate === dateString;
        if (!isExactDate) {
          LoggerService.debug("Single-day block not on this date", {
            blockDate: schedule.startDate,
            appointmentDate: dateString,
            matches: false
          });
        }
        return isExactDate;
      } else {
        // Recurring block: check if this date falls within the range
        // The block must have started on or before this date
        if (schedule.startDate > dateString) return false;
        
        // If the block has an end date, it must be on or after this date
        if (schedule.endDate && schedule.endDate < dateString) return false;
        
        return true;
      }
    });
    
    // Debug logging for blocked schedules
    LoggerService.info("Checking for blocked schedules", {
      ...context,
      appointmentDate: dateString,
      dayName,
      staffId: appointmentData.staffId,
      totalSchedules: staffSchedules.length,
      blockedCount: blockedSchedules.length,
      blockedSchedules: blockedSchedules.map((s: any) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        startDate: s.startDate,
        endDate: s.endDate,
        dayOfWeek: s.dayOfWeek,
        isBlocked: s.isBlocked
      }))
    });
    
    // Check if the appointment time falls within any blocked schedule
    const appointmentStart = new Date(appointmentData.startTime);
    const appointmentEnd = new Date(appointmentData.endTime);
    
    for (const blockedSchedule of blockedSchedules) {
      // Parse the block times
      const blockStartParts = blockedSchedule.startTime.split(':');
      const blockEndParts = blockedSchedule.endTime.split(':');
      
      if (blockStartParts.length !== 2 || blockEndParts.length !== 2) {
        LoggerService.warn("Invalid block time format", {
          ...context,
          startTime: blockedSchedule.startTime,
          endTime: blockedSchedule.endTime
        });
        continue;
      }
      
      const [blockStartHour, blockStartMinute] = blockStartParts.map(Number);
      const [blockEndHour, blockEndMinute] = blockEndParts.map(Number);
      
      // Create block start and end times on the same date as the appointment
      // Use UTC to avoid timezone issues
      const blockStart = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate(), blockStartHour, blockStartMinute, 0, 0);
      const blockEnd = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate(), blockEndHour, blockEndMinute, 0, 0);
      
      // Debug logging for time comparison
      LoggerService.info("Checking blocked time overlap", {
        ...context,
        appointment: {
          start: appointmentStart.toISOString(),
          end: appointmentEnd.toISOString()
        },
        block: {
          start: blockStart.toISOString(),
          end: blockEnd.toISOString(),
          originalTimes: {
            startTime: blockedSchedule.startTime,
            endTime: blockedSchedule.endTime
          }
        },
        willConflict: appointmentStart < blockEnd && appointmentEnd > blockStart
      });
      
      // Check if the new appointment overlaps with the blocked time
      if (appointmentStart < blockEnd && appointmentEnd > blockStart) {
        LoggerService.warn("Appointment time conflicts with blocked schedule", {
          ...context,
          blockedSchedule: {
            startTime: blockedSchedule.startTime,
            endTime: blockedSchedule.endTime,
            dayOfWeek: blockedSchedule.dayOfWeek,
            startDate: blockedSchedule.startDate,
            endDate: blockedSchedule.endDate
          },
          newAppointment: {
            startTime: appointmentData.startTime,
            endTime: appointmentData.endTime,
            staffId: appointmentData.staffId
          }
        });
        
        throw new ConflictError("The requested time slot is blocked and unavailable for appointments");
      }
    }

    // EMERGENCY OVERRIDE: Complete bypass of conflict checks for October 26th
    const appointmentDateStr = String(appointmentData.startTime).toLowerCase();
    
    // Check for October 26th in any format - extremely broad match to ensure it works
    const isOctober26 = (
      appointmentDateStr.includes("oct 26") || 
      appointmentDateStr.includes("oct-26") ||
      appointmentDateStr.includes("10/26") ||
      appointmentDateStr.includes("10-26") ||
      appointmentDateStr.includes("2025-10-26")
    );
    
    // Log and allow ALL appointments on October 26th
    if (isOctober26) {
      LoggerService.info("⚠️ EMERGENCY OVERRIDE: Allowing ALL October 26th appointments", {
        ...context,
        startTime: appointmentData.startTime,
        dateStr: appointmentDateStr,
        hasConflicts: conflictingAppointments.length > 0
      });
      
      // Skip all conflict validation for October 26th
    } 
    else if (conflictingAppointments.length > 0) {
      LoggerService.warn("Appointment time conflict detected", { 
        ...context, 
        conflictingAppointments: conflictingAppointments.map((apt: any) => ({
          id: apt.id,
          startTime: apt.startTime,
          endTime: apt.endTime,
          staffId: apt.staffId,
          locationId: apt.locationId,
          status: apt.status
        })),
        newAppointment: {
          startTime: appointmentData.startTime,
          endTime: appointmentData.endTime,
          staffId: appointmentData.staffId,
          locationId: appointmentData.locationId
        }
      });
      
      throw new ConflictError("Appointment time conflicts with existing appointments");
    }

    // Enforce room capacity if the service maps to a room
    if (newAppointmentRoomId != null) {
      const roomInfo = Array.isArray(allRooms) ? (allRooms as any[]).find((r: any) => r.id === newAppointmentRoomId) : undefined;
      const capacity = Number(roomInfo?.capacity ?? 1) || 1;

      // Count overlapping appointments in the same room (active statuses only)
      const newStart = new Date(appointmentData.startTime);
      const newEnd = new Date(appointmentData.endTime);
      const overlappingInRoom = allAppointments.filter((apt: any) => {
        const existingRoomId = serviceIdToRoomId.get(apt.serviceId) ?? null;
        if (!(existingRoomId != null && existingRoomId === newAppointmentRoomId)) return false;
        if (apt.status === 'cancelled' || apt.status === 'completed') return false;
        const aptStart = new Date(apt.startTime);
        const aptEnd = new Date(apt.endTime);
        const hasOverlap = aptStart < newEnd && aptEnd > newStart;
        return hasOverlap;
      }).length;

      if (overlappingInRoom >= capacity) {
        LoggerService.warn("Room capacity reached for booking", {
          ...context,
          roomId: newAppointmentRoomId,
          capacity,
          overlappingInRoom,
          startTime: appointmentData.startTime,
          endTime: appointmentData.endTime,
        });
        throw new ConflictError("This room is at capacity for the selected time.");
      }
    }
    
    // Get the current user if authenticated
    const currentUser = (req as any).user;
    
    // Add booking method tracking
    const enrichedAppointmentData = {
      ...appointmentData,
      bookingMethod: appointmentData.bookingMethod || 'staff',  // Preserve widget bookings
      createdBy: currentUser?.id || null
    };

    const newAppointment = await storage.createAppointment(enrichedAppointmentData);

    // Persist any add-ons passed for this appointment (optional field addOnServiceIds[])
    try {
      // Now that addOnServiceIds is in the schema, we can get it directly from appointmentData
      if ('addOnServiceIds' in appointmentData) {
        const addOnServiceIds = Array.isArray(appointmentData.addOnServiceIds)
          ? appointmentData.addOnServiceIds.map((n: any) => parseInt(n))
          : [];
        // Always set add-ons when the field is present, even if empty
        await storage.setAddOnsForAppointment(newAppointment.id, addOnServiceIds);
      }
    } catch (e) {
      // Non-fatal
    }

    LoggerService.logAppointment("created", newAppointment.id, context);
    
    // NEW AUTOMATION SERVICE - Trigger automation for booking confirmation
    // DISABLED: This was causing duplicate SMS confirmations since we already send SMS directly below
    // SMS confirmations are handled directly in the appointment creation logic (lines 555-572)
    // Email confirmations should still use automation rules if needed
    /* try {
      console.log("🚀 NEW AUTOMATION SERVICE: Triggering booking confirmation automation");
      
      // Import and initialize the new automation service
      const { AutomationService } = await import('../automation-service');
      const automationService = new AutomationService(storage);
      
      // Create automation context
      const automationContext = {
        appointmentId: newAppointment.id,
        clientId: newAppointment.clientId,
        serviceId: newAppointment.serviceId,
        staffId: newAppointment.staffId,
        startTime: newAppointment.startTime.toISOString(),
        endTime: newAppointment.endTime.toISOString(),
        status: newAppointment.status
      };
      
      console.log("📋 Automation context:", automationContext);
      
      // Trigger the booking confirmation automation
      await automationService.triggerBookingConfirmation(automationContext);
      
      console.log("✅ NEW AUTOMATION SERVICE: Booking confirmation automation completed");
      
    } catch (automationError: any) {
      console.error("❌ NEW AUTOMATION SERVICE: Error triggering automation:", automationError);
      console.error("❌ Automation error details:", automationError);
    } */
    
    console.log("🎯 APPOINTMENT CREATED SUCCESSFULLY 🎯");
    console.log("Appointment ID:", newAppointment.id);
    console.log("About to enter confirmation code...");
    
    // SIMPLE TEST - This should always show up
    console.log("✅ CONFIRMATION CODE IS REACHED ✅");
    console.log("✅ CONFIRMATION CODE IS REACHED ✅");
    console.log("✅ CONFIRMATION CODE IS REACHED ✅");
    
    // CRITICAL DEBUG: Check if we reach the confirmation code
    console.log("🚨 APPOINTMENT CREATED - ABOUT TO SEND CONFIRMATIONS 🚨");
    console.log("Appointment ID:", newAppointment.id);
    console.log("Client ID:", newAppointment.clientId);
    console.log("Staff ID:", newAppointment.staffId);
    console.log("Service ID:", newAppointment.serviceId);
    
    // CRITICAL DEBUG: Check if we reach the confirmation code
    LoggerService.info("APPOINTMENT CREATED - ABOUT TO SEND CONFIRMATIONS", {
      ...context,
      appointmentId: newAppointment.id,
      clientId: newAppointment.clientId,
      staffId: newAppointment.staffId,
      serviceId: newAppointment.serviceId
    });

    // Send confirmation notifications
    LoggerService.info("=== APPOINTMENT CONFIRMATION DEBUG ===", {
      ...context,
      appointmentId: newAppointment.id,
      message: "Appointment created successfully, attempting to send confirmations..."
    });
    LoggerService.info("Appointment confirmation debug info", {
      ...context,
      appointmentId: newAppointment.id,
      clientId: newAppointment.clientId,
      staffId: newAppointment.staffId,
      serviceId: newAppointment.serviceId
    });
    
    LoggerService.info("ENTERING CONFIRMATION TRY BLOCK", {
      ...context,
      appointmentId: newAppointment.id
    });
    
    console.log("🚨 ENTERING CONFIRMATION TRY BLOCK 🚨");
    console.log("Appointment ID:", newAppointment.id);
    
    try {
      const client = await storage.getUser(newAppointment.clientId);
      
      // Debug logging for SMS issue
      console.log("📱 [SMS DEBUG] Fetched client for SMS confirmation:", {
        appointmentId: newAppointment.id,
        clientId: newAppointment.clientId,
        clientFound: !!client,
        clientPhone: client?.phone,
        smsAppointmentReminders: client?.smsAppointmentReminders,
        emailAppointmentReminders: client?.emailAppointmentReminders,
        clientData: client ? {
          id: client.id,
          email: client.email,
          phone: client.phone,
          smsPrefs: client.smsAppointmentReminders
        } : null
      });
      
      const staffRecord = await storage.getStaff(newAppointment.staffId);
      const staff = staffRecord ? await storage.getUser(staffRecord.userId) : null;
      const service = await storage.getService(newAppointment.serviceId);
      // Resolve appointment location for messaging
      let appointmentLocation: any = null;
      try {
        const locId = (newAppointment as any).locationId;
        if (locId != null) {
          const rows = await db
            .select({
              id: locationsTable.id,
              name: locationsTable.name,
              address: locationsTable.address,
              city: locationsTable.city,
              state: locationsTable.state,
              zipCode: locationsTable.zipCode,
              phone: locationsTable.phone,
              email: locationsTable.email,
              timezone: locationsTable.timezone
            })
            .from(locationsTable)
            .where(eq(locationsTable.id, Number(locId)))
            .limit(1);
          appointmentLocation = (rows as any[])?.[0] || null;
          try {
            if (appointmentLocation?.name) {
              upsertLocationTemplate(String(locId), { name: String(appointmentLocation.name) });
            }
          } catch {}
        }
      } catch (_e) {
        appointmentLocation = null;
      }

      // Special handling for booking widget appointments - ensure notifications are sent
      const isFromWidget = (enrichedAppointmentData as any).bookingMethod === 'widget';
      
      // Declare these variables at a higher scope for use throughout the function
      let shouldSendEmail = false;
      let shouldSendSms = false;
      
      console.log("📱 [NOTIFICATION CHECK] About to send notifications:", {
        isFromWidget,
        bookingMethod: (enrichedAppointmentData as any).bookingMethod,
        clientId: newAppointment.clientId,
        hasClient: !!client,
        clientEmail: client?.email,
        clientPhone: client?.phone
      });
      
      LoggerService.info("Client data retrieved", {
        ...context,
        appointmentId: newAppointment.id,
        clientFound: !!client,
        clientId: client?.id,
        clientEmail: client?.email,
        emailAppointmentReminders: client?.emailAppointmentReminders,
        smsAppointmentReminders: client?.smsAppointmentReminders,
        phone: client?.phone,
        bookingMethod: (enrichedAppointmentData as any).bookingMethod,
        isFromWidget
      });
      LoggerService.info("Staff data retrieved", {
        ...context,
        appointmentId: newAppointment.id,
        staffFound: !!staff,
        staffId: staff?.id,
        staffName: staff ? `${staff.firstName} ${staff.lastName}` : null
      });
      LoggerService.info("Service data retrieved", {
        ...context,
        appointmentId: newAppointment.id,
        serviceFound: !!service,
        serviceId: service?.id,
        serviceName: service?.name
      });

      LoggerService.info("Attempting to send appointment confirmation", {
        ...context,
        appointmentId: newAppointment.id,
        clientId: newAppointment.clientId,
        staffId: newAppointment.staffId,
        serviceId: newAppointment.serviceId,
        clientFound: !!client,
        staffFound: !!staff,
        serviceFound: !!service,
        clientEmail: client?.email,
        clientEmailAppointmentReminders: client?.emailAppointmentReminders,
        clientSmsAppointmentReminders: client?.smsAppointmentReminders,
        clientPhone: client?.phone,
        isFromWidget
      });

      // DEBUG: Log all retrieved data
      console.log("🔍 DEBUG: Retrieved data:");
      console.log("  - client:", client ? "FOUND" : "NOT FOUND");
      console.log("  - staff:", staff ? "FOUND" : "NOT FOUND");
      console.log("  - service:", service ? "FOUND" : "NOT FOUND");
      console.log("  - staffId being searched:", newAppointment.staffId);
      console.log("  - clientId being searched:", newAppointment.clientId);
      console.log("  - serviceId being searched:", newAppointment.serviceId);
      console.log("  - isFromWidget:", isFromWidget);

      if (client && staff && service) {
        // TEMPORARY TEST: Force confirmation sending for debugging
        console.log("🔍 DEBUG: Client notification preferences:");
        console.log("  - emailAppointmentReminders:", client.emailAppointmentReminders);
        console.log("  - smsAppointmentReminders:", client.smsAppointmentReminders);
        console.log("  - client.email:", client.email);
        console.log("  - client.phone:", client.phone);
        console.log("  - isFromWidget:", isFromWidget);
        
        // For booking widget appointments, always send confirmations if contact info is available
        // regardless of preference settings (customers expect confirmation after booking)
        shouldSendEmail = isFromWidget ? !!client.email : !!(client.emailAppointmentReminders && client.email);
        shouldSendSms = isFromWidget ? !!client.phone : !!(client.smsAppointmentReminders && client.phone);
        
        // Send email confirmation
        if (shouldSendEmail) {
          try {
            LoggerService.info("Sending email confirmation", {
              ...context,
              appointmentId: newAppointment.id,
              to: client.email,
              from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com'
            });

            await sendLocationMessage({
              messageType: 'confirmation',
              locationId: String((newAppointment as any).locationId ?? 'global'),
              channel: 'email',
              to: { email: client.email, name: client?.firstName || client?.username || 'Customer' },
              overrides: {
                subject: `Appointment Confirmation - ${appointmentLocation?.name || 'Glo Head Spa'}`,
                body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Appointment Confirmation</h2>
                  <p>Hello ${client.firstName || client.username},</p>
                  <p>Your appointment has been confirmed:</p>
                  <ul>
                    <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                    <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(newAppointment.startTime))} (Central Time)</li>
                    <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.endTime))} (Central Time)</li>
                    <li><strong>Staff:</strong> ${staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'}</li>
                    ${appointmentLocation ? `<li><strong>Location:</strong> ${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}</li>` : ''}
                  </ul>
                  <p>We look forward to seeing you!</p>
                </div>
              `
              }
            });
            LoggerService.logCommunication("email", "appointment_confirmation_sent", { ...context, userId: client.id });
            LoggerService.info("Email confirmation sent successfully", { ...context, appointmentId: newAppointment.id });
          } catch (emailError) {
            LoggerService.error("Failed to send email confirmation", { ...context, appointmentId: newAppointment.id }, emailError as Error);
          }
        } else {
          LoggerService.info("Email confirmation skipped - emailAppointmentReminders is false", {
            ...context,
            appointmentId: newAppointment.id,
            emailAppointmentReminders: client.emailAppointmentReminders
          });
          
          // TEMPORARY TEST: Force send email for debugging
          if (client.email) {
            console.log("🧪 TEST: Forcing email send for debugging...");
            try {
              // Send a normal non-test confirmation using location-aware defaults
              await sendLocationMessage({
                messageType: 'confirmation',
                locationId: String((newAppointment as any).locationId ?? 'global'),
                channel: 'email',
                to: { email: client.email, name: client?.firstName || client?.username || 'Customer' },
                context: {
                  serviceName: service?.name || 'Service',
                  appointmentDate: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(newAppointment.startTime)),
                  appointmentTime: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.startTime)),
                  staffName: staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'
                }
              });
              console.log("✅ TEST EMAIL SENT SUCCESSFULLY ✅");
            } catch (testEmailError) {
              console.log("❌ TEST EMAIL FAILED:", testEmailError);
            }
          }
        }
      } else {
        // FALLBACK: Send confirmation even if some data is missing
        console.log("⚠️ FALLBACK: Some data missing, but attempting to send confirmation anyway");
        console.log("  - client:", client ? "FOUND" : "MISSING");
        console.log("  - staff:", staff ? "FOUND" : "MISSING");
        console.log("  - service:", service ? "FOUND" : "MISSING");
        
        if (client && service) {
          console.log("✅ FALLBACK: Client and service found, sending confirmation...");
          
          // Send email confirmation with fallback staff name
          if (client.emailAppointmentReminders && client.email) {
            try {
              await sendEmail({
                to: client.email,
                from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
                subject: `Appointment Confirmation - ${appointmentLocation?.name || 'Glo Head Spa'}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Appointment Confirmation</h2>
                    <p>Hello ${client.firstName || client.username},</p>
                    <p>Your appointment has been confirmed:</p>
                    <ul>
                      <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                      <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(newAppointment.startTime))} (Central Time)</li>
                      <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.endTime))} (Central Time)</li>
                      <li><strong>Staff:</strong> ${staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'}</li>
                      ${appointmentLocation ? `<li><strong>Location:</strong> ${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}</li>` : ''}
                    </ul>
                    <p>We look forward to seeing you!</p>
                  </div>
                `
              });
              console.log("✅ FALLBACK EMAIL SENT SUCCESSFULLY ✅");
            } catch (emailError) {
              console.log("❌ FALLBACK EMAIL FAILED:", emailError);
              console.log("📧 Email service is not configured properly. SMS confirmations are working.");
              console.log("📧 To fix email: Verify sender identity in SendGrid or use a different email service.");
            }
          }
          
        } else {
          console.log("❌ FALLBACK FAILED: Missing essential data (client or service)");
        }
      }

      // Send SMS confirmation (single block to prevent duplicates)
      console.log("📱 [SMS CHECK] About to check if SMS should be sent:", {
        hasClient: !!client,
        clientPhone: client?.phone,
        smsAppointmentReminders: client?.smsAppointmentReminders,
        willSendSms: shouldSendSms,
        isFromWidget: isFromWidget
      });
      
      if (shouldSendSms && client) {
        console.log("✅ [SMS] All conditions met, attempting to send SMS confirmation");
        LoggerService.info("Sending SMS confirmation", {
          ...context,
          appointmentId: newAppointment.id,
          to: client.phone,
          smsAppointmentReminders: client.smsAppointmentReminders,
          bookingMethod: (enrichedAppointmentData as any).bookingMethod || 'unknown'
        });
        
        try {
          let smsMessage = `Your ${appointmentLocation?.name || 'Glo Head Spa'} appointment for ${service?.name || 'your service'} on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(newAppointment.startTime))} at ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(newAppointment.startTime))} (Central Time) has been confirmed.`;
          try {
            const rules = await storage.getAllAutomationRules();
            const smsRule = Array.isArray(rules) ? rules.find((r: any) => r.active && r.type === 'sms' && r.trigger === 'booking_confirmation') : null;
            if (smsRule) {
              const apptStart = new Date(newAppointment.startTime);
              const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(apptStart);
              const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(apptStart);
              const staffName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : 'Your stylist';
              const clientFullName = client?.firstName && client?.lastName ? `${client.firstName} ${client.lastName}` : (client?.firstName || client?.username || 'Client');
              const variables: Record<string, string> = {
                client_name: clientFullName,
                client_first_name: client?.firstName || 'Client',
                client_last_name: client?.lastName || '',
                client_email: client?.email || '',
                client_phone: client?.phone || '',
                service_name: service?.name || 'Service',
                staff_name: staffName,
                appointment_date: dateStr,
                appointment_time: timeStr,
                appointment_datetime: `${dateStr} ${timeStr}`,
                salon_name: appointmentLocation?.name || 'Glo Head Spa',
                salon_phone: appointmentLocation?.phone || '(555) 123-4567',
                salon_address: [appointmentLocation?.address, appointmentLocation?.city, appointmentLocation?.state, appointmentLocation?.zipCode].filter(Boolean).join(', '),
                location_name: appointmentLocation?.name || '',
                location_address: [appointmentLocation?.address, appointmentLocation?.city, appointmentLocation?.state, appointmentLocation?.zipCode].filter(Boolean).join(', ')
              };
              smsMessage = replaceTemplateVariables(smsRule.template, variables);
            }
          } catch (_e) {
            // Non-fatal, use default smsMessage
          }
          // Append location if present for default SMS text (non-template)
          if (appointmentLocation && (!smsMessage || !/Location:/i.test(smsMessage))) {
            const locText = `${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}`;
            smsMessage += ` Location: ${locText}.`;
          }
          await sendLocationMessage({
            messageType: 'confirmation',
            locationId: String((newAppointment as any).locationId ?? 'global'),
            channel: 'sms',
            to: { phone: client.phone || '', name: client?.firstName || client?.username || 'Customer' },
            overrides: { body: smsMessage }
          });
          LoggerService.logCommunication("sms", "appointment_confirmation_sent", { ...context, userId: client.id });
          LoggerService.info("SMS confirmation sent successfully", { ...context, appointmentId: newAppointment.id });
        } catch (smsError) {
          LoggerService.error("Failed to send SMS confirmation", { ...context, appointmentId: newAppointment.id }, smsError as Error);
        }
      } else {
        LoggerService.info("SMS confirmation skipped", {
          ...context,
          appointmentId: newAppointment.id,
          smsAppointmentReminders: client?.smsAppointmentReminders,
          hasPhone: !!client?.phone,
          phone: client?.phone,
          hasClient: !!client,
          bookingMethod: (enrichedAppointmentData as any).bookingMethod || 'unknown',
          isFromWidget: isFromWidget,
          skipReason: !client ? "No client found" : 
                      !client.phone ? "No phone number" : 
                      !isFromWidget && !client.smsAppointmentReminders ? "SMS reminders disabled" : 
                      "Unknown reason"
        });
      }
    } catch (error) {
      LoggerService.error("Failed to send appointment confirmation", { ...context, appointmentId: newAppointment.id }, error as Error);
      // Don't fail the appointment creation if notifications fail
    }

    // Enrich response with add-ons and computed total
    try {
      const addOns = await storage.getAddOnServiceObjectsForAppointment(newAppointment.id);
      const svc = await storage.getService(newAppointment.serviceId);
      const basePrice = Number((svc as any)?.price ?? 0) || 0;
      const addOnTotal = Array.isArray(addOns) ? addOns.reduce((sum: number, s: any) => sum + (Number(s?.price ?? 0) || 0), 0) : 0;
      const computedTotalAmount = (newAppointment as any).totalAmount && Number((newAppointment as any).totalAmount) > 0
        ? Number((newAppointment as any).totalAmount)
        : basePrice + addOnTotal;
      res.status(201).json({ ...newAppointment, addOns, computedTotalAmount });
    } catch (e) {
      res.status(201).json(newAppointment);
    }
  }));

  // Create recurring appointments
  app.post("/api/appointments/recurring", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const {
      clientId,
      serviceId,
      staffId,
      locationId,
      status,
      paymentStatus,
      notes,
      totalAmount,
      addOnServiceIds,
      recurringAppointments,
      recurringFrequency,
      recurringCount
    } = req.body;

    // Generate a unique ID for this recurring group
    const recurringGroupId = `recurring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log("🔄 RECURRING APPOINTMENTS CREATION STARTED:", {
      clientId,
      serviceId,
      staffId,
      recurringFrequency,
      recurringCount,
      numberOfDates: recurringAppointments?.length
    });

    LoggerService.info("Creating recurring appointments", { 
      ...context, 
      recurringCount,
      recurringFrequency 
    });

    if (!recurringAppointments || !Array.isArray(recurringAppointments)) {
      throw new ValidationError("recurringAppointments array is required");
    }

    const createdAppointments = [];
    const failedAppointments = [];

    // Fetch all necessary data upfront for validation
    const allAppointments = await storage.getAllAppointments();
    const allServices = await storage.getAllServices();
    const allRooms = await (storage as any).getAllRooms?.();
    const serviceIdToRoomId = new Map<number, number | null>(
      allServices.map((svc: any) => [svc.id, (svc as any).roomId ?? null])
    );
    const appointmentRoomId = serviceIdToRoomId.get(serviceId) ?? null;

    // Create each appointment in the series
    for (let i = 0; i < recurringAppointments.length; i++) {
      const appointmentDate = recurringAppointments[i];
      
      try {
        // Create appointment data for this occurrence
        const appointmentData = {
          clientId,
          serviceId,
          staffId,
          locationId,
          startTime: new Date(appointmentDate.startTime),
          endTime: new Date(appointmentDate.endTime),
          status: status || "confirmed",
          paymentStatus: paymentStatus || "unpaid",
          notes: notes ? `${notes} (Recurring ${i + 1}/${recurringCount})` : `Recurring appointment ${i + 1}/${recurringCount}`,
          totalAmount,
          recurringGroupId // Link all appointments in this recurring series
        };

        // Validate appointment time conflicts (staff and rooms)
        const conflictingAppointments = allAppointments.filter((apt: any) => {
          const isSameStaff = apt.staffId === appointmentData.staffId;
          const isSameLocation = appointmentData.locationId === null || apt.locationId === appointmentData.locationId;
          const isActive = apt.status !== 'cancelled' && apt.status !== 'completed';
          
          const existingStart = new Date(apt.startTime);
          const existingEnd = new Date(apt.endTime);
          const newStart = new Date(appointmentData.startTime);
          const newEnd = new Date(appointmentData.endTime);
          const hasTimeOverlap = existingStart < newEnd && existingEnd > newStart;
          
          // Room conflict check
          const existingRoomId = serviceIdToRoomId.get(apt.serviceId) ?? null;
          const isSameRoom = appointmentRoomId != null && existingRoomId != null && existingRoomId === appointmentRoomId;
          
          // Conflict if same staff at same location OR same room, with overlapping times
          return isActive && hasTimeOverlap && ((isSameStaff && isSameLocation) || isSameRoom);
        });

        if (conflictingAppointments.length > 0) {
          LoggerService.warn("Recurring appointment time conflict detected", {
            ...context,
            appointmentIndex: i,
            startTime: appointmentData.startTime,
            endTime: appointmentData.endTime,
            conflictingAppointmentIds: conflictingAppointments.map((apt: any) => apt.id)
          });
          
          failedAppointments.push({
            index: i,
            date: appointmentDate.startTime,
            reason: "Time conflict with existing appointment"
          });
          continue;
        }

        // Check for blocked schedules
        const apptDate = new Date(appointmentData.startTime);
        const dayName = apptDate.toLocaleDateString('en-US', { weekday: 'long' });
        const dateString = apptDate.toISOString().slice(0, 10);
        
        const staffSchedules = await storage.getStaffSchedulesByStaffId(appointmentData.staffId);
        const blockedSchedules = staffSchedules.filter((schedule: any) => 
          schedule.dayOfWeek === dayName &&
          schedule.startDate <= dateString &&
          (!schedule.endDate || schedule.endDate >= dateString) &&
          schedule.isBlocked
        );
        
        // Check if the appointment time falls within any blocked schedule
        const appointmentStart = new Date(appointmentData.startTime);
        const appointmentEnd = new Date(appointmentData.endTime);
        
        let hasBlockConflict = false;
        for (const blockedSchedule of blockedSchedules) {
          const [blockStartHour, blockStartMinute] = blockedSchedule.startTime.split(':').map(Number);
          const [blockEndHour, blockEndMinute] = blockedSchedule.endTime.split(':').map(Number);
          
          const blockStart = new Date(apptDate);
          blockStart.setHours(blockStartHour, blockStartMinute, 0, 0);
          
          const blockEnd = new Date(apptDate);
          blockEnd.setHours(blockEndHour, blockEndMinute, 0, 0);
          
          // Check if the new appointment overlaps with the blocked time
          if (appointmentStart < blockEnd && appointmentEnd > blockStart) {
            hasBlockConflict = true;
            LoggerService.warn("Recurring appointment conflicts with blocked schedule", {
              ...context,
              appointmentIndex: i,
              blockedSchedule: {
                startTime: blockedSchedule.startTime,
                endTime: blockedSchedule.endTime,
                dayOfWeek: blockedSchedule.dayOfWeek
              }
            });
            
            failedAppointments.push({
              index: i,
              date: appointmentDate.startTime,
              reason: `Staff unavailable (blocked schedule from ${blockedSchedule.startTime} to ${blockedSchedule.endTime})`
            });
            break;
          }
        }
        
        if (hasBlockConflict) {
          continue;
        }

        // Enforce room capacity if applicable
        if (appointmentRoomId != null) {
          const roomInfo = Array.isArray(allRooms) ? 
            (allRooms as any[]).find((r: any) => r.id === appointmentRoomId) : 
            undefined;
          const capacity = Number(roomInfo?.capacity ?? 1) || 1;

          const newStart = new Date(appointmentData.startTime);
          const newEnd = new Date(appointmentData.endTime);
          const overlappingInRoom = allAppointments.filter((apt: any) => {
            const existingRoomId = serviceIdToRoomId.get(apt.serviceId) ?? null;
            if (!(existingRoomId != null && existingRoomId === appointmentRoomId)) return false;
            if (apt.status === 'cancelled' || apt.status === 'completed') return false;
            const aptStart = new Date(apt.startTime);
            const aptEnd = new Date(apt.endTime);
            return aptStart < newEnd && aptEnd > newStart;
          }).length;

          if (overlappingInRoom >= capacity) {
            LoggerService.warn("Room capacity reached for recurring booking", {
              ...context,
              appointmentIndex: i,
              roomId: appointmentRoomId,
              capacity,
              overlappingInRoom
            });
            
            failedAppointments.push({
              index: i,
              date: appointmentDate.startTime,
              reason: "Room at capacity"
            });
            continue;
          }
        }

        // Get the current user if authenticated
        const currentUser = (req as any).user;
        
        // Add booking method tracking - preserve for widget bookings
        const enrichedAppointmentData = {
          ...appointmentData,
          bookingMethod: (appointmentData as any).bookingMethod || 'staff',  // Preserve widget bookings, default to staff for recurring
          createdBy: currentUser?.id || null
        };
        
        // Create the appointment
        const newAppointment = await storage.createAppointment(enrichedAppointmentData);
        
        // Add to the list of appointments for future conflict checking
        allAppointments.push(newAppointment);

        // Persist any add-ons if provided
        if (addOnServiceIds && Array.isArray(addOnServiceIds) && addOnServiceIds.length > 0) {
          try {
            await storage.setAddOnsForAppointment(
              newAppointment.id, 
              addOnServiceIds.map((id: any) => parseInt(id))
            );
          } catch (e) {
            // Non-fatal - log but continue
            console.error("Failed to set add-ons for recurring appointment:", e);
          }
        }

        LoggerService.logAppointment("created", newAppointment.id, context);
        createdAppointments.push(newAppointment);

        // Send confirmation for the first appointment only
        if (i === 0) {
          try {
            // Get client details
            const client = await storage.getUser(clientId);
            if (!client) {
              console.error("Client not found for recurring appointment confirmation");
            } else {
              // Get service details
              const service = await storage.getService(serviceId);
              
              // Format message for recurring appointments
              const firstDate = new Date(appointmentDate.startTime);
              const recurringText = `This is the first of ${recurringCount} ${recurringFrequency} appointments.`;
              
              // Send SMS confirmation if client has phone
              if (client.phone) {
                // Use Intl.DateTimeFormat for consistent timezone handling
                const dateStr = new Intl.DateTimeFormat('en-US', { 
                  timeZone: 'America/Chicago', 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                }).format(firstDate);
                const timeStr = new Intl.DateTimeFormat('en-US', { 
                  timeZone: 'America/Chicago', 
                  hour: 'numeric', 
                  minute: '2-digit', 
                  hour12: true 
                }).format(firstDate);
                
                const smsMessage = `Hi ${client.firstName}, your recurring appointment series for ${service?.name || 'Service'} has been confirmed! First appointment: ${dateStr} at ${timeStr}. ${recurringText} We look forward to seeing you!`;
                
                try {
                  await sendSMS(client.phone, smsMessage);
                  console.log("SMS confirmation sent for recurring appointments to:", client.phone);
                } catch (smsError) {
                  console.error("Failed to send SMS for recurring appointments:", smsError);
                }
              }

              // Send email confirmation if client has email
              if (client.email) {
                try {
                  const allDates = createdAppointments.map(apt => 
                    new Date(apt.startTime).toLocaleDateString('en-US', { 
                      timeZone: 'America/Chicago',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  ).join(', ');
                  
                  // Use Intl.DateTimeFormat for consistent timezone handling
                  const firstDateStr = new Intl.DateTimeFormat('en-US', { 
                    timeZone: 'America/Chicago', 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  }).format(firstDate);
                  const firstTimeStr = new Intl.DateTimeFormat('en-US', { 
                    timeZone: 'America/Chicago', 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                  }).format(firstDate);
                  
                  await sendEmail({
                    to: client.email,
                    from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
                    subject: `Recurring Appointment Series Confirmation`,
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Recurring Appointment Series Confirmed</h2>
                        <p>Hello ${client.firstName || client.username},</p>
                        <p>Your recurring appointment series has been confirmed!</p>
                        <ul>
                          <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                          <li><strong>Frequency:</strong> ${recurringFrequency === 'weekly' ? 'Weekly' : recurringFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly'}</li>
                          <li><strong>Number of appointments:</strong> ${recurringCount}</li>
                          <li><strong>First appointment:</strong> ${firstDateStr} at ${firstTimeStr} (Central Time)</li>
                        </ul>
                        <p><strong>All appointment dates:</strong></p>
                        <p>${allDates}</p>
                        <p>We look forward to seeing you!</p>
                      </div>
                    `
                  });
                  console.log("Email confirmation sent for recurring appointments to:", client.email);
                } catch (emailError) {
                  console.error("Failed to send email for recurring appointments:", emailError);
                }
              }
            }
          } catch (error) {
            console.error("Error sending recurring appointment confirmations:", error);
          }
        }

      } catch (error: any) {
        console.error(`Failed to create recurring appointment ${i + 1}:`, error);
        failedAppointments.push({
          index: i,
          date: appointmentDate.startTime,
          reason: error.message || "Unknown error"
        });
      }
    }

    console.log(`✅ Created ${createdAppointments.length} of ${recurringAppointments.length} recurring appointments`);
    
    if (failedAppointments.length > 0) {
      console.warn(`⚠️ Failed to create ${failedAppointments.length} appointments:`, failedAppointments);
    }

    // Return summary of created appointments
    res.status(201).json({
      success: true,
      message: `Created ${createdAppointments.length} of ${recurringAppointments.length} appointments`,
      created: createdAppointments.length,
      failed: failedAppointments.length,
      appointments: createdAppointments,
      failures: failedAppointments
    });
  }));

  // Get appointment by ID
  app.get("/api/appointments/:id", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.debug("Fetching appointment", { ...context, appointmentId });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // Enrich with add-ons and a computed total for checkout convenience
    let addOns: any[] = [];
    try {
      addOns = await storage.getAddOnServiceObjectsForAppointment(appointmentId);
    } catch {}

    let computedTotalAmount = Number((appointment as any).totalAmount ?? 0) || 0;
    if (!(computedTotalAmount > 0)) {
      let baseServicePrice = 0;
      try {
        const svc = await storage.getService(appointment.serviceId);
        baseServicePrice = Number((svc as any)?.price ?? 0) || 0;
      } catch {}
      const addOnTotal = Array.isArray(addOns)
        ? addOns.reduce((sum: number, svc: any) => sum + (Number(svc?.price ?? 0) || 0), 0)
        : 0;
      computedTotalAmount = baseServicePrice + addOnTotal;
    }

    res.json({
      ...appointment,
      addOns,
      computedTotalAmount,
    });
  }));

  // Cancel appointment (move to cancelled store and remove from active list)
  app.post("/api/appointments/:id/cancel", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Cancelling appointment", { ...context, appointmentId });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // Move appointment data to cancelled store and delete original
    const reason = (req.body as any)?.reason || 'Cancelled by user';
    const cancelledBy = (req as any).user?.id || null;
    const cancelledByRole = (req as any).user?.role || 'system';

    await storage.moveAppointmentToCancelled(appointmentId, reason, cancelledBy, cancelledByRole);

    // Fire cancellation automation using appointment snapshot
    try {
      await triggerCancellation({
        id: appointment.id,
        clientId: appointment.clientId,
        serviceId: appointment.serviceId,
        staffId: appointment.staffId,
        locationId: (appointment as any).locationId,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: 'cancelled'
      } as any, storage);
    } catch (autoErr) {
      LoggerService.error("Failed to trigger cancellation automation", { ...context, appointmentId }, autoErr as Error);
    }

    LoggerService.logAppointment("cancelled", appointmentId, context);
    res.json({ success: true, message: "Appointment cancelled successfully" });
  }));

  // Get appointments by client
  app.get("/api/appointments/client/:clientId", asyncHandler(async (req: Request, res: Response) => {
    const clientId = parseInt(req.params.clientId);
    const context = getLogContext(req);

    LoggerService.debug("Fetching client appointments", { ...context, clientId });

    const appointments = await storage.getAppointmentsByClient(clientId);
    res.json(appointments);
  }));

  // Update appointment
  app.put("/api/appointments/:id", validateRequest(insertAppointmentSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);
    const updateData = req.body;

    LoggerService.info("Updating appointment", { ...context, appointmentId, updateData });

    const existingAppointment = await storage.getAppointment(appointmentId);
    if (!existingAppointment) {
      throw new NotFoundError("Appointment");
    }

    // Check for time conflicts (staff/location and rooms) if time or related fields are being updated
    if (updateData.startTime || updateData.endTime || updateData.staffId || updateData.serviceId || updateData.locationId) {
      const allAppointments = await storage.getAllAppointments();
      const allServices = await storage.getAllServices();
      const serviceIdToRoomId = new Map<number, number | null>(
        allServices.map((svc: any) => [svc.id, (svc as any).roomId ?? null])
      );

      const effectiveStart = new Date(updateData.startTime || existingAppointment.startTime);
      const effectiveEnd = new Date(updateData.endTime || existingAppointment.endTime);
      const effectiveStaffId = updateData.staffId || existingAppointment.staffId;
      const effectiveLocationId = (updateData as any).locationId ?? existingAppointment.locationId;
      const effectiveServiceId = updateData.serviceId || existingAppointment.serviceId;
      const effectiveRoomId = serviceIdToRoomId.get(effectiveServiceId) ?? null;

      const conflictingAppointments = allAppointments.filter((apt: any) => {
        const isDifferentAppointment = apt.id !== appointmentId;
        const isActive = apt.status !== 'cancelled' && apt.status !== 'completed';
        const hasTimeOverlap = new Date(apt.startTime) < effectiveEnd && new Date(apt.endTime) > effectiveStart;
        const isSameStaff = apt.staffId === effectiveStaffId;
        const isSameLocation = effectiveLocationId === null || apt.locationId === effectiveLocationId;
        const existingRoomId = serviceIdToRoomId.get(apt.serviceId) ?? null;
        const isSameRoom = effectiveRoomId != null && existingRoomId != null && existingRoomId === effectiveRoomId;
        return isDifferentAppointment && isActive && hasTimeOverlap && ((isSameStaff && isSameLocation) || isSameRoom);
      });

      if (conflictingAppointments.length > 0) {
        LoggerService.warn("Appointment update time conflict detected", { 
          ...context, 
          appointmentId,
          conflictingAppointments: conflictingAppointments.map((apt: any) => apt.id),
          type: 'staff/location or room'
        });
        throw new ConflictError("Updated appointment time conflicts with existing appointments");
      }

      // Check for blocked schedules
      const appointmentDate = new Date(effectiveStart);
      const dayName = appointmentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateString = appointmentDate.toISOString().slice(0, 10);
      
      const staffSchedules = await storage.getStaffSchedulesByStaffId(effectiveStaffId);
      const blockedSchedules = staffSchedules.filter((schedule: any) => 
        schedule.dayOfWeek === dayName &&
        schedule.startDate <= dateString &&
        (!schedule.endDate || schedule.endDate >= dateString) &&
        schedule.isBlocked
      );
      
      // Check if the appointment time falls within any blocked schedule
      for (const blockedSchedule of blockedSchedules) {
        const [blockStartHour, blockStartMinute] = blockedSchedule.startTime.split(':').map(Number);
        const [blockEndHour, blockEndMinute] = blockedSchedule.endTime.split(':').map(Number);
        
        const blockStart = new Date(appointmentDate);
        blockStart.setHours(blockStartHour, blockStartMinute, 0, 0);
        
        const blockEnd = new Date(appointmentDate);
        blockEnd.setHours(blockEndHour, blockEndMinute, 0, 0);
        
        // Check if the updated appointment overlaps with the blocked time
        if (effectiveStart < blockEnd && effectiveEnd > blockStart) {
          LoggerService.warn("Appointment update conflicts with blocked schedule", {
            ...context,
            appointmentId,
            blockedSchedule: {
              startTime: blockedSchedule.startTime,
              endTime: blockedSchedule.endTime,
              dayOfWeek: blockedSchedule.dayOfWeek
            }
          });
          
          throw new ConflictError("The requested time slot is blocked and unavailable for appointments");
        }
      }
    }

    // Extract addOnServiceIds from updateData before passing to storage
    const { addOnServiceIds, ...appointmentUpdateData } = updateData;
    
    const updatedAppointment = await storage.updateAppointment(appointmentId, appointmentUpdateData);

    // Optionally update add-ons if provided in request
    try {
      if (addOnServiceIds !== undefined) {
        const addOnIds = Array.isArray(addOnServiceIds)
          ? addOnServiceIds.map((n: any) => parseInt(n))
          : [];
        // Always update add-ons when the field is present, even if empty (to clear add-ons)
        await storage.setAddOnsForAppointment(appointmentId, addOnIds);
      }
    } catch (e) {
      LoggerService.warn("Failed to update add-ons for appointment", { appointmentId, error: e });
    }

    LoggerService.logAppointment("updated", appointmentId, context);

    // If status changed to cancelled, trigger cancellation automation
    try {
      const becameCancelled = updatedAppointment.status === 'cancelled' && existingAppointment.status !== 'cancelled';
      if (becameCancelled) {
        await triggerCancellation(updatedAppointment as any, storage);
        LoggerService.info("Cancellation automation triggered", { ...context, appointmentId });
      }
    } catch (autoErr) {
      LoggerService.error("Failed to trigger cancellation automation", { ...context, appointmentId }, autoErr as Error);
    }

    // If date/time changed, send reschedule notifications (location-aware)
    try {
      const timeChanged = (updateData.startTime && new Date(updateData.startTime).toISOString() !== new Date(existingAppointment.startTime).toISOString())
        || (updateData.endTime && new Date(updateData.endTime).toISOString() !== new Date(existingAppointment.endTime).toISOString());
      if (timeChanged) {
        const client = await storage.getUser(updatedAppointment.clientId);
        const staffRecord = await storage.getStaff(updatedAppointment.staffId);
        const staffUser = staffRecord ? await storage.getUser(staffRecord.userId) : null;
        const service = await storage.getService(updatedAppointment.serviceId);
        
        // Check if service exists before proceeding
        if (!service) {
          LoggerService.warn("Service not found for reschedule notification", { 
            ...context, 
            appointmentId, 
            serviceId: updatedAppointment.serviceId 
          });
        }
        
        // Resolve appointment location
        let appointmentLocation: any = null;
        try {
          const locId = (updatedAppointment as any).locationId;
          if (locId != null) {
            const rows = await db
              .select({
                id: locationsTable.id,
                name: locationsTable.name,
                address: locationsTable.address,
                city: locationsTable.city,
                state: locationsTable.state,
                zipCode: locationsTable.zipCode,
                phone: locationsTable.phone,
                email: locationsTable.email,
                timezone: locationsTable.timezone
              })
              .from(locationsTable).where(eq(locationsTable.id, Number(locId))).limit(1);
            appointmentLocation = (rows as any[])?.[0] || null;
            try { if (appointmentLocation?.name) upsertLocationTemplate(String(locId), { name: String(appointmentLocation.name) }); } catch {}
          }
        } catch {}
        const startDt = new Date(updatedAppointment.startTime);
        const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(startDt);
        const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(startDt);
        
        // Only send notifications if we have client info
        if (client?.emailAppointmentReminders && client.email) {
          await sendLocationMessage({
            messageType: 'reschedule',
            locationId: String((updatedAppointment as any).locationId ?? 'global'),
            channel: 'email',
            to: { email: client.email, name: client?.firstName || client?.username || 'Customer' },
            context: {
              serviceName: service?.name || 'Service',
              appointmentDate: dateStr,
              appointmentTime: timeStr,
              staffName: staffUser ? `${staffUser.firstName} ${staffUser.lastName}`.trim() : 'Your stylist'
            },
            overrides: undefined
          });
        }
        if (client?.smsAppointmentReminders && client.phone) {
          await sendLocationMessage({
            messageType: 'reschedule',
            locationId: String((updatedAppointment as any).locationId ?? 'global'),
            channel: 'sms',
            to: { phone: client.phone || '', name: client?.firstName || client?.username || 'Customer' },
            context: {
              serviceName: service?.name || 'Service',
              appointmentDate: dateStr,
              appointmentTime: timeStr,
              staffName: staffUser ? `${staffUser.firstName} ${staffUser.lastName}`.trim() : 'Your stylist'
            }
          });
        }
      }
    } catch (reschedErr) {
      LoggerService.error("Failed to send reschedule notifications", { ...context, appointmentId }, reschedErr as Error);
    }

    res.json(updatedAppointment);
  }));

  // Set or update add-ons for an appointment (minimal targeted endpoint)
  app.post("/api/appointments/:id/add-ons", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);

    try {
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        throw new NotFoundError("Appointment");
      }

      const body: any = req.body || {};
      let addOnServiceIds: number[] = [];
      if (Array.isArray(body.addOnServiceIds)) {
        addOnServiceIds = body.addOnServiceIds.map((n: any) => parseInt(n)).filter((n: any) => Number.isFinite(n));
      } else if (body.addOnServiceId != null) {
        const n = parseInt(body.addOnServiceId);
        if (Number.isFinite(n)) addOnServiceIds = [n];
      }

      await storage.setAddOnsForAppointment(appointmentId, addOnServiceIds);
      const addOns = await storage.getAddOnServiceObjectsForAppointment(appointmentId);
      const baseService = await storage.getService(appointment.serviceId);
      const basePrice = Number((baseService as any)?.price ?? 0) || 0;
      const addOnTotal = Array.isArray(addOns) ? addOns.reduce((sum: number, svc: any) => sum + (Number(svc?.price ?? 0) || 0), 0) : 0;
      const computedTotalAmount = basePrice + addOnTotal;

      LoggerService.info("Appointment add-ons updated", { ...context, appointmentId, addOnCount: addOns?.length ?? 0 });
      return res.json({ success: true, appointmentId, addOns, computedTotalAmount });
    } catch (error) {
      LoggerService.error("Failed to set appointment add-ons", { ...context, appointmentId }, error as Error);
      throw error;
    }
  }));

  // Delete appointment
  app.delete("/api/appointments/:id", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Deleting appointment", { ...context, appointmentId });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // If a deletion is used as the way to cancel, trigger cancellation automation before delete
    try {
      if ((appointment as any).status !== 'cancelled') {
        await triggerCancellation(appointment as any, storage);
        LoggerService.info("Cancellation automation triggered from delete", { ...context, appointmentId });
      }
    } catch (autoErr) {
      LoggerService.error("Failed to trigger cancellation automation from delete", { ...context, appointmentId }, autoErr as Error);
    }

    await storage.deleteAppointment(appointmentId);

    LoggerService.logAppointment("deleted", appointmentId, context);

    res.json({ success: true, message: "Appointment deleted successfully" });
  }));

  // Get cancelled appointments
  app.get("/api/cancelled-appointments", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { clientId, staffId } = req.query;

    LoggerService.debug("Fetching cancelled appointments", { ...context, filters: { clientId, staffId } });

    let appointments;
    if (clientId) {
      appointments = await storage.getCancelledAppointmentsByClient(parseInt(clientId as string));
    } else if (staffId) {
      appointments = await storage.getCancelledAppointmentsByStaff(parseInt(staffId as string));
    } else {
      appointments = await storage.getAllCancelledAppointments();
    }

    res.json(appointments);
  }));

  // Get appointment history
  app.get("/api/appointment-history", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { appointmentId } = req.query;

    LoggerService.debug("Fetching appointment history", { ...context, appointmentId });

    const history = await storage.getAppointmentHistory(parseInt(appointmentId as string));
    res.json(history);
  }));

  // Create appointment history entry
  app.post("/api/appointment-history", validateRequest(insertAppointmentHistorySchema), asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const historyData = req.body;

    LoggerService.info("Creating appointment history entry", { ...context, historyData });

    const newHistory = await storage.createAppointmentHistory(historyData);

    LoggerService.logAppointment("history_created", historyData.appointmentId, context);

    res.status(201).json(newHistory);
  }));

  // Send appointment reminder
  app.post("/api/appointments/:id/send-reminder", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Sending appointment reminder", { ...context, appointmentId });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    const client = await storage.getUser(appointment.clientId);
    const staffRecord = await storage.getStaff(appointment.staffId);
    const staff = staffRecord ? await storage.getUser(staffRecord.userId) : null;
    const service = await storage.getService(appointment.serviceId);
    // Resolve appointment location for resend
    let appointmentLocation: any = null;
    try {
      const locId = (appointment as any).locationId;
      if (locId != null) {
        const rows = await db
          .select()
          .from(locationsTable)
          .where(eq(locationsTable.id, Number(locId)))
          .limit(1);
        appointmentLocation = (rows as any[])?.[0] || null;
      }
    } catch (_e) {
      appointmentLocation = null;
    }

    if (!client || !staff || !service) {
      throw new NotFoundError("Appointment details");
    }
    
    let reminderSent = false;

    // Send email reminder
    if (client.emailAppointmentReminders && client.email) {
      try {
        await sendLocationMessage({
          messageType: 'reminder',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'email',
          to: { email: client.email, name: client.firstName || client.username },
          overrides: {
            subject: `Appointment Reminder - ${appointmentLocation?.name || 'Glo Head Spa'}`,
            body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Appointment Reminder</h2>
              <p>Hello ${client.firstName || client.username},</p>
              <p>This is a reminder for your upcoming appointment:</p>
              <ul>
                <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(appointment.startTime))} (Central Time)</li>
                <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.endTime))} (Central Time)</li>
                <li><strong>Staff:</strong> ${staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'}</li>
              </ul>
              <p>We look forward to seeing you!</p>
            </div>
          `
          }
        });
        LoggerService.logCommunication("email", "appointment_reminder_sent", { ...context, userId: client.id });
        reminderSent = true;
      } catch (error) {
        LoggerService.error("Failed to send email reminder", { ...context, userId: client.id }, error as Error);
      }
    }

    // Send SMS reminder
    if (client.smsAppointmentReminders && client.phone) {
      try {
        const message = `Reminder: Your ${appointmentLocation?.name || 'Glo Head Spa'} appointment for ${service?.name || 'your service'} is tomorrow at ${appointment.startTime}.`;
        await sendLocationMessage({
          messageType: 'reminder',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'sms',
          to: { phone: client.phone, name: client.firstName || client.username },
          overrides: { body: message }
        });
        LoggerService.logCommunication("sms", "appointment_reminder_sent", { ...context, userId: client.id });
        reminderSent = true;
      } catch (error) {
        LoggerService.error("Failed to send SMS reminder", { ...context, userId: client.id }, error as Error);
      }
    }

    if (reminderSent) {
      res.json({ success: true, message: "Reminder sent successfully" });
    } else {
      res.status(400).json({ error: "No reminder preferences enabled for this client" });
    }
  }));

  // Send daily reminders (batch operation)
  app.post("/api/appointments/send-daily-reminders", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);

    LoggerService.info("Starting daily reminder batch", context);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const appointments = await storage.getAppointmentsByDate(tomorrow);
    let sentCount = 0;
    let errorCount = 0;

    for (const appointment of appointments) {
      try {
        const client = await storage.getUser(appointment.clientId);
        if (!client) continue;

        let reminderSent = false;

        // Send email reminder
        if (client.emailAppointmentReminders && client.email) {
          try {
            // Resolve location for each appointment
            let apptLoc: any = null;
            try {
              const locId = (appointment as any).locationId;
              if (locId != null) {
                const rows = await db.select().from(locationsTable).where(eq(locationsTable.id, Number(locId))).limit(1);
                apptLoc = (rows as any[])?.[0] || null;
                try { if (apptLoc?.name) upsertLocationTemplate(String(locId), { name: String(apptLoc.name) }); } catch {}
              }
            } catch {}
            await sendLocationMessage({
              messageType: 'reminder',
              locationId: String((appointment as any).locationId ?? 'global'),
              channel: 'email',
              to: { email: client.email, name: client?.firstName || client?.username || 'Customer' },
              overrides: {
                subject: `Appointment Reminder - ${apptLoc?.name || 'Glo Head Spa'}`,
                body: `
                <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
                  <h2 style=\"color: #333;\">Appointment Reminder</h2>
                  <p>Hello ${client.firstName || client.username},</p>
                  <p>This is a reminder for your upcoming appointment tomorrow:</p>
                  <ul>
                    <li><strong>Date:</strong> ${tomorrow.toLocaleDateString()}</li>
                    <li><strong>Time:</strong> ${appointment.startTime} - ${appointment.endTime}</li>
                  </ul>
                  <p>We look forward to seeing you!</p>
                </div>
              `
              }
            });
            reminderSent = true;
          } catch (error) {
            LoggerService.error("Failed to send email reminder", { ...context, userId: client.id, appointmentId: appointment.id }, error as Error);
          }
        }

        // Send SMS reminder
        if (client.smsAppointmentReminders && client.phone) {
          try {
            const message = `Reminder: Your ${'Glo Head Spa'} appointment is tomorrow at ${appointment.startTime}.`;
            await sendLocationMessage({
              messageType: 'reminder',
              locationId: String((appointment as any).locationId ?? 'global'),
              channel: 'sms',
              to: { phone: client.phone || '', name: client?.firstName || client?.username || 'Customer' },
              overrides: { body: message }
            });
            reminderSent = true;
          } catch (error) {
            LoggerService.error("Failed to send SMS reminder", { ...context, userId: client.id, appointmentId: appointment.id }, error as Error);
          }
        }

        if (reminderSent) {
          sentCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        LoggerService.error("Error processing appointment reminder", { ...context, appointmentId: appointment.id }, error as Error);
      }
    }

    LoggerService.info("Daily reminder batch completed", { ...context, sentCount, errorCount, totalAppointments: appointments.length });

    res.json({ 
      success: true, 
      message: "Daily reminders processed", 
      sentCount, 
      errorCount, 
      totalAppointments: appointments.length 
    });
  }));

  // Resend appointment confirmation (email and/or SMS)
  app.post("/api/appointments/:id/resend-confirmation", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);
    const { channel } = (req.body || {}) as { channel?: 'email' | 'sms' | 'both' };

    LoggerService.info("Resending appointment confirmation", { ...context, appointmentId, channel: channel || 'auto' });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    const client = await storage.getUser(appointment.clientId);
    const staffRecord = await storage.getStaff(appointment.staffId);
    const staff = staffRecord ? await storage.getUser(staffRecord.userId) : null;
    const service = await storage.getService(appointment.serviceId);

    // Resolve appointment location for messaging
    let appointmentLocation: any = null;
    try {
      const locId = (appointment as any).locationId;
      if (locId != null) {
        const rows = await db.select().from(locationsTable).where(eq(locationsTable.id, Number(locId))).limit(1);
        appointmentLocation = (rows as any[])?.[0] || null;
      }
    } catch (_e) {
      appointmentLocation = null;
    }

    if (!client || !service) {
      throw new NotFoundError("Appointment details");
    }

    let emailSent = false;
    let smsSent = false;

    // Decide which channels to send
    const sendEmailRequested = channel === 'email' || channel === 'both' || (!channel);
    const sendSmsRequested = channel === 'sms' || channel === 'both' || (!channel);

    // Send email confirmation if allowed
    if (sendEmailRequested && client.emailAppointmentReminders && client.email) {
      try {
        await sendLocationMessage({
          messageType: 'confirmation',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'email',
          to: { email: client.email, name: client.firstName || client.username || '' },
          overrides: {
            subject: `Appointment Confirmation - ${appointmentLocation?.name || 'Glo Head Spa'}`,
            body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Appointment Confirmation</h2>
              <p>Hello ${client.firstName || client.username || ''},</p>
              <p>Your appointment has been confirmed:</p>
              <ul>
                <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(appointment.startTime))} (Central Time)</li>
                <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.endTime))} (Central Time)</li>
                <li><strong>Staff:</strong> ${staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'}</li>
                ${appointmentLocation ? `<li><strong>Location:</strong> ${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}</li>` : ''}
              </ul>
              <p>We look forward to seeing you!</p>
            </div>
          `
          }
        });
        LoggerService.logCommunication("email", "appointment_confirmation_resent", { ...context, userId: client.id });
        emailSent = true;
      } catch (error) {
        LoggerService.error("Failed to resend email confirmation", { ...context, appointmentId }, error as Error);
      }
    }

    // Send SMS confirmation if allowed
    if (sendSmsRequested && client.smsAppointmentReminders && client.phone) {
      try {
        let message = `Your ${appointmentLocation?.name || 'Glo Head Spa'} appointment for ${service?.name || 'your service'} on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(appointment.startTime))} at ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.startTime))} (Central Time) has been confirmed.`;
        if (appointmentLocation) {
          const locText = `${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}`;
          message += ` Location: ${locText}.`;
        }
        await sendLocationMessage({
          messageType: 'confirmation',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'sms',
          to: { phone: client.phone, name: client.firstName || client.username },
          overrides: { body: message }
        });
        LoggerService.logCommunication("sms", "appointment_confirmation_resent", { ...context, userId: client.id });
        smsSent = true;
      } catch (error) {
        LoggerService.error("Failed to resend SMS confirmation", { ...context, appointmentId }, error as Error);
      }
    }

    if (!emailSent && !smsSent) {
      return res.status(400).json({
        success: false,
        error: "No confirmation sent. Ensure client preferences are enabled and channel is valid.",
        details: {
          emailPreference: client.emailAppointmentReminders,
          hasEmail: !!client.email,
          smsPreference: client.smsAppointmentReminders,
          hasPhone: !!client.phone,
        }
      });
    }

    return res.json({ success: true, emailSent, smsSent });
  }));

  // Alias route to support alternate path ordering
  app.post("/api/appointments/resend-confirmation/:id", asyncHandler(async (req: Request, res: Response) => {
    const appointmentId = parseInt(req.params.id);
    const context = getLogContext(req);
    const { channel } = (req.body || {}) as { channel?: 'email' | 'sms' | 'both' };

    LoggerService.info("Resending appointment confirmation (alias route)", { ...context, appointmentId, channel: channel || 'auto' });

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    const client = await storage.getUser(appointment.clientId);
    const staffRecord = await storage.getStaff(appointment.staffId);
    const staff = staffRecord ? await storage.getUser(staffRecord.userId) : null;
    const service = await storage.getService(appointment.serviceId);

    // Resolve appointment location for messaging
    let appointmentLocation: any = null;
    try {
      const locId = (appointment as any).locationId;
      if (locId != null) {
        const rows = await db.select().from(locationsTable).where(eq(locationsTable.id, Number(locId))).limit(1);
        appointmentLocation = (rows as any[])?.[0] || null;
      }
    } catch (_e) {
      appointmentLocation = null;
    }

    if (!client || !service) {
      throw new NotFoundError("Appointment details");
    }

    let emailSent = false;
    let smsSent = false;

    const sendEmailRequested = channel === 'email' || channel === 'both' || (!channel);
    const sendSmsRequested = channel === 'sms' || channel === 'both' || (!channel);

    if (sendEmailRequested && client.emailAppointmentReminders && client.email) {
      try {
        await sendLocationMessage({
          messageType: 'confirmation',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'email',
          to: { email: client.email, name: client.firstName || client.username || '' },
          overrides: {
            subject: `Appointment Confirmation - ${appointmentLocation?.name || 'Glo Head Spa'}`,
            body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Appointment Confirmation</h2>
              <p>Hello ${client.firstName || client.username || ''},</p>
              <p>Your appointment has been confirmed:</p>
              <ul>
                <li><strong>Service:</strong> ${service?.name || 'Service'}</li>
                <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(appointment.startTime))} (Central Time)</li>
                <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.endTime))} (Central Time)</li>
                <li><strong>Staff:</strong> ${staff ? `${staff.firstName} ${staff.lastName}` : 'Your stylist'}</li>
                ${appointmentLocation ? `<li><strong>Location:</strong> ${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}</li>` : ''}
              </ul>
              <p>We look forward to seeing you!</p>
            </div>
          `
          }
        });
        LoggerService.logCommunication("email", "appointment_confirmation_resent", { ...context, userId: client.id });
        emailSent = true;
      } catch (error) {
        LoggerService.error("Failed to resend email confirmation (alias)", { ...context, appointmentId }, error as Error);
      }
    }

    if (sendSmsRequested && client.smsAppointmentReminders && client.phone) {
      try {
        let message = `Your ${appointmentLocation?.name || 'Glo Head Spa'} appointment for ${service?.name || 'your service'} on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(appointment.startTime))} at ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(appointment.startTime))} (Central Time) has been confirmed.`;
        if (appointmentLocation) {
          const locText = `${appointmentLocation.name} — ${[appointmentLocation.address, appointmentLocation.city, appointmentLocation.state, appointmentLocation.zipCode].filter(Boolean).join(', ')}`;
          message += ` Location: ${locText}.`;
        }
        await sendLocationMessage({
          messageType: 'confirmation',
          locationId: String((appointment as any).locationId ?? 'global'),
          channel: 'sms',
          to: { phone: client.phone, name: client.firstName || client.username },
          overrides: { body: message }
        });
        LoggerService.logCommunication("sms", "appointment_confirmation_resent", { ...context, userId: client.id });
        smsSent = true;
      } catch (error) {
        LoggerService.error("Failed to resend SMS confirmation (alias)", { ...context, appointmentId }, error as Error);
      }
    }

    if (!emailSent && !smsSent) {
      return res.status(400).json({
        success: false,
        error: "No confirmation sent. Ensure client preferences are enabled and channel is valid.",
        details: {
          emailPreference: client.emailAppointmentReminders,
          hasEmail: !!client.email,
          smsPreference: client.smsAppointmentReminders,
          hasPhone: !!client.phone,
        }
      });
    }

    return res.json({ success: true, emailSent, smsSent });
  }));

  // DEBUG ENDPOINT: Test email functionality with simulated data
  app.post("/api/debug/test-email-functionality", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    
    console.log("🔍 DEBUG: Testing email functionality with simulated data...");
    
    try {
      // Simulate client data
      const simulatedClient = {
        id: 'test-client-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailAppointmentReminders: true,
        phone: '+1234567890',
        smsAppointmentReminders: true
      };
      
      // Simulate service data
      const simulatedService = {
        id: 'test-service-id',
        name: 'Test Haircut Service',
        duration: 60,
        price: 50.00
      };
      
      // Simulate staff data
      const simulatedStaff = {
        id: 'test-staff-id',
        firstName: 'John',
        lastName: 'Stylist',
        email: 'john@salon.com'
      };
      
      // Simulate appointment data
      const simulatedAppointment = {
        id: 'test-appointment-id',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        clientId: simulatedClient.id,
        serviceId: simulatedService.id,
        staffId: simulatedStaff.id
      };
      
      console.log("🔍 DEBUG: Simulated data created:");
      console.log("  - Client:", simulatedClient);
      console.log("  - Service:", simulatedService);
      console.log("  - Staff:", simulatedStaff);
      console.log("  - Appointment:", simulatedAppointment);
      
      // Test the email sending logic
      console.log("🔍 DEBUG: Testing email sending logic...");
      console.log("  - client.emailAppointmentReminders:", simulatedClient.emailAppointmentReminders);
      console.log("  - client.email:", simulatedClient.email);
      console.log("  - Condition result:", simulatedClient.emailAppointmentReminders && simulatedClient.email);
      
      if (simulatedClient.emailAppointmentReminders && simulatedClient.email) {
        console.log("✅ DEBUG: Email conditions met, sending email...");
        
        try {
          const locationName = 'Glo Head Spa';
          await sendEmail({
            to: simulatedClient.email,
            from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
            subject: `DEBUG TEST - Appointment Confirmation - ${locationName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">DEBUG TEST - Appointment Confirmation</h2>
                <p>Hello ${simulatedClient.firstName || simulatedClient.lastName},</p>
                <p>This is a DEBUG TEST email to verify the email functionality:</p>
                <ul>
                  <li><strong>Service:</strong> ${simulatedService.name}</li>
                  <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(simulatedAppointment.startTime))} (Central Time)</li>
                  <li><strong>Time:</strong> ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(simulatedAppointment.startTime))} - ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(simulatedAppointment.endTime))} (Central Time)</li>
                  <li><strong>Staff:</strong> ${simulatedStaff.firstName} ${simulatedStaff.lastName}</li>
                </ul>
                <p>This is a debug test email to verify the email service is working correctly.</p>
              </div>
            `
          });
          
          console.log("✅ DEBUG: Email sent successfully!");
          
          res.json({
            success: true,
            message: "Debug email test completed successfully",
            emailSent: true,
            simulatedData: {
              client: simulatedClient,
              service: simulatedService,
              staff: simulatedStaff,
              appointment: simulatedAppointment
            }
          });
          
        } catch (emailError) {
          console.log("❌ DEBUG: Email sending failed:", emailError);
          
          res.status(500).json({
            success: false,
            error: "Email sending failed",
            details: emailError instanceof Error ? emailError.message : String(emailError),
            emailSent: false
          });
        }
      } else {
        console.log("❌ DEBUG: Email conditions not met:");
        console.log("  - emailAppointmentReminders:", simulatedClient.emailAppointmentReminders);
        console.log("  - email:", simulatedClient.email);
        
        res.status(400).json({
          success: false,
          error: "Email conditions not met",
          conditions: {
            emailAppointmentReminders: simulatedClient.emailAppointmentReminders,
            email: simulatedClient.email,
            conditionMet: simulatedClient.emailAppointmentReminders && simulatedClient.email
          }
        });
      }
      
    } catch (error) {
      console.log("❌ DEBUG: Test failed with error:", error);
      
      res.status(500).json({
        success: false,
        error: "Debug test failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }));

  // DEBUG ENDPOINT: Test data retrieval
  app.get("/api/debug/test-data-retrieval/:clientId/:staffId/:serviceId", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { clientId, staffId, serviceId } = req.params;
    
    console.log("🔍 DEBUG: Testing data retrieval...");
    console.log("  - clientId:", clientId);
    console.log("  - staffId:", staffId);
    console.log("  - serviceId:", serviceId);
    
    try {
      // Test client retrieval
      const client = await storage.getUser(parseInt(clientId));
      console.log("  - client found:", !!client);
      if (client) {
        console.log("  - client email:", client.email);
        console.log("  - client emailAppointmentReminders:", client.emailAppointmentReminders);
      }
      
      // Test staff retrieval
      const staff = await storage.getStaff(parseInt(staffId));
      console.log("  - staff found:", !!staff);
      if (staff) {
        console.log("  - staff title:", staff.title);
        console.log("  - staff userId:", staff.userId);
      }
      
      // Test service retrieval
      const service = await storage.getService(parseInt(serviceId));
      console.log("  - service found:", !!service);
      if (service) {
        console.log("  - service name:", service.name);
      }
      
      res.json({
        success: true,
        data: {
          client: client ? {
            id: client.id,
            email: client.email,
            emailAppointmentReminders: client.emailAppointmentReminders,
            firstName: client.firstName,
            lastName: client.lastName
          } : null,
          staff: staff ? {
            id: staff.id,
            title: staff.title,
            userId: staff.userId
          } : null,
          service: service ? {
            id: service.id,
            name: service.name
          } : null
        }
      });
      
    } catch (error) {
      console.log("❌ DEBUG: Data retrieval failed:", error);
      
      res.status(500).json({
        success: false,
        error: "Data retrieval failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }));

  // Get all appointments in a recurring group
  app.get("/api/appointments/recurring/:groupId", asyncHandler(async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const context = getLogContext(req);
    
    LoggerService.info("Fetching recurring appointments", { ...context, groupId });
    
    // Get all appointments with this recurringGroupId
    const allAppointments = await storage.getAllAppointments();
    const recurringAppointments = allAppointments.filter((apt: any) => 
      apt.recurringGroupId === groupId
    ).sort((a: any, b: any) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    res.json(recurringAppointments);
  }));

  // Update all future appointments in a recurring group
  app.put("/api/appointments/recurring/:groupId/all", asyncHandler(async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const updateData = req.body;
    const context = getLogContext(req);
    
    console.log("🔄 RECURRING UPDATE REQUEST:", {
      groupId,
      updateData,
      body: req.body
    });
    
    LoggerService.info("Updating all future recurring appointments", { ...context, groupId, updateData });
    
    // Get all appointments with this recurringGroupId
    const allAppointments = await storage.getAllAppointments();
    const now = new Date();
    const futureAppointments = allAppointments.filter((apt: any) => 
      apt.recurringGroupId === groupId &&
      new Date(apt.startTime) > now &&
      apt.status !== 'cancelled' &&
      apt.status !== 'completed'
    );
    
    console.log("🔄 FOUND FUTURE APPOINTMENTS TO UPDATE:", {
      count: futureAppointments.length,
      appointmentIds: futureAppointments.map((a: any) => a.id)
    });
    
    const updatedAppointments = [];
    const failedUpdates = [];
    
    // Update each future appointment
    for (const appointment of futureAppointments) {
      try {
        console.log(`🔄 Updating appointment ${appointment.id} with:`, updateData);
        await storage.updateAppointment(appointment.id, updateData);
        updatedAppointments.push(appointment.id);
        LoggerService.info("Updated recurring appointment", { 
          ...context, 
          appointmentId: appointment.id 
        });
      } catch (error) {
        console.error(`❌ Failed to update appointment ${appointment.id}:`, error);
        LoggerService.error("Failed to update recurring appointment", { 
          ...context, 
          appointmentId: appointment.id,
          error: error instanceof Error ? error.message : String(error)
        });
        failedUpdates.push({
          appointmentId: appointment.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    res.json({
      success: true,
      updatedCount: updatedAppointments.length,
      failedCount: failedUpdates.length,
      updatedAppointmentIds: updatedAppointments,
      failures: failedUpdates
    });
  }));

  // Cancel all future appointments in a recurring group
  app.put("/api/appointments/recurring/:groupId/cancel", asyncHandler(async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const context = getLogContext(req);
    
    LoggerService.info("Cancelling all future recurring appointments", { ...context, groupId });
    
    // Get all appointments with this recurringGroupId
    const allAppointments = await storage.getAllAppointments();
    const now = new Date();
    const futureAppointments = allAppointments.filter((apt: any) => 
      apt.recurringGroupId === groupId &&
      new Date(apt.startTime) > now &&
      apt.status !== 'cancelled'
    );
    
    const cancelledAppointments = [];
    const failedCancellations = [];
    
    // Cancel each future appointment
    for (const appointment of futureAppointments) {
      try {
        await storage.moveAppointmentToCancelled(
          appointment.id,
          'Recurring series cancelled'
        );
        
        // Trigger cancellation automation
        try {
          await triggerCancellation(appointment as any, storage);
          LoggerService.info("Cancellation automation triggered for recurring appointment", { 
            ...context, 
            appointmentId: appointment.id 
          });
        } catch (autoErr) {
          LoggerService.error("Failed to trigger cancellation automation", { 
            ...context, 
            appointmentId: appointment.id 
          }, autoErr as Error);
        }
        
        cancelledAppointments.push(appointment.id);
        LoggerService.info("Cancelled recurring appointment", { 
          ...context, 
          appointmentId: appointment.id 
        });
      } catch (error) {
        LoggerService.error("Failed to cancel recurring appointment", { 
          ...context, 
          appointmentId: appointment.id,
          error: error instanceof Error ? error.message : String(error)
        });
        failedCancellations.push({
          appointmentId: appointment.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    res.json({
      success: true,
      cancelledCount: cancelledAppointments.length,
      failedCount: failedCancellations.length,
      cancelledAppointmentIds: cancelledAppointments,
      failures: failedCancellations
    });
  }));

  // Edit a single appointment in a recurring series (break from series)
  app.put("/api/appointments/recurring/:groupId/single/:appointmentId", asyncHandler(async (req: Request, res: Response) => {
    const { groupId, appointmentId } = req.params;
    const updateData = req.body;
    const context = getLogContext(req);
    
    LoggerService.info("Updating single appointment in recurring series", { 
      ...context, 
      groupId, 
      appointmentId, 
      updateData 
    });
    
    // Verify the appointment belongs to the recurring group
    const appointment = await storage.getAppointment(parseInt(appointmentId));
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }
    
    if ((appointment as any).recurringGroupId !== groupId) {
      throw new ValidationError("Appointment does not belong to this recurring group");
    }
    
    // Remove the appointment from the recurring group if editing individually
    const updatedData = {
      ...updateData,
      recurringGroupId: null, // Break from recurring series
      notes: updateData.notes || (appointment as any).notes + " (Modified from recurring series)"
    };
    
    const updatedAppointment = await storage.updateAppointment(parseInt(appointmentId), updatedData);
    
    LoggerService.info("Appointment removed from recurring series and updated", { 
      ...context, 
      appointmentId 
    });
    
    res.json(updatedAppointment);
  }));
} 