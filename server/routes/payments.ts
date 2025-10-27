import type { Express, Request, Response } from "express";
import type { IStorage } from "../storage.js";
import { z } from "zod";
import { insertPaymentSchema, insertSavedPaymentMethodSchema } from "../../shared/schema.js";
import { 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  ExternalServiceError,
  asyncHandler 
} from "../utils/errors.js";
import LoggerService, { getLogContext } from "../utils/logger.js";
import { validateRequest, requireAuth } from "../middleware/error-handler.js";
import { triggerAfterPayment } from "../automation-triggers.js";
import { sendEmail } from "../email.js";
import { sendSMS } from "../sms.js";

import cache, { invalidateCache } from "../utils/cache.js";

// Export this function so it can be used in other routes
export async function createSalesHistoryRecord(storage: IStorage, paymentData: any, transactionType: string, additionalData?: any) {
  console.log('createSalesHistoryRecord called with:', { paymentData: paymentData.id, transactionType });
  try {
    // Use checkout time if provided, otherwise use current time
    const transactionDate = additionalData?.checkoutTime || new Date();
    const businessDate = transactionDate.toISOString().split('T')[0];
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][transactionDate.getDay()];
    const monthYear = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
    const quarter = `${transactionDate.getFullYear()}-Q${Math.ceil((transactionDate.getMonth() + 1) / 3)}`;

    let clientInfo = null;
    let staffInfo = null;
    let appointmentInfo = null;
    let serviceInfo = null;

    // Get client information if clientId exists
    if (paymentData.clientId) {
      clientInfo = await storage.getUser(paymentData.clientId);
    }

    // Get appointment and service information for appointment payments
    if (paymentData.appointmentId && transactionType === 'appointment') {
      appointmentInfo = await storage.getAppointment(paymentData.appointmentId);
      
      if (appointmentInfo) {
        serviceInfo = await storage.getService(appointmentInfo.serviceId);
        
        // Always check for staff assignment in the appointment
        if (appointmentInfo.staffId) {
          try {
            const staffData = await storage.getStaff(appointmentInfo.staffId);
            if (staffData) {
              const staffUser = await storage.getUser(staffData.userId);
              if (staffUser) {
                staffInfo = { 
                  id: staffData.id,
                  user: staffUser 
                };
                console.log('Staff found for appointment:', staffData.id, staffUser.firstName, staffUser.lastName);
              } else {
                console.log('Staff user not found:', staffData.userId);
              }
            } else {
              console.log('Staff record not found for appointmentId:', appointmentInfo.id, 'staffId:', appointmentInfo.staffId);
            }
          } catch (staffError) {
            console.error('Error getting staff info:', staffError);
          }
        } else {
          console.log('No staffId set on appointment:', appointmentInfo.id);
        }
      }
    }

    const salesHistoryData = {
      transactionType,
      transactionDate,
      paymentId: paymentData.id,
      totalAmount: paymentData.totalAmount || paymentData.amount,
      paymentMethod: paymentData.method,
      paymentStatus: paymentData.status,
      
      // Client information
      clientId: clientInfo?.id || null,
      clientName: clientInfo ? `${clientInfo.firstName || ''} ${clientInfo.lastName || ''}`.trim() : null,
      clientEmail: clientInfo?.email || null,
      clientPhone: clientInfo?.phone || null,
      
      // Staff information
      staffId: staffInfo?.id || null,
      staffName: staffInfo?.user ? `${staffInfo.user.firstName || ''} ${staffInfo.user.lastName || ''}`.trim() : 
                appointmentInfo?.staffId ? 'NEEDS ASSIGNMENT' : null,
      
      // Appointment and service information
      appointmentId: appointmentInfo?.id || null,
      serviceIds: serviceInfo ? JSON.stringify([serviceInfo.id]) : null,
      serviceNames: serviceInfo ? JSON.stringify([serviceInfo.name]) : null,
      // IMPORTANT: Use the amount field (service cost) not totalAmount (which includes tip)
      serviceTotalAmount: transactionType === 'appointment' ? paymentData.amount : null,
      
      // POS information
      productIds: additionalData?.productIds || null,
      productNames: additionalData?.productNames || null,
      productQuantities: additionalData?.productQuantities || null,
      productUnitPrices: additionalData?.productUnitPrices || null,
      productTotalAmount: transactionType === 'pos_sale' ? (paymentData.totalAmount || paymentData.amount) : null,
      
      // Membership information
      membershipId: additionalData?.membershipId || null,
      membershipName: additionalData?.membershipName || null,
      membershipDuration: additionalData?.membershipDuration || null,
      
      // Business insights
      businessDate,
      dayOfWeek,
      monthYear,
      quarter,
      
      // External tracking
      helcimPaymentId: paymentData.helcimPaymentId || null,
      
      // Tax and fees
      taxAmount: 0, // Could be enhanced to track tax separately
      tipAmount: paymentData.tipAmount || 0, // Capture tip amount from payment
      discountAmount: (additionalData && typeof additionalData.discountAmount === 'number') ? additionalData.discountAmount : 0,
      
      // Audit trail
      createdBy: null, // Could be set to current user ID if available
      notes: paymentData.notes || null
    };

    const salesHistory = await storage.createSalesHistory(salesHistoryData);
    console.log('Sales history record created:', salesHistory.id);
    return salesHistory;
  } catch (error) {
    console.error('Error creating sales history record:', error);
    // Don't throw error to prevent breaking payment flow
  }
}

export function registerPaymentRoutes(app: Express, storage: IStorage) {
  // Helcim payment processing is handled in the main routes

  // Create payment
  app.post("/api/payments", validateRequest(insertPaymentSchema), asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const paymentData = req.body;

    LoggerService.logPayment("create", paymentData.amount, context);

    // If card payment, store card details in notes for display purposes
    if ((paymentData.method === 'card' || paymentData.method === 'terminal') && req.body.cardLast4) {
      if (!paymentData.notes || paymentData.notes === '') {
        paymentData.notes = JSON.stringify({ cardLast4: req.body.cardLast4 });
      } else {
        try {
          const existingNotes = JSON.parse(paymentData.notes);
          existingNotes.cardLast4 = req.body.cardLast4;
          paymentData.notes = JSON.stringify(existingNotes);
        } catch {
          paymentData.notes = JSON.stringify({ 
            originalNote: paymentData.notes, 
            cardLast4: req.body.cardLast4 
          });
        }
      }
    }

    const newPayment = await storage.createPayment(paymentData);
    
    // Store invoice number in notes if this is a Helcim payment
    if (paymentData.helcimPaymentId && newPayment.id) {
      try {
        const invoiceNumber = `INV${String(newPayment.id).padStart(6, '0')}`;
        const existingNotes = paymentData.notes ? JSON.parse(paymentData.notes) : {};
        await storage.updatePayment(newPayment.id, {
          notes: JSON.stringify({
            ...existingNotes,
            invoiceNumber,
            helcimPaymentId: paymentData.helcimPaymentId
          })
        });
        console.log(`📝 Added invoice number ${invoiceNumber} to payment ${newPayment.id}`);
        
        // CRITICAL: Create a session for Helcim Pay.js payments so webhooks can match them
        try {
          const terminalService = (app as any).__terminalService || 
                                 (storage as any).__terminalService;
          if (terminalService && terminalService.sessionStore) {
            const sessionData = {
              startedAt: Date.now(),
              locationId: paymentData.locationId || 'default',
              deviceCode: 'HELCIM_PAYJS', // Special code for Pay.js payments
              totalAmount: paymentData.totalAmount || paymentData.amount,
              baseAmount: paymentData.amount,
              appointmentId: paymentData.appointmentId,
              paymentId: newPayment.id
            };
            terminalService.sessionStore.set(invoiceNumber, sessionData);
            console.log(`💾 Created session for Helcim Pay.js payment: ${invoiceNumber}`);
          }
          
          // CRITICAL: Check if webhook already arrived for this transaction
          if (terminalService && terminalService.webhookStore) {
            // Check by transaction ID
            const cachedWebhook = terminalService.webhookStore.get(String(paymentData.helcimPaymentId)) ||
                                 terminalService.webhookStore.get(`ORPHAN_${paymentData.helcimPaymentId}`);
            
            if (cachedWebhook && cachedWebhook.status === 'completed') {
              console.log(`✅ Found completed webhook that arrived early for transaction: ${paymentData.helcimPaymentId}`);
              // Update payment to completed since webhook confirms it
              await storage.updatePayment(newPayment.id, {
                status: 'completed',
                processedAt: new Date()
              });
              
              // Clean up orphan entry
              terminalService.webhookStore.delete(`ORPHAN_${paymentData.helcimPaymentId}`);
              
              // Cache under invoice number for future lookups
              terminalService.webhookStore.set(invoiceNumber, cachedWebhook);
            } else if (cachedWebhook) {
              console.log(`⚠️ Found ${cachedWebhook.status} webhook for transaction: ${paymentData.helcimPaymentId}`);
            }
          }
        } catch (sessionErr) {
          console.warn('Could not create session for webhook matching:', sessionErr);
        }
      } catch (err) {
        console.warn('Could not update payment with invoice number:', err);
      }
    }

    // CRITICAL: Create sales history record for ALL payments (including Helcim Pay.js)
    // This ensures payments appear in payroll reports
    try {
      // Determine transaction type based on payment data
      let transactionType = 'pos_sale'; // default
      
      if (paymentData.appointmentId) {
        transactionType = 'appointment';
      } else if (paymentData.type === 'gift_card' || paymentData.type === 'gift_card_purchase') {
        transactionType = 'gift_card';
      } else if (paymentData.type === 'membership' || paymentData.type === 'membership_payment') {
        transactionType = 'membership';
      } else if (paymentData.type === 'pos_payment' || paymentData.type === 'pos_sale') {
        transactionType = 'pos_sale';
      }
      
      console.log(`📊 Creating sales history record for ${transactionType} payment ${newPayment.id}`);
      
      // Calculate tip amount: total amount from Helcim minus the service cost (amount)
      const tipAmount = paymentData.tipAmount || 
                       (paymentData.totalAmount && paymentData.amount ? 
                        paymentData.totalAmount - paymentData.amount : 0);
      
      // Create the updated payment object with tip amount for sales history
      const paymentForHistory = {
        ...newPayment,
        tipAmount: tipAmount,
        helcimPaymentId: paymentData.helcimPaymentId || paymentData.helcimTransactionId
      };
      
      await createSalesHistoryRecord(storage, paymentForHistory, transactionType, {
        checkoutTime: new Date(),
        ...paymentData // Pass along any additional data like product info for POS sales
      });
      
      console.log(`✅ Sales history record created for payment ${newPayment.id} (${transactionType})`);
    } catch (error) {
      // Don't fail the payment creation if sales history fails
      console.error('Failed to create sales history record:', error);
    }

    // Invalidate relevant caches
    invalidateCache('payments');
    invalidateCache(`user:${paymentData.clientId}`);

    // Fire automation for appointment payments completed at creation time
    try {
      if ((newPayment as any)?.appointmentId && String((newPayment as any)?.status) === 'completed') {
        const apptId = (newPayment as any).appointmentId as number;
        const appointment = await storage.getAppointment(apptId);
        if (appointment) {
          await triggerAfterPayment(appointment, storage);
        }
      }
    } catch (e) {
      try { LoggerService.error("Failed to trigger after_payment automation on create", { error: e instanceof Error ? e.message : String(e) }); } catch {}
    }

    res.status(201).json(newPayment);
  }));

  // Get all payments
  app.get("/api/payments", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { clientId, staffId, startDate, endDate, status, appointmentId } = req.query;

    LoggerService.debug("Fetching payments", { ...context, filters: { clientId, staffId, startDate, endDate, status, appointmentId } });

    let payments;
    if (appointmentId) {
      // Get payments for a specific appointment
      const allPayments = await storage.getAllPayments();
      payments = allPayments.filter((p: any) => p.appointmentId === parseInt(appointmentId as string));
    } else if (clientId) {
      payments = await storage.getPaymentsByClient(parseInt(clientId as string));
    } else if (staffId) {
      // Note: payments don't have staffId field, get all payments for now
      // TODO: Implement staff-payment relationship through appointments
      payments = await storage.getAllPayments();
    } else if (startDate && endDate) {
      // Note: getPaymentsByDateRange doesn't exist, so we'll get all payments and filter
      const allPayments = await storage.getAllPayments();
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      payments = allPayments.filter(p => {
        const paymentDate = p.paymentDate ? new Date(p.paymentDate) : new Date();
        return paymentDate >= start && paymentDate <= end;
      });
    } else if (status) {
      // Note: getPaymentsByStatus doesn't exist, so we'll get all payments and filter
      const allPayments = await storage.getAllPayments();
      payments = allPayments.filter(p => p.status === status);
    } else {
      payments = await storage.getAllPayments();
    }

    LoggerService.info("Payments fetched", { ...context, count: payments.length });
    res.json(payments);
  }));

  // Update payment
  app.put("/api/payments/:id", validateRequest(insertPaymentSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const paymentId = parseInt(req.params.id);
    const context = getLogContext(req);
    const updateData = req.body;

    LoggerService.logPayment("update", updateData.amount, context);

    const existingPayment = await storage.getPayment(paymentId);
    if (!existingPayment) {
      throw new NotFoundError("Payment");
    }

    const updatedPayment = await storage.updatePayment(paymentId, updateData);

    // Invalidate relevant caches
    invalidateCache('payments');
    invalidateCache(`payment:${paymentId}`);

    // Fire automation if transitioning to completed for an appointment payment
    try {
      const transitionedToCompleted = String(existingPayment.status) !== 'completed' && String((updatedPayment as any)?.status) === 'completed';
      const apptId = (updatedPayment as any)?.appointmentId || (existingPayment as any)?.appointmentId;
      if (transitionedToCompleted && apptId) {
        const appointment = await storage.getAppointment(apptId as number);
        if (appointment) {
          await triggerAfterPayment(appointment, storage);
        }
      }
    } catch (e) {
      try { LoggerService.error("Failed to trigger after_payment automation on update", { ...context, error: e instanceof Error ? e.message : String(e) }); } catch {}
    }

    res.json(updatedPayment);
  }));

  // Confirm card payment (for split payments)
  app.post("/api/confirm-card-payment", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { 
      appointmentId, 
      amount, 
      notes, 
      tipAmount = 0, 
      isSplitPayment = false,
      cardLast4,
      transactionId,
      helcimPaymentId
    } = req.body;

    LoggerService.logPayment("card_payment", amount, context);

    // Get appointment details
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // Calculate base amount (total minus tip)
    const baseAmount = amount - tipAmount;

    // Create payment record with tip tracking
    const checkoutTime = new Date();
    const payment = await storage.createPayment({
      appointmentId,
      clientId: appointment.clientId,
      amount: baseAmount,
      tipAmount: tipAmount,
      totalAmount: amount,
      method: 'card',
      status: 'completed',
      type: 'appointment_payment',
      notes: notes || 'Card payment',
      processedAt: checkoutTime,
      paymentDate: checkoutTime,
      helcimPaymentId: helcimPaymentId || transactionId,
      cardLast4: cardLast4
    });

    // For split payments, check if appointment is fully paid
    if (isSplitPayment) {
      // Get all payments for this appointment to calculate total paid
      const allPayments = await storage.getAllPayments();
      const appointmentPayments = allPayments.filter((p: any) => p.appointmentId === appointmentId);
      const totalPaid = appointmentPayments.reduce((sum: number, p: any) => {
        if (p.status === 'completed') {
          return sum + (p.totalAmount || p.amount || 0);
        }
        return sum;
      }, 0);

      // Determine payment status based on total paid vs appointment total
      const appointmentTotal = appointment.totalAmount || 0;
      const paymentStatus = totalPaid >= appointmentTotal ? 'paid' : 'partial';

      // Update appointment payment status
      await storage.updateAppointment(appointmentId, {
        paymentStatus: paymentStatus,
      });

      // Fire automation only if fully paid
      if (paymentStatus === 'paid') {
        try {
          const appt = await storage.getAppointment(appointmentId);
          if (appt) {
            await triggerAfterPayment(appt, storage);
          }
        } catch (e) {
          LoggerService.error("Failed to trigger after_payment automation", { ...context, error: e });
        }
      }
    } else {
      // Not a split payment, mark as paid
      await storage.updateAppointment(appointmentId, {
        paymentStatus: 'paid',
        totalAmount: amount
      });

      // Fire automation for full payment
      try {
        const appt = await storage.getAppointment(appointmentId);
        if (appt) {
          await triggerAfterPayment(appt, storage);
        }
      } catch (e) {
        LoggerService.error("Failed to trigger after_payment automation", { ...context, error: e });
      }
    }

    // Create sales history for reports
    await createSalesHistoryRecord(storage, payment, 'appointment', { checkoutTime });

    // Create staff earnings record
    try {
      const service = await storage.getService(appointment.serviceId);
      const staffMember = await storage.getStaff(appointment.staffId);
      
      if (service && staffMember) {
        // Calculate staff earnings based on portion of payment
        const servicePortion = appointment.totalAmount > 0 ? (baseAmount / appointment.totalAmount) : 1;
        let earningsAmount = 0;
        let rateType = 'commission';
        let rateUsed = 0;
        let calculationDetails = '';

        switch (staffMember.commissionType) {
          case 'commission': {
            const commissionRate = staffMember.commissionRate || 0;
            earningsAmount = (service.price * servicePortion) * commissionRate;
            rateUsed = commissionRate;
            calculationDetails = JSON.stringify({
              type: 'commission',
              servicePrice: service.price,
              paymentPortion: servicePortion,
              commissionRate: commissionRate,
              earnings: earningsAmount
            });
            break;
          }
          case 'hourly': {
            const hourlyRate = staffMember.hourlyRate || 0;
            const serviceDuration = service.duration || 60;
            const hours = serviceDuration / 60;
            earningsAmount = (hourlyRate * hours) * servicePortion;
            rateType = 'hourly';
            rateUsed = hourlyRate;
            calculationDetails = JSON.stringify({
              type: 'hourly',
              servicePrice: service.price,
              paymentPortion: servicePortion,
              hourlyRate: hourlyRate,
              serviceDuration: serviceDuration,
              hours: hours,
              earnings: earningsAmount
            });
            break;
          }
          case 'fixed': {
            const fixedRate = staffMember.fixedRate || 0;
            earningsAmount = fixedRate * servicePortion;
            rateType = 'fixed';
            rateUsed = fixedRate;
            calculationDetails = JSON.stringify({
              type: 'fixed',
              servicePrice: service.price,
              paymentPortion: servicePortion,
              fixedRate: fixedRate,
              earnings: earningsAmount
            });
            break;
          }
        }

        await storage.createStaffEarning({
          staffId: staffMember.id,
          appointmentId: appointmentId,
          paymentId: payment.id,
          amount: earningsAmount,
          rateType: rateType,
          rateUsed: rateUsed,
          calculationDetails: calculationDetails,
          status: 'pending',
          paymentMethod: 'card',
          serviceName: service.name,
          servicePrice: service.price,
          earnedAt: checkoutTime
        });
      }
    } catch (e) {
      console.error('Failed to create staff earning record:', e);
    }

    LoggerService.logPayment("card_payment_confirmed", amount, { ...context, paymentId: payment.id });

    res.json({ 
      success: true, 
      payment,
      appointmentTotal: appointment.totalAmount,
      appointmentRemainingBalance: isSplitPayment ? Math.max(0, (appointment.totalAmount || 0) - (await storage.getAllPayments()).filter((p: any) => p.appointmentId === appointmentId && p.status === 'completed').reduce((sum: number, p: any) => sum + (p.totalAmount || p.amount || 0), 0)) : 0
    });
  }));

  // Confirm cash payment
  app.post("/api/confirm-cash-payment", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { appointmentId, amount, notes, tipAmount = 0, isSplitPayment = false } = req.body;

    LoggerService.logPayment("cash_payment", amount, context);

    // Get appointment details
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // Calculate base amount (total minus tip)
    const baseAmount = amount - tipAmount;

    // Create payment record with tip tracking
    const checkoutTime = new Date();
    const payment = await storage.createPayment({
      appointmentId,
      clientId: appointment.clientId,
      amount: baseAmount,
      tipAmount: tipAmount,
      totalAmount: amount,
      method: 'cash',
      status: 'completed',
      type: 'appointment_payment',
      notes: notes || 'Cash payment',
      processedAt: checkoutTime,
      paymentDate: checkoutTime, // Record the exact checkout time
    });

    // Only update appointment status to paid if this is not a split payment
    if (!isSplitPayment) {
      await storage.updateAppointment(appointmentId, {
        paymentStatus: 'paid',
        totalAmount: amount
      });
    }

    // Create sales history for reports
    await createSalesHistoryRecord(storage, payment, 'appointment', { checkoutTime: new Date() });

    // Create staff earnings record for payroll
    try {
      const service = await storage.getService(appointment.serviceId);
      const staffMember = await storage.getStaff(appointment.staffId);
      
      if (service && staffMember) {
        // Calculate staff earnings
        let earningsAmount = 0;
        let rateType = 'commission';
        let rateUsed = 0;
        let calculationDetails = '';

        switch (staffMember.commissionType) {
          case 'commission': {
            const commissionRate = staffMember.commissionRate || 0;
            earningsAmount = service.price * commissionRate;
            rateUsed = commissionRate;
            calculationDetails = JSON.stringify({
              type: 'commission',
              servicePrice: service.price,
              commissionRate: commissionRate,
              earnings: earningsAmount
            });
            break;
          }
          case 'hourly': {
            const hourlyRate = staffMember.hourlyRate || 0;
            const serviceDuration = service.duration || 60;
            const hours = serviceDuration / 60;
            earningsAmount = hourlyRate * hours;
            rateType = 'hourly';
            rateUsed = hourlyRate;
            calculationDetails = JSON.stringify({
              type: 'hourly',
              servicePrice: service.price,
              hourlyRate: hourlyRate,
              serviceDuration: serviceDuration,
              hours: hours,
              earnings: earningsAmount
            });
            break;
          }
          case 'fixed': {
            const fixedRate = staffMember.fixedRate || 0;
            earningsAmount = fixedRate;
            rateType = 'fixed';
            rateUsed = fixedRate;
            calculationDetails = JSON.stringify({
              type: 'fixed',
              servicePrice: service.price,
              fixedRate: fixedRate,
              earnings: earningsAmount
            });
            break;
          }
          case 'hourly_plus_commission': {
            const hourlyRate = staffMember.hourlyRate || 0;
            const commissionRate = staffMember.commissionRate || 0;
            const serviceDuration = service.duration || 60;
            const hours = serviceDuration / 60;
            const hourlyPortion = hourlyRate * hours;
            const commissionPortion = service.price * commissionRate;
            earningsAmount = hourlyPortion + commissionPortion;
            rateType = 'hourly_plus_commission';
            rateUsed = hourlyRate;
            calculationDetails = JSON.stringify({
              type: 'hourly_plus_commission',
              servicePrice: service.price,
              hourlyRate: hourlyRate,
              commissionRate: commissionRate,
              serviceDuration: serviceDuration,
              hours: hours,
              hourlyPortion: hourlyPortion,
              commissionPortion: commissionPortion,
              earnings: earningsAmount
            });
            break;
          }
          default:
            earningsAmount = 0;
            calculationDetails = JSON.stringify({
              type: 'unknown',
              servicePrice: service.price,
              earnings: 0
            });
        }

        // Create staff earnings record
        if (earningsAmount > 0) {
          await storage.createStaffEarnings({
            staffId: appointment.staffId,
            appointmentId: appointmentId,
            serviceId: appointment.serviceId,
            paymentId: payment.id,
            earningsAmount: earningsAmount,
            rateType: rateType,
            rateUsed: rateUsed,
            isCustomRate: false,
            servicePrice: service.price,
            calculationDetails: calculationDetails,
            earningsDate: new Date()
          });

          LoggerService.logPayment("staff_earnings_created", earningsAmount, { 
            ...context, 
            paymentId: payment.id, 
            staffId: appointment.staffId,
            appointmentId 
          });
        }
      }
    } catch (error) {
      LoggerService.error("Failed to create staff earnings record", { 
        ...context, 
        paymentId: payment.id, 
        appointmentId, 
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail the payment confirmation if earnings creation fails
    }

    LoggerService.logPayment("cash_payment_confirmed", amount, { ...context, paymentId: payment.id });

    // Fire automation for after payment
    try {
      const appt = await storage.getAppointment(appointmentId);
      if (appt) {
        await triggerAfterPayment(appt, storage);
      }
    } catch (e) {
      try { LoggerService.error("Failed to trigger after_payment automation (cash)", { ...context, paymentId: payment.id, error: e instanceof Error ? e.message : String(e) }); } catch {}
    }

    res.json({ success: true, payment });
  }));

  // Confirm gift card payment
  app.post("/api/confirm-gift-card-payment", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { appointmentId, giftCardCode, amount, notes, tipAmount = 0 } = req.body;

    LoggerService.logPayment("gift_card_payment", amount, context);

    // Validate gift card
    const giftCard = await storage.getGiftCardByCode(giftCardCode);
    if (!giftCard) {
      throw new ValidationError("Invalid gift card code");
    }

    if (giftCard.currentBalance < amount) {
      throw new ValidationError("Insufficient gift card balance");
    }

    // Get appointment details
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      throw new NotFoundError("Appointment");
    }

    // Calculate base amount (total minus tip)
    const baseAmount = amount - tipAmount;

    // Create payment record with tip tracking
    const payment = await storage.createPayment({
      appointmentId,
      clientId: appointment.clientId,
      amount: baseAmount,
      tipAmount: tipAmount,
      totalAmount: amount,
      method: 'gift_card',
      status: 'completed',
      notes: notes || `Gift card payment - Code: ${giftCardCode}`,
      processedAt: new Date(),
    });

    // Update gift card balance
    await storage.updateGiftCard(giftCard.id, {
      currentBalance: giftCard.currentBalance - amount,
    });

    // Get all payments for this appointment to calculate total paid
    const allPayments = await storage.getAllPayments();
    const appointmentPayments = allPayments.filter((p: any) => p.appointmentId === appointmentId);
    const totalPaid = appointmentPayments.reduce((sum: number, p: any) => {
      if (p.status === 'completed') {
        return sum + (p.amount || 0);
      }
      return sum;
    }, 0);

    // Determine payment status based on total paid vs appointment total
    const appointmentTotal = appointment.totalAmount || 0;
    const paymentStatus = totalPaid >= appointmentTotal ? 'paid' : 'partial';

    // Update appointment payment status
    await storage.updateAppointment(appointmentId, {
      paymentStatus: paymentStatus,
      // Note: paidAmount field doesn't exist in appointments table, but we're tracking via payments
    });

    // Create sales history for reports
    await createSalesHistoryRecord(storage, payment, 'appointment', { checkoutTime: new Date() });

    // Create staff earnings record for payroll
    try {
      const service = await storage.getService(appointment.serviceId);
      const staffMember = await storage.getStaff(appointment.staffId);
      
      if (service && staffMember) {
        // Calculate staff earnings
        let earningsAmount = 0;
        let rateType = 'commission';
        let rateUsed = 0;
        let calculationDetails = '';

        switch (staffMember.commissionType) {
          case 'commission': {
            const commissionRate = staffMember.commissionRate || 0;
            earningsAmount = service.price * commissionRate;
            rateUsed = commissionRate;
            calculationDetails = JSON.stringify({
              type: 'commission',
              servicePrice: service.price,
              commissionRate: commissionRate,
              earnings: earningsAmount
            });
            break;
          }
          case 'hourly': {
            const hourlyRate = staffMember.hourlyRate || 0;
            const serviceDuration = service.duration || 60;
            const hours = serviceDuration / 60;
            earningsAmount = hourlyRate * hours;
            rateType = 'hourly';
            rateUsed = hourlyRate;
            calculationDetails = JSON.stringify({
              type: 'hourly',
              servicePrice: service.price,
              hourlyRate: hourlyRate,
              serviceDuration: serviceDuration,
              hours: hours,
              earnings: earningsAmount
            });
            break;
          }
          case 'fixed': {
            const fixedRate = staffMember.fixedRate || 0;
            earningsAmount = fixedRate;
            rateType = 'fixed';
            rateUsed = fixedRate;
            calculationDetails = JSON.stringify({
              type: 'fixed',
              servicePrice: service.price,
              fixedRate: fixedRate,
              earnings: earningsAmount
            });
            break;
          }
          case 'hourly_plus_commission': {
            const hourlyRate = staffMember.hourlyRate || 0;
            const commissionRate = staffMember.commissionRate || 0;
            const serviceDuration = service.duration || 60;
            const hours = serviceDuration / 60;
            const hourlyPortion = hourlyRate * hours;
            const commissionPortion = service.price * commissionRate;
            earningsAmount = hourlyPortion + commissionPortion;
            rateType = 'hourly_plus_commission';
            rateUsed = hourlyRate;
            calculationDetails = JSON.stringify({
              type: 'hourly_plus_commission',
              servicePrice: service.price,
              hourlyRate: hourlyRate,
              commissionRate: commissionRate,
              serviceDuration: serviceDuration,
              hours: hours,
              hourlyPortion: hourlyPortion,
              commissionPortion: commissionPortion,
              earnings: earningsAmount
            });
            break;
          }
          default:
            earningsAmount = 0;
            calculationDetails = JSON.stringify({
              type: 'unknown',
              servicePrice: service.price,
              earnings: 0
            });
        }

        // Create staff earnings record
        if (earningsAmount > 0) {
          await storage.createStaffEarnings({
            staffId: appointment.staffId,
            appointmentId: appointmentId,
            serviceId: appointment.serviceId,
            paymentId: payment.id,
            earningsAmount: earningsAmount,
            rateType: rateType,
            rateUsed: rateUsed,
            isCustomRate: false,
            servicePrice: service.price,
            calculationDetails: calculationDetails,
            earningsDate: new Date()
          });

          LoggerService.logPayment("staff_earnings_created", earningsAmount, { 
            ...context, 
            paymentId: payment.id, 
            staffId: appointment.staffId,
            appointmentId 
          });
        }
      }
    } catch (error) {
      LoggerService.error("Failed to create staff earnings record", { 
        ...context, 
        paymentId: payment.id, 
        appointmentId, 
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail the payment confirmation if earnings creation fails
    }

    LoggerService.logPayment("gift_card_payment_confirmed", amount, { ...context, paymentId: payment.id });

    // Fire automation for after payment (only if fully paid)
    if (paymentStatus === 'paid') {
      try {
        const appt = await storage.getAppointment(appointmentId);
        if (appt) {
          await triggerAfterPayment(appt, storage);
        }
      } catch (e) {
        try { LoggerService.error("Failed to trigger after_payment automation (gift card)", { ...context, paymentId: payment.id, error: e instanceof Error ? e.message : String(e) }); } catch {}
      }
    }

    res.json({ 
      success: true, 
      payment,
      giftCardRemainingBalance: giftCard.currentBalance - amount,
      appointmentRemainingBalance: Math.max(0, appointmentTotal - totalPaid),
      totalPaid,
      appointmentTotal,
      paymentStatus
    });
  }));

  // Add gift card (physical card sale)
  app.post("/api/add-gift-card", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { 
      code, 
      balance, 
      clientId, 
      notes,
      recipientName,
      recipientEmail,
      recipientPhone,
      purchaserName,
      sendReceipt,
      receiptMethod,
      paymentMethod,
      paymentReference 
    } = req.body;

    LoggerService.info("Adding gift card", { ...context, code, balance, clientId, recipientName, purchaserName });

    // Check if gift card already exists
    const existingGiftCard = await storage.getGiftCardByCode(code);
    if (existingGiftCard) {
      throw new ConflictError("Gift card with this code already exists. To add funds to an existing gift card, please use the 'Reload Gift Card' form instead.");
    }

    const giftCard = await storage.createGiftCard({
      code,
      initialAmount: balance,
      currentBalance: balance,
      issuedToName: recipientName || null,
      issuedToEmail: recipientEmail || null,
      purchasedByUserId: 1, // Default user for gift card purchases
      status: 'active',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiry
    });

    // Create payment record if payment method provided (for physical card sales)
    if (paymentMethod) {
      const payment = await storage.createPayment({
        amount: balance,
        totalAmount: balance,
        clientId: clientId || 1, // Default client for gift card purchases
        method: paymentMethod, // cash, card, or terminal
        status: 'completed',
        notes: `Gift card sale - Code: ${code} - Recipient: ${recipientName || 'N/A'} - Purchaser: ${purchaserName || 'N/A'}`,
        processedAt: new Date(),
        helcimPaymentId: paymentReference || null,
      });

      // Create sales history record for reports
      await createSalesHistoryRecord(storage, payment, 'gift_card', {
        giftCardId: giftCard.id,
        giftCardCode: code,
        initialAmount: balance,
        recipientName,
        purchaserName,
      });
    }

    // Send receipt if requested
    if (sendReceipt && receiptMethod) {
      try {
        LoggerService.info("Sending gift card receipt", {
          ...context,
          receiptMethod,
          recipientEmail,
          recipientPhone,
          code
        });

        // Send email receipt
        if ((receiptMethod === "email" || receiptMethod === "both") && recipientEmail) {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
                .gift-code { background: #f7f7f7; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
                .code { font-size: 28px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
                .amount { font-size: 36px; color: #667eea; margin: 15px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 25px; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>💳 Gift Card Purchase</h1>
                </div>
                <div class="content">
                  <h2>Dear ${recipientName || 'Valued Customer'},</h2>
                  <p>${purchaserName ? `${purchaserName} has purchased a gift card for you!` : 'A gift card has been purchased for you!'}</p>
                  
                  <div class="gift-code">
                    <p style="margin: 0;">Your Gift Card Number:</p>
                    <div class="code">${code}</div>
                    <div class="amount">$${balance}</div>
                  </div>
                  
                  <p><strong>How to use your gift card:</strong></p>
                  <ul>
                    <li>Present this card at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist</li>
                    <li>You can use it for any of our services or products</li>
                    <li>This card expires in one year from today</li>
                    <li>The current balance can be checked at any time</li>
                  </ul>
                  
                  <center>
                    <a href="https://one0-22-25.onrender.com/booking" class="button">Book Your Appointment</a>
                  </center>
                  
                  <div class="footer">
                    <p>Questions? Contact us at hello@headspaglo.com</p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `;

          const emailText = `
💳 Gift Card Purchase

Dear ${recipientName || 'Valued Customer'},

${purchaserName ? `${purchaserName} has purchased a gift card for you!` : 'A gift card has been purchased for you!'}

Gift Card Number: ${code}
Amount: $${balance}

How to use your gift card:
- Present this card at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist
- You can use it for any of our services or products
- This card expires in one year from today
- The current balance can be checked at any time

Book your appointment at https://one0-22-25.onrender.com/booking

Questions? Contact us at hello@headspaglo.com
          `;

          await sendEmail({
            to: recipientEmail,
            from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
            subject: `💳 Gift Card from ${purchaserName || 'Glo Head Spa'}`,
            html: emailHtml,
            text: emailText,
          });

          LoggerService.info("Gift card email sent", { 
            ...context, 
            recipientEmail,
            code 
          });
        }

        // Send SMS receipt
        if ((receiptMethod === "sms" || receiptMethod === "both") && recipientPhone) {
          const smsMessage = `💳 Gift Card from ${purchaserName || 'Glo Head Spa'}!\n\n` +
            `Hi ${recipientName || 'there'}, you've received a gift card!\n\n` +
            `Card Number: ${code}\n` +
            `Amount: $${balance}\n\n` +
            `Use at any location: Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist.\n\n` +
            `Book: https://one0-22-25.onrender.com/booking`;

          await sendSMS(recipientPhone, smsMessage);

          LoggerService.info("Gift card SMS sent", {
            ...context,
            recipientPhone,
            code
          });
        }
      } catch (error) {
        LoggerService.error("Failed to send gift card receipt", {
          ...context,
          error
        });
        // Don't fail the purchase if receipt fails
      }
    }

    LoggerService.info("Gift card added", { 
      ...context, 
      giftCardId: giftCard.id,
      paymentMethod,
      paymentReference 
    });

    res.status(201).json(giftCard);
  }));

  // Get saved gift cards
  app.get("/api/saved-gift-cards", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { clientId } = req.query;

    LoggerService.debug("Fetching saved gift cards", { ...context, clientId });

    const giftCards = clientId 
      ? await storage.getSavedGiftCardsByClient(parseInt(clientId as string))
      : await storage.getAllGiftCards();

    res.json(giftCards);
  }));

  // Delete saved gift card
  app.delete("/api/saved-gift-cards/:id", asyncHandler(async (req: Request, res: Response) => {
    const giftCardId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Deleting gift card", { ...context, giftCardId });

    const giftCard = await storage.getGiftCard(giftCardId);
    if (!giftCard) {
      throw new NotFoundError("Gift card");
    }

    await storage.deleteGiftCard(giftCardId);

    res.json({ success: true, message: "Gift card deleted successfully" });
  }));

  // Purchase gift certificate
  app.post("/api/gift-certificates/purchase", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { 
      recipientName, 
      recipientEmail,
      recipientPhone, 
      amount, 
      message, 
      purchaserName, 
      purchaserEmail,
      occasion,
      deliveryMethod = "email", // Default to email if not specified
      paymentMethod,
      paymentReference,
      paymentAmount 
    } = req.body;

    LoggerService.logPayment("gift_certificate_purchase", amount, context);

    // Generate unique gift certificate code
    const code = `GC${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create gift card (used for gift certificates)
    const giftCard = await storage.createGiftCard({
      code,
      issuedToName: recipientName,
      issuedToEmail: recipientEmail,
      initialAmount: amount,
      currentBalance: amount,
      purchasedByUserId: 1, // Default user for gift certificate purchases
      status: 'active',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      // notes field doesn't exist on gift cards - store message in payment notes
    });

    // Create payment record with actual payment method
    const payment = await storage.createPayment({
      amount,
      totalAmount: amount,
      clientId: 1, // Default client for gift certificate purchases
      method: paymentMethod || 'cash', // Use actual payment method (cash, card, terminal)
      status: 'completed',
      notes: `Gift certificate purchase - Code: ${code} - Recipient: ${recipientName}${message ? ` - Message: ${message}` : ''} - Occasion: ${occasion}`,
      processedAt: new Date(),
      helcimPaymentId: paymentReference || null, // Store payment reference
    });

    // Create sales history record for reports
    await createSalesHistoryRecord(storage, payment, 'gift_certificate', {
      giftCardId: giftCard.id,
      giftCardCode: code,
      recipientName,
      recipientEmail,
      purchaserName,
      purchaserEmail,
      message,
      occasion,
    });

    // Define occasion templates for both email and SMS
    const occasionTemplates: Record<string, { emoji: string; template: string }> = {
      birthday: { emoji: "🎂", template: "Wishing you a wonderful birthday filled with joy and relaxation!" },
      just_because: { emoji: "💝", template: "Just a little something to brighten your day!" },
      congratulations: { emoji: "🎉", template: "Congratulations on your special achievement!" },
      thank_you: { emoji: "🙏", template: "Thank you for being amazing!" },
      anniversary: { emoji: "💕", template: "Happy Anniversary! Here's to many more wonderful years together!" },
      holiday: { emoji: "🎄", template: "Wishing you a joyful holiday season!" },
      mothers_day: { emoji: "🌸", template: "Happy Mother's Day to an incredible mom!" },
      fathers_day: { emoji: "👔", template: "Happy Father's Day! You deserve some relaxation!" },
      graduation: { emoji: "🎓", template: "Congratulations on your graduation! You did it!" },
      wedding: { emoji: "💐", template: "Wishing you both a lifetime of love and happiness!" },
      baby_shower: { emoji: "👶", template: "Congratulations on your new arrival! Enjoy some well-deserved pampering!" },
      get_well: { emoji: "🌻", template: "Wishing you a speedy recovery and sending healing thoughts your way!" },
    };

    const occasionInfo = occasionTemplates[occasion] || { emoji: "🎁", template: "Enjoy your gift certificate!" };

    // Send gift certificate email if requested
    if ((deliveryMethod === "email" || deliveryMethod === "both") && recipientEmail) {
      try {
        LoggerService.info("Attempting to send gift certificate email", {
          ...context,
          recipientEmail,
          occasion,
          code
        });

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
            .gift-code { background: #f7f7f7; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
            .code { font-size: 28px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
            .amount { font-size: 36px; color: #667eea; margin: 15px 0; }
            .message-box { background: #fdf4ff; padding: 15px; border-left: 4px solid #764ba2; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 25px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${occasionInfo.emoji} Gift Certificate</h1>
            </div>
            <div class="content">
              <h2>Dear ${recipientName},</h2>
              <p><strong>${occasionInfo.template}</strong></p>
              <p>${purchaserName} has sent you a gift certificate that can be used at any of our locations!</p>
              
              <div class="gift-code">
                <p style="margin: 0;">Your Gift Certificate Code:</p>
                <div class="code">${code}</div>
                <div class="amount">$${amount}</div>
              </div>
              
              ${message ? `
              <div class="message-box">
                <p style="margin: 0;"><strong>Personal Message from ${purchaserName}:</strong></p>
                <p style="margin: 10px 0 0 0;">${message}</p>
              </div>
              ` : ''}
              
              <p><strong>How to use your gift certificate:</strong></p>
              <ul>
                <li>Present this code at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist</li>
                <li>You can use it for any of our services or products</li>
                <li>This certificate expires in one year from today</li>
                <li>The current balance can be checked at any time</li>
              </ul>
              
              <center>
                <a href="https://one0-22-25.onrender.com/booking" class="button">Book Your Appointment</a>
              </center>
              
              <div class="footer">
                <p>Questions? Contact us at hello@headspaglo.com</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
${occasionInfo.emoji} Gift Certificate

Dear ${recipientName},

${occasionInfo.template}

${purchaserName} has sent you a gift certificate that can be used at any of our locations!

Gift Certificate Code: ${code}
Amount: $${amount}

${message ? `Personal Message from ${purchaserName}: ${message}` : ''}

How to use your gift certificate:
- Present this code at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist
- You can use it for any of our services or products
- This certificate expires in one year from today
- The current balance can be checked at any time

Book your appointment at https://one0-22-25.onrender.com/booking

Questions? Contact us at hello@headspaglo.com
      `;

      const emailSent = await sendEmail({
        to: recipientEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
        subject: `${occasionInfo.emoji} Gift Certificate from ${purchaserName}`,
        html: emailHtml,
        text: emailText,
      });

      if (emailSent) {
        LoggerService.info("Gift certificate email sent successfully", { 
          ...context, 
          recipientEmail,
          occasion,
          code 
        });
      } else {
        LoggerService.warn("Gift certificate email send returned false", {
          ...context,
          recipientEmail,
          occasion,
          code
        });
      }
      } catch (emailError) {
        LoggerService.error("Failed to send gift certificate email", { 
          ...context, 
          error: emailError 
        });
        // Don't fail the purchase if email fails
      }
    }

    // Send SMS if requested
    if ((deliveryMethod === "sms" || deliveryMethod === "both") && recipientPhone) {
      try {
        LoggerService.info("Attempting to send gift certificate SMS", {
          ...context,
          recipientPhone,
          occasion,
          code
        });

        const smsMessage = `${occasionInfo.emoji} Gift Certificate from ${purchaserName}!\n\n` +
          `Hi ${recipientName}, ${occasionInfo.template}\n\n` +
          `Gift Code: ${code}\n` +
          `Amount: $${amount}\n\n` +
          `${message ? `Message: ${message}\n\n` : ''}` +
          `Use at any location: Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist.\n\n` +
          `Book: https://one0-22-25.onrender.com/booking`;

        const smsResult = await sendSMS(recipientPhone, smsMessage);

        if (smsResult.success) {
          LoggerService.info("Gift certificate SMS sent successfully", {
            ...context,
            recipientPhone,
            occasion,
            code,
            messageId: smsResult.messageId
          });
        } else {
          LoggerService.warn("Gift certificate SMS send failed", {
            ...context,
            recipientPhone,
            occasion,
            code,
            error: smsResult.error
          });
        }
      } catch (smsError) {
        LoggerService.error("Failed to send gift certificate SMS", {
          ...context,
          error: smsError
        });
        // Don't fail the purchase if SMS fails
      }
    }

    LoggerService.logPayment("gift_certificate_created", amount, { 
      ...context, 
      giftCardId: giftCard.id,
      paymentMethod,
      paymentReference,
      occasion 
    });

    res.status(201).json({ success: true, giftCard, payment });
  }));

  // Get gift card balance
  app.get("/api/gift-card-balance/:code", asyncHandler(async (req: Request, res: Response) => {
    const code = req.params.code;
    const context = getLogContext(req);

    LoggerService.debug("Checking gift card balance", { ...context, code });

    const giftCard = await storage.getGiftCardByCode(code);
    if (!giftCard) {
      throw new NotFoundError("Gift card");
    }

    res.json({ 
      balance: giftCard.currentBalance, 
      isActive: giftCard.status === 'active',
      initialAmount: giftCard.initialAmount,
      status: giftCard.status,
      expiryDate: giftCard.expiryDate
    });
  }));

  // Reload gift card (add funds to existing card)
  app.post("/api/reload-gift-card", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { 
      code, 
      amount, 
      paymentMethod,
      paymentReference,
      notes 
    } = req.body;

    LoggerService.info("Reloading gift card", { ...context, code, amount });

    // Validate amount
    if (!amount || amount <= 0) {
      throw new ValidationError("Amount must be greater than 0");
    }

    // Find existing gift card
    const giftCard = await storage.getGiftCardByCode(code);
    if (!giftCard) {
      throw new NotFoundError("Gift card not found");
    }

    // Check if gift card is active
    if (giftCard.status !== 'active') {
      throw new ValidationError(`Cannot reload gift card with status: ${giftCard.status}`);
    }

    // Calculate new balance
    const newBalance = giftCard.currentBalance + amount;

    // Update gift card balance
    await storage.updateGiftCard(giftCard.id, {
      currentBalance: newBalance,
      // Update initial amount if new balance exceeds it (for tracking purposes)
      initialAmount: Math.max(giftCard.initialAmount, newBalance),
    });

    // Create transaction record
    await storage.createGiftCardTransaction({
      giftCardId: giftCard.id,
      transactionType: 'reload',
      amount: amount,
      balanceAfter: newBalance,
      notes: notes || `Gift card reload - Added $${amount.toFixed(2)}`,
    });

    // Create payment record if payment method provided
    if (paymentMethod) {
      const payment = await storage.createPayment({
        amount: amount,
        totalAmount: amount,
        clientId: giftCard.purchasedByUserId || 1, // Use original purchaser if available
        method: paymentMethod,
        status: 'completed',
        notes: `Gift card reload - Code: ${code}`,
        processedAt: new Date(),
        helcimPaymentId: paymentReference || null,
      });

      // Create sales history record for reports
      await createSalesHistoryRecord(storage, payment, 'gift_card_reload', {
        giftCardId: giftCard.id,
        giftCardCode: code,
        reloadAmount: amount,
        newBalance: newBalance,
      });

      LoggerService.logPayment("gift_card_reloaded", amount, { 
        ...context, 
        giftCardId: giftCard.id,
        paymentMethod,
        paymentReference,
        newBalance
      });
    }

    LoggerService.info("Gift card reloaded successfully", { 
      ...context, 
      giftCardId: giftCard.id,
      previousBalance: giftCard.currentBalance,
      newBalance,
      amountAdded: amount
    });

    res.json({ 
      success: true,
      giftCard: {
        ...giftCard,
        currentBalance: newBalance,
        initialAmount: Math.max(giftCard.initialAmount, newBalance),
      },
      previousBalance: giftCard.currentBalance,
      amountAdded: amount,
      newBalance
    });
  }));

  // POS transactions - create payment + sales history (used by POS UI)
  app.post("/api/transactions", asyncHandler(async (req: Request, res: Response) => {
    const body = req.body || {};
    const {
      clientId,
      items = [],
      subtotal = 0,
      tax = 0,
      tipAmount = 0,
      total = 0,
      paymentMethod = 'card',
      description = 'POS Sale',
      helcimPaymentId,
      helcimTransactionId,
      cardLast4,
      terminalPaymentMethod,
    } = body;

    // Create payment record
    const payment = await storage.createPayment({
      clientId: clientId || 1, // Fallback to default client if not provided
      amount: subtotal || total,
      tipAmount: tipAmount || 0,
      totalAmount: total || (subtotal + tax + (tipAmount || 0)),
      method: paymentMethod || 'card',
      status: 'completed',
      type: 'pos_payment',
      description,
      helcimPaymentId: helcimPaymentId || helcimTransactionId || body.paymentId || null,
      paymentDate: new Date(),
      processedAt: new Date(),
      // Optional fields left null: appointmentId, clientMembershipId, notes
    } as any);

    // Build sales history details
    const now = new Date();
    const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
    const monthYear = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1)/3)}`;

    const productItems = (Array.isArray(items) ? items : []).filter((i: any) => i?.type === 'product');
    const serviceItems = (Array.isArray(items) ? items : []).filter((i: any) => i?.type === 'service');

    const productIds = JSON.stringify(productItems.map((i: any) => i?.item?.id).filter(Boolean));
    const productNames = JSON.stringify(productItems.map((i: any) => i?.item?.name).filter(Boolean));
    const productQuantities = JSON.stringify(productItems.map((i: any) => i?.quantity ?? 1));
    const productUnitPrices = JSON.stringify(productItems.map((i: any) => i?.item?.price ?? 0));

    const serviceIds = JSON.stringify(serviceItems.map((i: any) => i?.item?.id).filter(Boolean));
    const serviceNames = JSON.stringify(serviceItems.map((i: any) => i?.item?.name).filter(Boolean));

    await storage.createSalesHistory({
      transactionType: 'pos_sale',
      transactionDate: now,
      paymentId: payment.id,
      totalAmount: payment.totalAmount,
      paymentMethod: payment.method,
      paymentStatus: payment.status,
      
      clientId: payment.clientId,
      clientName: null,
      clientEmail: null,
      clientPhone: null,
      
      staffId: null,
      staffName: null,
      
      appointmentId: null,
      serviceIds,
      serviceNames,
      serviceTotalAmount: serviceItems.reduce((sum: number, i: any) => sum + (i?.total ?? 0), 0),
      
      productIds,
      productNames,
      productQuantities,
      productUnitPrices,
      productTotalAmount: productItems.reduce((sum: number, i: any) => sum + (i?.total ?? 0), 0),
      
      membershipId: null,
      membershipName: null,
      membershipDuration: null,
      
      taxAmount: tax || 0,
      tipAmount: tipAmount || 0,
      discountAmount: 0,
      
      businessDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()) as any,
      dayOfWeek,
      monthYear,
      quarter,
      
      helcimPaymentId: payment.helcimPaymentId || null,
      
      createdBy: null,
      notes: description,
    } as any);

    return res.json({
      success: true,
      transactionId: payment.id,
      total: payment.totalAmount,
      paymentMethod: payment.method,
      cardLast4: cardLast4 || null,
      terminalPaymentMethod: terminalPaymentMethod || null,
    });
  }));

  // Legacy create-payment endpoint retained for cash only; card moves to HelcimPay.js
  app.post("/api/create-payment", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { sourceId, amount, tipAmount = 0, currency = 'USD', appointmentId, clientId, cardData } = req.body;

    LoggerService.logPayment("helcim_payment_create", amount, context);

    try {
      // Import HelcimService
      const { HelcimService } = await import('../services/helcim-service');

      // Card payments are now handled via HelcimPay.js. This legacy route should not process cards.
      throw new ExternalServiceError('Helcim', 'Card payments are handled via HelcimPay.js. Use /api/helcim-pay/initialize.');

      // This code is unreachable due to the throw above, but kept for reference
      // LoggerService.logPayment("helcim_payment_success", amount, { ...context, paymentId: dbPayment.id });

      // res.json({ 
      //   success: true, 
      //   payment: dbPayment, 
      //   helcimPayment: {
      //     id: helcimResponse.paymentId,
      //     status: helcimResponse.status,
      //     transactionId: helcimResponse.transactionId
      //   }
      // });
    } catch (error: any) {
      LoggerService.logPayment("helcim_payment_failed", amount, { ...context, error });
      throw new ExternalServiceError('Helcim', error.message);
    }
  }));



  // Confirm payment
  app.post("/api/confirm-payment", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { paymentId, appointmentId, helcimTransactionId } = req.body;

    LoggerService.logPayment("payment_confirmation", undefined, context);

    // Get payment details
    const payment = await storage.getPayment(paymentId);
    if (!payment) {
      throw new NotFoundError("Payment");
    }

    // CRITICAL: Only mark as completed if there's a valid Helcim transaction ID
    // or if it's a cash/gift_card payment. Otherwise keep as pending.
    const isCashPayment = payment.method === 'cash' || payment.method === 'gift_card';
    const hasValidHelcimId = helcimTransactionId || payment.helcimPaymentId;
    
    const checkoutTime = new Date();
    const updatedPayment = await storage.updatePayment(paymentId, {
      status: isCashPayment || hasValidHelcimId ? 'completed' : 'pending',
      paymentDate: checkoutTime, // Record the exact checkout time
      processedAt: checkoutTime, // Also record processing time if not set
      ...(helcimTransactionId ? { helcimPaymentId: helcimTransactionId } : {})
    });
    
    // CRITICAL: Create session for Helcim Pay.js payment confirmations
    if (helcimTransactionId && paymentId) {
      try {
        const invoiceNumber = `INV${String(paymentId).padStart(6, '0')}`;
        const terminalService = (app as any).__terminalService || 
                               (storage as any).__terminalService;
        if (terminalService && terminalService.sessionStore) {
          const sessionData = {
            startedAt: Date.now(),
            locationId: 'default',
            deviceCode: 'HELCIM_PAYJS',
            totalAmount: payment.totalAmount || payment.amount,
            baseAmount: payment.amount,
            appointmentId: appointmentId || payment.appointmentId,
            paymentId: paymentId
          };
          terminalService.sessionStore.set(invoiceNumber, sessionData);
          // Also store by transaction ID for better matching
          terminalService.sessionStore.set(helcimTransactionId, sessionData);
          console.log(`💾 Created session for confirmed payment: ${invoiceNumber} -> ${helcimTransactionId}`);
        }
        
        // Check if webhook already arrived for this transaction
        if (terminalService && terminalService.webhookStore) {
          const cachedWebhook = terminalService.webhookStore.get(String(helcimTransactionId)) ||
                               terminalService.webhookStore.get(`ORPHAN_${helcimTransactionId}`);
          
          if (cachedWebhook && cachedWebhook.status === 'completed') {
            console.log(`✅ Found completed webhook that arrived early during confirmation: ${helcimTransactionId}`);
            // Update payment status to completed
            await storage.updatePayment(paymentId, {
              status: 'completed',
              processedAt: new Date()
            });
            
            // Clean up orphan entry
            terminalService.webhookStore.delete(`ORPHAN_${helcimTransactionId}`);
            
            // Cache under invoice number
            terminalService.webhookStore.set(invoiceNumber, cachedWebhook);
          }
        }
      } catch (sessionErr) {
        console.warn('Could not create session for webhook matching:', sessionErr);
      }
    }

      // Update appointment payment status if appointmentId provided
    if (appointmentId) {
      await storage.updateAppointment(appointmentId, {
        paymentStatus: 'paid',
        totalAmount: payment.amount
      });

      // Create staff earnings record for payroll
      try {
        const appointment = await storage.getAppointment(appointmentId);
        if (appointment) {
          const service = await storage.getService(appointment.serviceId);
          const staffMember = await storage.getStaff(appointment.staffId);
          
          if (service && staffMember) {
            // Calculate staff earnings
            let earningsAmount = 0;
            let rateType = 'commission';
            let rateUsed = 0;
            let calculationDetails = '';

            switch (staffMember.commissionType) {
              case 'commission': {
                const commissionRate = staffMember.commissionRate || 0;
                earningsAmount = service.price * commissionRate;
                rateUsed = commissionRate;
                calculationDetails = JSON.stringify({
                  type: 'commission',
                  servicePrice: service.price,
                  commissionRate: commissionRate,
                  earnings: earningsAmount
                });
                break;
              }
              case 'hourly': {
                const hourlyRate = staffMember.hourlyRate || 0;
                const serviceDuration = service.duration || 60;
                const hours = serviceDuration / 60;
                earningsAmount = hourlyRate * hours;
                rateType = 'hourly';
                rateUsed = hourlyRate;
                calculationDetails = JSON.stringify({
                  type: 'hourly',
                  servicePrice: service.price,
                  hourlyRate: hourlyRate,
                  serviceDuration: serviceDuration,
                  hours: hours,
                  earnings: earningsAmount
                });
                break;
              }
              case 'fixed': {
                const fixedRate = staffMember.fixedRate || 0;
                earningsAmount = fixedRate;
                rateType = 'fixed';
                rateUsed = fixedRate;
                calculationDetails = JSON.stringify({
                  type: 'fixed',
                  servicePrice: service.price,
                  fixedRate: fixedRate,
                  earnings: earningsAmount
                });
                break;
              }
              case 'hourly_plus_commission': {
                const hourlyRate = staffMember.hourlyRate || 0;
                const commissionRate = staffMember.commissionRate || 0;
                const serviceDuration = service.duration || 60;
                const hours = serviceDuration / 60;
                const hourlyPortion = hourlyRate * hours;
                const commissionPortion = service.price * commissionRate;
                earningsAmount = hourlyPortion + commissionPortion;
                rateType = 'hourly_plus_commission';
                rateUsed = hourlyRate;
                calculationDetails = JSON.stringify({
                  type: 'hourly_plus_commission',
                  servicePrice: service.price,
                  hourlyRate: hourlyRate,
                  commissionRate: commissionRate,
                  serviceDuration: serviceDuration,
                  hours: hours,
                  hourlyPortion: hourlyPortion,
                  commissionPortion: commissionPortion,
                  earnings: earningsAmount
                });
                break;
              }
              default:
                earningsAmount = 0;
                calculationDetails = JSON.stringify({
                  type: 'unknown',
                  servicePrice: service.price,
                  earnings: 0
                });
            }

            // Create staff earnings record
            if (earningsAmount > 0) {
              await storage.createStaffEarnings({
                staffId: appointment.staffId,
                appointmentId: appointmentId,
                serviceId: appointment.serviceId,
                paymentId: payment.id,
                earningsAmount: earningsAmount,
                rateType: rateType,
                rateUsed: rateUsed,
                isCustomRate: false,
                servicePrice: service.price,
                calculationDetails: calculationDetails,
                earningsDate: new Date()
              });

              LoggerService.logPayment("staff_earnings_created", earningsAmount, { 
                ...context, 
                paymentId, 
                staffId: appointment.staffId,
                appointmentId 
              });
            }
          }
        }
      } catch (error) {
        LoggerService.error("Failed to create staff earnings record", { 
          ...context, 
          paymentId, 
          appointmentId, 
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't fail the payment confirmation if earnings creation fails
      }
    }

    // Create sales history for reports (appointment payments)
    if (appointmentId) {
      await createSalesHistoryRecord(storage, updatedPayment, 'appointment');
    }

    // Log the appropriate status based on actual payment state
    if (isCashPayment || hasValidHelcimId) {
      LoggerService.logPayment("payment_confirmed", payment.amount, { ...context, paymentId });
    } else {
      LoggerService.logPayment("payment_pending_helcim", payment.amount, { ...context, paymentId, reason: 'Missing Helcim transaction ID' });
    }

    // Fire automation ONLY if actually transitioning to completed with valid payment
    try {
      const actuallyCompleted = (isCashPayment || hasValidHelcimId) && String(payment.status) !== 'completed';
      const apptId = appointmentId || (payment as any)?.appointmentId;
      if (actuallyCompleted && apptId) {
        const appt = await storage.getAppointment(apptId);
        if (appt) {
          await triggerAfterPayment(appt, storage);
        }
      }
    } catch (e) {
      try { LoggerService.error("Failed to trigger after_payment automation (confirm)", { ...context, paymentId, error: e instanceof Error ? e.message : String(e) }); } catch {}
    }

    res.json({ success: true, payment: updatedPayment });
  }));

  // Get saved payment methods
  app.get("/api/saved-payment-methods", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { clientId } = req.query;

    LoggerService.debug("Fetching saved payment methods", { ...context, clientId });

    const paymentMethods = clientId 
      ? await storage.getSavedPaymentMethodsByClient(parseInt(clientId as string))
      : await storage.getSavedPaymentMethodsByClient(0); // Get all by using 0 as clientId

    res.json(paymentMethods);
  }));

  // Save payment method
  app.post("/api/saved-payment-methods", validateRequest(insertSavedPaymentMethodSchema), asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const paymentMethodData = req.body;

    LoggerService.info("Saving payment method", { ...context, clientId: paymentMethodData.clientId });

    const paymentMethod = await storage.createSavedPaymentMethod(paymentMethodData);

    res.status(201).json(paymentMethod);
  }));

  // Delete saved payment method
  app.delete("/api/saved-payment-methods/:id", asyncHandler(async (req: Request, res: Response) => {
    const paymentMethodId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Deleting saved payment method", { ...context, paymentMethodId });

    const paymentMethod = await storage.getSavedPaymentMethod(paymentMethodId);
    if (!paymentMethod) {
      throw new NotFoundError("Payment method");
    }

    await storage.deleteSavedPaymentMethod(paymentMethodId);

    res.json({ success: true, message: "Payment method deleted successfully" });
  }));

  // Set default payment method
  app.put("/api/saved-payment-methods/:id/default", asyncHandler(async (req: Request, res: Response) => {
    const paymentMethodId = parseInt(req.params.id);
    const context = getLogContext(req);

    LoggerService.info("Setting default payment method", { ...context, paymentMethodId });

    const paymentMethod = await storage.getSavedPaymentMethod(paymentMethodId);
    if (!paymentMethod) {
      throw new NotFoundError("Payment method");
    }

    // Remove default from other payment methods for this client
    await storage.setDefaultPaymentMethod(paymentMethod.clientId, paymentMethodId);

    // Set this payment method as default
    const updatedPaymentMethod = await storage.updateSavedPaymentMethod(paymentMethodId, {
      isDefault: true,
    });

    res.json(updatedPaymentMethod);
  }));

  // Get all gift cards
  app.get("/api/gift-cards", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    LoggerService.debug("Fetching all gift cards", context);

    const giftCards = await storage.getAllGiftCards();
    res.json(giftCards);
  }));

  // Resend gift certificate email or SMS
  app.post("/api/gift-certificates/resend", asyncHandler(async (req: Request, res: Response) => {
    const context = getLogContext(req);
    const { 
      giftCardId, 
      code, 
      recipientEmail, 
      recipientPhone, 
      recipientName, 
      amount, 
      deliveryMethod = "email" 
    } = req.body;

    LoggerService.info("Resending gift certificate", {
      ...context,
      giftCardId,
      code,
      recipientEmail,
      recipientPhone,
      deliveryMethod
    });

    // Validate that this is a gift certificate (not a physical gift card)
    if (!code || !code.startsWith('GC')) {
      return res.status(400).json({ 
        error: 'This function is only available for gift certificates' 
      });
    }

    // Validate recipient based on delivery method
    if (deliveryMethod === "email" && !recipientEmail) {
      return res.status(400).json({ 
        error: 'Recipient email is required to resend gift certificate via email' 
      });
    }

    if (deliveryMethod === "sms" && !recipientPhone) {
      return res.status(400).json({ 
        error: 'Recipient phone number is required to resend gift certificate via SMS' 
      });
    }

    try {
      let success = false;
      let sentTo = "";

      if (deliveryMethod === "email" && recipientEmail) {
        // Build the email HTML (same template as original)
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
              .gift-code { background: #f7f7f7; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
              .code { font-size: 28px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
              .amount { font-size: 36px; color: #667eea; margin: 15px 0; }
              .message-box { background: #fdf4ff; padding: 15px; border-left: 4px solid #764ba2; margin: 20px 0; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 25px; margin-top: 20px; }
              .resent-notice { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-bottom: 20px; color: #856404; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎁 Gift Certificate (Resent)</h1>
              </div>
              <div class="content">
                <div class="resent-notice">
                  📧 This is a resent copy of your gift certificate
                </div>
                
                <h2>Dear ${recipientName || 'Valued Customer'},</h2>
                <p>Here is your gift certificate that can be used at any of our locations!</p>
                
                <div class="gift-code">
                  <p style="margin: 0;">Your Gift Certificate Code:</p>
                  <div class="code">${code}</div>
                  <div class="amount">$${amount}</div>
                </div>
                
                <p><strong>How to use your gift certificate:</strong></p>
                <ul>
                  <li>Present this code at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist</li>
                  <li>You can use it for any of our services or products</li>
                  <li>This certificate expires in one year from the original issue date</li>
                  <li>The current balance can be checked at any time</li>
                </ul>
                
                <center>
                  <a href="https://one0-22-25.onrender.com/booking" class="button">Book Your Appointment</a>
                </center>
                
                <div class="footer">
                  <p>Questions? Contact us at hello@headspaglo.com</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailText = `
🎁 Gift Certificate (Resent)

Dear ${recipientName || 'Valued Customer'},

This is a resent copy of your gift certificate.

Gift Certificate Code: ${code}
Amount: $${amount}

How to use your gift certificate:
- Present this code at checkout when visiting Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist
- You can use it for any of our services or products
- This certificate expires in one year from the original issue date
- The current balance can be checked at any time

Book your appointment at https://one0-22-25.onrender.com/booking

Questions? Contact us at hello@headspaglo.com
        `;

        const emailSent = await sendEmail({
          to: recipientEmail,
          from: process.env.SENDGRID_FROM_EMAIL || 'hello@headspaglo.com',
          subject: `🎁 Gift Certificate from Glo Head Spa (Resent)`,
          html: emailHtml,
          text: emailText,
        });

        if (emailSent) {
          success = true;
          sentTo = recipientEmail;
          LoggerService.info("Gift certificate resent successfully via email", { 
            ...context, 
            recipientEmail,
            code 
          });
        } else {
          LoggerService.warn("Gift certificate email resend returned false", {
            ...context,
            recipientEmail,
            code
          });
        }
      }

      if (deliveryMethod === "sms" && recipientPhone) {
        const smsMessage = `🎁 Gift Certificate (Resent)\n\n` +
          `Hi ${recipientName || 'there'},\n\n` +
          `Here is your gift certificate!\n\n` +
          `Gift Code: ${code}\n` +
          `Amount: $${amount}\n\n` +
          `Use at: Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist.\n\n` +
          `Book: https://one0-22-25.onrender.com/booking`;

        const smsResult = await sendSMS(recipientPhone, smsMessage);

        if (smsResult.success) {
          success = true;
          sentTo = recipientPhone;
          LoggerService.info("Gift certificate resent successfully via SMS", {
            ...context,
            recipientPhone,
            code,
            messageId: smsResult.messageId
          });
        } else {
          LoggerService.warn("Gift certificate SMS resend failed", {
            ...context,
            recipientPhone,
            code,
            error: smsResult.error
          });
        }
      }

      if (success) {
        res.json({ 
          success: true, 
          message: `Gift certificate resent to ${sentTo} via ${deliveryMethod}` 
        });
      } else {
        res.status(500).json({ 
          error: `Failed to resend gift certificate via ${deliveryMethod}` 
        });
      }
    } catch (error) {
      LoggerService.error("Failed to resend gift certificate", { 
        ...context, 
        error,
        deliveryMethod,
        recipientEmail,
        recipientPhone,
        code 
      });
      
      res.status(500).json({ 
        error: 'Failed to resend gift certificate' 
      });
    }
  }));
} 