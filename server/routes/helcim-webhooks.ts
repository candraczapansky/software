import { Router } from 'express';
import type { IStorage } from '../storage.js';
import { TerminalConfigService } from '../services/terminal-config-service.js';
import { HelcimTerminalService } from '../services/helcim-terminal-service.js';
import { HelcimApiClient } from '../services/helcim-api-client.js';
import { log } from '../log.js';
import * as crypto from 'crypto';

export default function createHelcimWebhookRoutes(storage: IStorage) {
  const router = Router();
  const configService = new TerminalConfigService(storage);
  const terminalService: any = (storage as any).__terminalService || new HelcimTerminalService(configService);
  (storage as any).__terminalService = terminalService;
  const helcimApiClient = new HelcimApiClient();

  // Webhook handler with proper signature verification
  const handler = async (req: any, res: any) => {
    try {
      console.log('\n❗❗❗ HELCIM WEBHOOK RECEIVED ❗❗❗');
      console.log('URL:', req.url);
      console.log('Path:', req.path);
      console.log('Query:', req.query);
      console.log('Body:', JSON.stringify(req.body, null, 2));
      console.log('❗❗❗❗❗❗❗❗❗❗❗❗❗❗❗❗❗❗❗\n');
      
      try { log('🟢 POST /api/helcim/webhook'); } catch {}
      
      // Get webhook headers
      const signature = req.headers['webhook-signature'] || req.headers['Webhook-Signature'];
      const timestamp = req.headers['webhook-timestamp'] || req.headers['Webhook-Timestamp'];
      const webhookId = req.headers['webhook-id'] || req.headers['Webhook-Id'];
      
      console.log('📥 Helcim webhook received:', {
        headers: {
          'webhook-signature': signature,
          'webhook-timestamp': timestamp,
          'webhook-id': webhookId,
        },
        body: req.body,
        path: req.path,
        method: req.method,
      });
      
      // Log raw body for debugging
      console.log('📝 Raw webhook payload:', JSON.stringify(req.body, null, 2));
      
      // Extract invoice/reference from query params (Helcim posts to our URL with ?invoiceNumber=...)
      const queryParams: any = (req as any).query || {};
      const queryInvoiceNumber = queryParams.invoiceNumber || queryParams.invoice || queryParams.reference || queryParams.ref || queryParams.inv;
      
      console.log('🔍 CRITICAL DEBUG - Webhook Query Params:', {
        queryParams,
        queryInvoiceNumber,
        fullUrl: req.url,
        path: req.path
      });

      // Verify webhook signature if verifier token is configured
      const verifierToken = process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN;
      if (verifierToken && signature && timestamp && webhookId) {
        try {
          // Get the raw body string for signature verification
          let bodyString = '';
          if (typeof req.body === 'string') {
            bodyString = req.body;
          } else if ((req as any).rawBody) {
            bodyString = (req as any).rawBody;
          } else {
            bodyString = JSON.stringify(req.body);
          }
          
          // Construct the signed content
          const signedContent = `${webhookId}.${timestamp}.${bodyString}`;
          
          // Base64 decode the verifier token
          const verifierTokenBytes = Buffer.from(verifierToken, 'base64');
          
          // Generate the expected signature
          const expectedSignature = crypto
            .createHmac('sha256', verifierTokenBytes)
            .update(signedContent)
            .digest('base64');
          
          // Extract the actual signature (format: "v1,signature v2,signature")
          const signatures = signature.split(' ');
          let signatureValid = false;
          
          for (const sig of signatures) {
            const parts = sig.split(',');
            if (parts.length === 2) {
              const [version, actualSig] = parts;
              if (actualSig === expectedSignature) {
                signatureValid = true;
                console.log('✅ Webhook signature verified successfully');
                break;
              }
            }
          }
          
          if (!signatureValid) {
            console.warn('⚠️ Webhook signature verification failed, but continuing anyway');
            // Note: We're not rejecting invalid signatures for now to avoid blocking legitimate webhooks
            // In production, you might want to: return res.status(401).json({ error: 'Invalid signature' });
          }
        } catch (err) {
          console.error('❌ Error verifying webhook signature:', err);
        }
      } else if (verifierToken) {
        console.warn('⚠️ Missing webhook headers for signature verification');
      }

      // Parse the webhook payload
      let payload: any = req.body || {};
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch {}
      }
      // Support nested event wrappers
      let maybe: any = payload?.payload ?? payload?.data ?? payload?.event ?? payload;
      if (typeof maybe === 'string') {
        try { maybe = JSON.parse(maybe); } catch {}
      }
      
      // Helcim sends minimal webhook: {"id":"TRANSACTION_ID", "type":"cardTransaction"}
      const txId = (maybe?.transactionId || maybe?.cardTransactionId || maybe?.id || maybe?.paymentId || payload?.id) ? String(maybe?.transactionId || maybe?.cardTransactionId || maybe?.id || maybe?.paymentId || payload?.id) : undefined;
      const type = (maybe?.type || payload?.type) ? String(maybe?.type || payload?.type) : undefined;
      
      // Log full payload to see if amount/tip is included
      console.log('🔍 WEBHOOK PAYLOAD DETAILS:', {
        id: txId,
        type,
        amount: maybe?.amount ?? payload?.amount,
        tipAmount: maybe?.tipAmount ?? payload?.tipAmount,
        totalAmount: maybe?.totalAmount ?? payload?.totalAmount,
        total: maybe?.total ?? payload?.total,
        tip: maybe?.tip ?? payload?.tip,
        queryInvoiceNumber,
        // Log all numeric fields to find where the amounts are
        allNumericFields: Object.entries((maybe && typeof maybe === 'object' ? maybe : payload) || {})
          .filter(([_, v]) => typeof v === 'number')
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
      });

      // Do not set any global completion markers here; wait until status is verified below

      // Process webhook based on type
      if (type === 'cardTransaction' && txId) {
        console.log('🎯 Processing cardTransaction webhook for transaction:', txId);
        
        // CRITICAL FIX: Default to 'pending' NOT 'completed' to prevent auto-completion of failed transactions
        let paymentStatus = 'pending'; // SAFE DEFAULT - don't assume success
        
        // Extract all status-related fields
        const statusFields = [
          payload?.status,
          payload?.approved,
          payload?.transactionStatus,
          payload?.response,
          payload?.responseMessage,
          payload?.responseText,
          payload?.error,
          payload?.result,
          // Also consider nested payload fields
          maybe?.status,
          maybe?.approved,
          maybe?.transactionStatus,
          maybe?.response,
          maybe?.responseMessage,
          maybe?.responseText,
          maybe?.error,
          maybe?.result,
        ];
        
        // Create combined status string for checking
        const statusStr = statusFields.filter(s => s != null).map(s => String(s).toLowerCase()).join(' ');
        
        // Check for EXPLICIT success indicators FIRST
        if (payload?.approved === true || 
            payload?.approved === 'true' ||
            payload?.approved === 1 ||
            payload?.approved === '1' ||
            statusStr.includes('approved') ||
            statusStr.includes('captured') ||
            statusStr.includes('sale') ||
            (statusStr.includes('success') && !statusStr.includes('unsuccess'))) {
          paymentStatus = 'completed';
          console.log('✅ Payment EXPLICITLY approved/completed in webhook');
        }
        // Check for failure indicators
        else if (statusStr.includes('declined') || 
            statusStr.includes('failed') || 
            statusStr.includes('cancelled') || 
            statusStr.includes('cancel') ||
            statusStr.includes('voided') ||
            statusStr.includes('refunded') ||
            statusStr.includes('error') ||
            statusStr.includes('rejected') ||
            statusStr.includes('insufficient') ||
            payload?.approved === false ||
            payload?.approved === 'false' ||
            payload?.approved === 0 ||
            payload?.approved === '0') {
          paymentStatus = 'failed';
          console.log('❌ Payment declined/failed detected in webhook');
        } else {
          // CRITICAL: Don't assume cardTransaction means success!
          // We MUST fetch actual transaction details from Helcim API
          // Webhooks only send {"id":"TRANSACTION_ID", "type":"cardTransaction"}
          if (type === 'cardTransaction' && txId) {
            console.log(`🔍 cardTransaction webhook received - fetching ACTUAL status from Helcim API for txId: ${txId}`);
            try {
              const transactionDetails = await helcimApiClient.getTransactionDetails(txId);
              
              // Check ACTUAL transaction status from Helcim
              if (helcimApiClient.isTransactionApproved(transactionDetails)) {
                paymentStatus = 'completed';
                console.log('✅ Transaction APPROVED based on Helcim API data');
              } else if (helcimApiClient.isTransactionCancelled(transactionDetails)) {
                paymentStatus = 'cancelled';
                console.log('❌ Transaction CANCELLED based on Helcim API data');
              } else {
                paymentStatus = 'failed';
                console.log('❌ Transaction DECLINED/FAILED based on Helcim API data');
              }
              
              // Update amounts from actual transaction data
              const actualAmount = transactionDetails.totalAmount || transactionDetails.amount || 0;
              if (actualAmount) {
                amount = actualAmount;
              }
              
              // Get the actual invoice number from transaction
              if (transactionDetails.invoiceNumber) {
                invoiceNumber = transactionDetails.invoiceNumber;
                console.log(`📝 Got invoice number from transaction: ${invoiceNumber}`);
              }
              
            } catch (error) {
              console.error('❌ Failed to fetch transaction details from Helcim:', error);
              // If we can't verify, keep as pending to prevent auto-completion
              paymentStatus = 'pending';
              console.log('⚠️ Cannot verify transaction - keeping as PENDING');
            }
          } else {
            // For non-cardTransaction types without clear status, keep as pending
            paymentStatus = 'pending';
            console.log('⚠️ Webhook status unclear - keeping as PENDING');
            console.log('   Raw webhook data:', {
              approved: payload?.approved,
              status: payload?.status,
              response: payload?.response,
              transactionStatus: payload?.transactionStatus,
              type: type
            });
          }
        }
        
        // Declare amount variable for use below
        let amount = maybe?.amount || maybe?.totalAmount || maybe?.total || 
                     maybe?.transactionAmount || maybe?.paymentAmount ||
                     payload?.amount || payload?.totalAmount || payload?.total ||
                     payload?.transactionAmount || payload?.paymentAmount;
        
        let invoiceNumber = queryInvoiceNumber || maybe?.invoiceNumber || maybe?.invoice || 
                           maybe?.referenceNumber || maybe?.reference || 
                           payload?.invoiceNumber || payload?.invoice || 
                           payload?.referenceNumber || payload?.reference;
        
        // CRITICAL: Process webhook SYNCHRONOUSLY to ensure cache is updated before returning
        // This ensures the polling endpoint can find the result immediately
        try {
          // First update the webhook cache directly to ensure polling works
          const webhookStore = (terminalService as any).webhookStore || new Map();
          
          // Try to calculate tip amount from stored session data
          let tipAmount = 0;
          let baseAmount = amount;
          
          // Get session data to determine original base amount and calculate tip
          const sessionStore = (terminalService as any).sessionStore;
          if (sessionStore) {
            const sessionData = sessionStore.get(invoiceNumber) || sessionStore.get(txId);
            if (sessionData?.baseAmount && amount && amount > sessionData.baseAmount) {
              baseAmount = sessionData.baseAmount;
              tipAmount = amount - baseAmount;
              console.log(`💰 Calculated tip from session: base=$${baseAmount}, tip=$${tipAmount}, total=$${amount}`);
            } else if (sessionData?.baseAmount) {
              baseAmount = sessionData.baseAmount;
              console.log(`💵 No tip - using base amount from session: $${baseAmount}`);
            }
          }
          
          const cacheData = {
            status: paymentStatus,
            transactionId: txId,
            amount: amount,
            tipAmount: tipAmount,
            baseAmount: baseAmount,
            updatedAt: Date.now()
          };
          
          // Cache by transaction ID
          webhookStore.set(String(txId), cacheData);
          console.log(`💾 Webhook cached by transaction ID: ${txId} -> ${paymentStatus}`);
          
          // Try to find and cache by invoice number
          let invoiceNumber = queryInvoiceNumber || maybe?.invoiceNumber || maybe?.invoice || maybe?.referenceNumber || maybe?.reference || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference;
          
          console.log('🔑 CRITICAL - Caching keys:', {
            txId,
            invoiceNumber,
            queryInvoiceNumber,
            payloadInvoice: payload?.invoiceNumber || payload?.invoice,
            status: paymentStatus
          });
          
          if (invoiceNumber) {
            webhookStore.set(String(invoiceNumber), cacheData);
            console.log(`💾 Webhook cached by invoice: ${invoiceNumber} -> ${paymentStatus}`);
          } else {
            console.log('⚠️ NO INVOICE NUMBER to cache by - only cached by txId!');
          }
          
          // CRITICAL: If no invoice number in webhook, find session to get invoice number
          if ((terminalService as any).sessionStore) {
            const sessionStore = (terminalService as any).sessionStore;
            
            // FIRST: Check if we have a session stored by this exact transaction ID
            const sessionByTxId = sessionStore.get(String(txId));
            if (sessionByTxId && sessionByTxId.invoiceNumber) {
              invoiceNumber = sessionByTxId.invoiceNumber;
              webhookStore.set(String(invoiceNumber), cacheData);
              console.log(`✅ Found session by exact txId! Cached by invoice: ${invoiceNumber} -> ${paymentStatus}`);
            } else {
              // FALLBACK: Find the NEWEST session within the last 5 minutes
              const now = Date.now();
              let newestSession: {key: string; age: number; session: any} | null = null;
              
              sessionStore.forEach((session: any, key: string) => {
                // Consider all session keys (numeric timestamps, INV*, POS-*, etc)
                if (key) {
                  const age = now - session.startedAt;
                  // Only consider recent sessions (5 minutes) to avoid matching old payments
                  if (age <= 5 * 60 * 1000) { // 5 minutes max
                    if (!newestSession || age < newestSession.age) {
                      newestSession = {key, age, session};
                    }
                  }
                }
              });
              
              if (newestSession) {
                // Use the invoice number from the session if available, otherwise use the key
                const ns = newestSession as { key: string; age: number; session: any };
                invoiceNumber = ns.session.invoiceNumber || ns.key;
                webhookStore.set(String(invoiceNumber), cacheData);
                console.log(`💾 Webhook cached by NEWEST session invoice: ${invoiceNumber} -> ${paymentStatus} (age: ${Math.round(ns.age/1000)}s)`);
                
                // Also store the session by transaction ID for future lookups
                if (ns.session) {
                  sessionStore.set(String(txId), ns.session);
                }
              } else {
                console.log('⚠️ WARNING: No recent sessions (< 5min) found to match webhook!');
              }
            }
          }
          
          // Set global marker for this payment
          (globalThis as any).__HEL_WEBHOOK_LAST_COMPLETED__ = {
            status: paymentStatus,
            transactionId: txId,
            invoiceNumber: invoiceNumber,  // Now this will have the matched session key if found
            amount: amount,
            tipAmount: tipAmount,
            baseAmount: baseAmount,
            updatedAt: Date.now()
          };
          console.log(`✅ Global webhook marker set for ${txId} -> ${paymentStatus}`);
          
          // Now handle the webhook normally
          await (terminalService as any).handleWebhook({
            id: txId,
            transactionId: txId,
            type: 'cardTransaction',
            status: paymentStatus,
            approved: payload?.approved,
            response: payload?.response,
            amount: amount,
            invoiceNumber: invoiceNumber,
            rawPayload: payload
          });
          console.log(`✅ Webhook processing completed for transaction ${txId} with status: ${paymentStatus}`);
          
          // Capture values for async block before leaving try block
          const capturedInvoiceNumber = invoiceNumber;
          const capturedTipAmount = tipAmount;
          const capturedBaseAmount = baseAmount;
          const capturedAmount = amount;
          const capturedQueryInvoiceNumber = queryInvoiceNumber;
          const capturedType = type;  // CRITICAL: Capture type for async block
          const capturedTxId = txId;  // Also capture transaction ID
          
          // Now handle database updates asynchronously after response
          setImmediate(async () => {
            console.log(`📌 ASYNC DB UPDATE STARTING for ${capturedTxId}, status: ${paymentStatus}, type: ${capturedType}`);
            try {
              // CRITICAL: Update payment records in database for terminal transactions
              if (paymentStatus === 'completed' || paymentStatus === 'failed') {
                console.log(`📌 Processing ${paymentStatus} payment in database...`);
                try {
                  // Look for invoice number - use the one we matched from session if webhook doesn't have it
                  let dbInvoiceNumber = capturedQueryInvoiceNumber || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference;
                  if (!dbInvoiceNumber && capturedInvoiceNumber) {
                    // Use the invoice number we matched from the session
                    dbInvoiceNumber = capturedInvoiceNumber;
                    console.log(`📝 Using session-matched invoice number for DB update: ${dbInvoiceNumber}`);
                  }
                  
                  if (dbInvoiceNumber && (dbInvoiceNumber.startsWith('POS-') || dbInvoiceNumber.startsWith('INV'))) {
                    console.log(`🔍 Looking for payment with invoice: ${dbInvoiceNumber}`);
                  
                  // Find payments by searching notes field for invoice number
                  const allPayments = await storage.getAllPayments();
                  const matchingPayment = allPayments.find((p: any) => {
                    try {
                      const notes = p.notes ? JSON.parse(p.notes) : {};
                      return notes.invoiceNumber === dbInvoiceNumber;
                    } catch {
                      return false;
                    }
                  });
                  
                  if (matchingPayment) {
                    console.log(`✅ Found payment ${matchingPayment.id} for invoice ${dbInvoiceNumber}`);
                    
                    // Extract amounts from webhook
                    const totalAmount = capturedAmount;
                    
                    // Update payment with webhook data
                      await storage.updatePayment(matchingPayment.id, {
                        status: paymentStatus,
                        helcimPaymentId: capturedTxId, // Store the POS transaction ID
                        processedAt: new Date(),
                        tipAmount: capturedTipAmount || 0,
                        totalAmount: totalAmount || matchingPayment.totalAmount,
                        notes: JSON.stringify({
                          ...(matchingPayment.notes ? JSON.parse(matchingPayment.notes) : {}),
                          helcimTransactionId: capturedTxId,
                        invoiceNumber: dbInvoiceNumber,
                        webhookProcessed: true,
                        webhookStatus: paymentStatus,
                        cardLast4: payload?.cardLast4 || payload?.last4
                      })
                    });
                    
                    console.log(`✅ Updated payment ${matchingPayment.id} to ${paymentStatus} with transaction ID ${txId}`);
                    
                    // Update appointment if linked
                    if (matchingPayment.appointmentId && paymentStatus === 'completed') {
                      // Check if this is part of a split payment by getting all payments for this appointment
                      const allPayments = await storage.getAllPayments();
                      const appointmentPayments = allPayments.filter((p: any) => p.appointmentId === matchingPayment.appointmentId);
                      const totalPaid = appointmentPayments.reduce((sum: number, p: any) => {
                        if (p.status === 'completed') {
                          return sum + (p.totalAmount || p.amount || 0);
                        }
                        return sum;
                      }, 0);

                      // Get the appointment to check its total amount
                      const appointment = await storage.getAppointment(matchingPayment.appointmentId);
                      if (appointment) {
                        const appointmentTotal = appointment.totalAmount || 0;
                        const appointmentPaymentStatus = totalPaid >= appointmentTotal ? 'paid' : 'partial';
                        
                        await storage.updateAppointment(matchingPayment.appointmentId, {
                          paymentStatus: appointmentPaymentStatus
                        });
                        console.log(`✅ Updated appointment ${matchingPayment.appointmentId} payment status to ${appointmentPaymentStatus} (paid: ${totalPaid}, total: ${appointmentTotal})`);
                      }
                    } else if (matchingPayment.appointmentId && paymentStatus !== 'completed') {
                      await storage.updateAppointment(matchingPayment.appointmentId, {
                        paymentStatus: 'unpaid'
                      });
                      console.log(`✅ Updated appointment ${matchingPayment.appointmentId} payment status to unpaid`);
                    }
                    
                    // Create sales history record if completed
                    if (paymentStatus === 'completed') {
                      try {
                        await storage.createSalesHistory({
                          transactionType: (matchingPayment.appointmentId ? 'appointment' : 'pos_sale'),
                          transactionDate: new Date(),
                          paymentId: matchingPayment.id,
                          appointmentId: matchingPayment.appointmentId || null,
                          clientId: matchingPayment.clientId || null,
                          serviceIds: null,
                          serviceTotalAmount: capturedBaseAmount || matchingPayment.amount,
                          tipAmount: capturedTipAmount || 0,
                          totalAmount: totalAmount || matchingPayment.totalAmount,
                          paymentMethod: 'terminal'
                        });
                        console.log(`✅ Created sales history record for payment ${matchingPayment.id}`);
                      } catch (e) {
                        console.warn('Could not create sales history:', e);
                      }
                    }
                  } else {
                    console.log(`⚠️ No payment found for invoice ${dbInvoiceNumber}`);
                    
                    // For manual terminal transactions, create a new payment record
                    if (paymentStatus === 'completed' && capturedType === 'cardTransaction') {
                      console.log(`🆕 Creating payment record for manual terminal transaction`);
                      try {
                        const newPayment = await storage.createPayment({
                          clientId: 1, // Default client for POS
                          amount: capturedBaseAmount || capturedAmount || 0,
                          totalAmount: capturedAmount || 0,
                          tipAmount: capturedTipAmount || 0,
                          method: 'terminal',
                          status: 'completed',
                          helcimPaymentId: capturedTxId,
                          processedAt: new Date(),
                          type: 'pos',
                          description: `Terminal payment ${dbInvoiceNumber || capturedTxId}`,
                          notes: JSON.stringify({
                            invoiceNumber: dbInvoiceNumber,
                            helcimTransactionId: capturedTxId,
                            manualTerminalPayment: true,
                            createdFromWebhook: true,
                            webhookProcessedAt: new Date().toISOString()
                          })
                        });
                        
                        // Create sales history
                        if (capturedAmount > 0) {
                          await storage.createSalesHistory({
                            paymentId: newPayment.id,
                            clientId: 1,
                            transactionType: 'pos_sale',
                            transactionDate: new Date(),
                            serviceTotalAmount: capturedBaseAmount || capturedAmount,
                            tipAmount: capturedTipAmount || 0,
                            totalAmount: capturedAmount,
                            paymentMethod: 'terminal',
                            serviceIds: null,
                            appointmentId: null
                          });
                        }
                        console.log(`✅ Created payment ${newPayment.id} for manual terminal transaction`);
                      } catch (error) {
                        console.error('❌ Failed to create payment for manual terminal:', error);
                      }
                    }
                  }
                } else if (!dbInvoiceNumber) {
                  // If no invoice number in webhook, try to match by pending terminal payments
                  console.log(`⚠️ No invoice number in webhook, looking for recent pending terminal payments...`);
                  
                  const allPayments = await storage.getAllPayments();
                  const recentPendingPayments = allPayments.filter((p: any) => {
                    // Look for pending terminal payments created in last 5 minutes
                    const isRecent = p.createdAt && (Date.now() - new Date(p.createdAt).getTime() < 5 * 60 * 1000);
                    const isPending = p.status === 'pending';
                    const isTerminal = p.method === 'terminal';
                    return isRecent && isPending && isTerminal;
                  });
                  
                  if (recentPendingPayments.length > 0) {
                    // Use the most recent pending payment
                    const payment = recentPendingPayments[0];
                    console.log(`✅ Found recent pending terminal payment ${payment.id}`);
                    
                    const totalAmount = capturedAmount;
                    
                    await storage.updatePayment(payment.id, {
                      status: paymentStatus,
                      helcimPaymentId: txId,
                      processedAt: new Date(),
                      tipAmount: capturedTipAmount || 0,
                      totalAmount: totalAmount || payment.totalAmount,
                      notes: JSON.stringify({
                        ...(payment.notes ? JSON.parse(payment.notes) : {}),
                        helcimTransactionId: txId,
                        webhookProcessed: true,
                        webhookStatus: paymentStatus,
                        cardLast4: payload?.cardLast4 || payload?.last4
                      })
                    });
                    
                    console.log(`✅ Updated payment ${payment.id} to ${paymentStatus} with transaction ID ${txId}, tip: ${capturedTipAmount}`);
                    
                    if (payment.appointmentId && paymentStatus === 'completed') {
                      // Check if this is part of a split payment by getting all payments for this appointment
                      const allPayments = await storage.getAllPayments();
                      const appointmentPayments = allPayments.filter((p: any) => p.appointmentId === payment.appointmentId);
                      const totalPaid = appointmentPayments.reduce((sum: number, p: any) => {
                        if (p.status === 'completed') {
                          return sum + (p.totalAmount || p.amount || 0);
                        }
                        return sum;
                      }, 0);

                      // Get the appointment to check its total amount
                      const appointment = await storage.getAppointment(payment.appointmentId);
                      if (appointment) {
                        const appointmentTotal = appointment.totalAmount || 0;
                        const appointmentPaymentStatus = totalPaid >= appointmentTotal ? 'paid' : 'partial';
                        
                        await storage.updateAppointment(payment.appointmentId, {
                          paymentStatus: appointmentPaymentStatus
                        });
                        console.log(`✅ Updated appointment ${payment.appointmentId} payment status to ${appointmentPaymentStatus} (paid: ${totalPaid}, total: ${appointmentTotal})`);
                      }
                    } else if (payment.appointmentId && paymentStatus !== 'completed') {
                      await storage.updateAppointment(payment.appointmentId, {
                        paymentStatus: 'unpaid'
                      });
                      console.log(`✅ Updated appointment ${payment.appointmentId} payment status to unpaid`);
                    }
                    
                    // Create sales history record if completed
                    if (paymentStatus === 'completed') {
                      try {
                        await storage.createSalesHistory({
                          transactionType: (payment.appointmentId ? 'appointment' : 'pos_sale'),
                          transactionDate: new Date(),
                          paymentId: payment.id,
                          appointmentId: payment.appointmentId || null,
                          clientId: payment.clientId || null,
                          serviceIds: null,
                          serviceTotalAmount: capturedBaseAmount || payment.amount,
                          tipAmount: capturedTipAmount || 0,
                          totalAmount: totalAmount || payment.totalAmount,
                          paymentMethod: 'terminal'
                        });
                        console.log(`✅ Created sales history record for payment ${payment.id}`);
                      } catch (e) {
                        console.warn('Could not create sales history:', e);
                      }
                    }
                  } else {
                    console.log(`⚠️ No recent pending terminal payments found`);
                  }
                }
              } catch (dbErr) {
                console.error('❌ Failed to update payment in database:', dbErr);
              }
            }
          } catch (err) {
            console.error('❌ Helcim webhook processing failed:', err);
            // Store the actual status in webhook cache
            try {
              const webhookStore = (terminalService as any).webhookStore || new Map();
              webhookStore.set(String(txId), {
                status: paymentStatus,
                transactionId: txId,
                updatedAt: Date.now(),
              });
            } catch {}
          }
        });
        } catch (err) {
          console.error('❌ Helcim webhook processing failed:', err);
          // Still cache what we can even if processing failed
          try {
            const webhookStore = (terminalService as any).webhookStore || new Map();
            webhookStore.set(String(txId), {
              status: paymentStatus,
              transactionId: txId,
              updatedAt: Date.now(),
            });
          } catch {}
        }
      } else if (type === 'terminalCancel' || type === 'terminalDecline' || type === 'declined') {
        console.log('🚫 Terminal cancel/decline webhook received:', payload);
        // Handle terminal cancel or decline
        if (txId) {
          const cancelStatus = type === 'declined' || type === 'terminalDecline' ? 'failed' : 'cancelled';
          
          // Update cache immediately for cancelled/declined payments
          try {
            const webhookStore = (terminalService as any).webhookStore || new Map();
            const cacheData = {
              status: cancelStatus,
              transactionId: txId,
              amount: 0,
              tipAmount: 0,
              baseAmount: 0,
              updatedAt: Date.now()
            };
            
            // Cache by transaction ID
            webhookStore.set(String(txId), cacheData);
            console.log(`💾 Webhook cached cancelled/declined by transaction ID: ${txId} -> ${cancelStatus}`);
            
            // Try to find and cache by invoice number
            let invoiceNumber = queryInvoiceNumber || maybe?.invoiceNumber || maybe?.invoice || maybe?.referenceNumber || maybe?.reference || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference;
            if (invoiceNumber) {
              webhookStore.set(String(invoiceNumber), cacheData);
              console.log(`💾 Webhook cached cancelled/declined by invoice: ${invoiceNumber} -> ${cancelStatus}`);
            }
            
            // Cache under the MOST RECENT session for cancelled/declined too
            if ((terminalService as any).sessionStore) {
              const sessionStore = (terminalService as any).sessionStore;
              const now = Date.now();
              let newestSession: {key: string; age: number} | null = null;
              
              // Find the NEWEST session within the last 5 minutes
              sessionStore.forEach((session: any, key: string) => {
                if (key && (key.startsWith('POS-') || key.startsWith('INV'))) {
                  const age = now - session.startedAt;
                  if (age <= 5 * 60 * 1000) { // 5 minutes max
                    if (!newestSession || age < newestSession.age) {
                      newestSession = {key, age};
                    }
                  }
                }
              });
              
            if (newestSession) {
              const ns = newestSession as { key: string; age: number };
              webhookStore.set(ns.key, cacheData);
              console.log(`💾 Webhook cached cancelled/declined by NEWEST session: ${ns.key} -> ${cancelStatus} (age: ${Math.round(ns.age/1000)}s)`);
              
              // Use the matched session key as the invoice number if we don't have one
              if (!invoiceNumber) {
                invoiceNumber = ns.key;
              }
            }
            }
            
            // Set global marker
            (globalThis as any).__HEL_WEBHOOK_LAST_COMPLETED__ = {
              status: cancelStatus,
              transactionId: txId,
              invoiceNumber: invoiceNumber,  // Now this will have the matched session key if found
              updatedAt: Date.now()
            };
            console.log(`✅ Global webhook marker set for ${cancelStatus}: ${txId}`);
          } catch (e) {
            console.error('❌ Failed to cache cancelled/declined webhook:', e);
          }
          
          setImmediate(async () => {
            try {
              await (terminalService as any).handleWebhook({
                id: txId,
                transactionId: txId,
                type: type,
                status: cancelStatus,
                invoiceNumber: (queryInvoiceNumber || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference),
                rawPayload: payload
              });
              console.log(`✅ Terminal ${type} webhook processed for transaction:`, txId);
              
              // CRITICAL: Call the fix-payment endpoint for cancelled/declined payments too
              try {
                const totalAmount = payload?.amount || payload?.totalAmount || payload?.total || 0;
                const tipAmount = payload?.tipAmount || payload?.tip || 0;
                const cardLast4 = payload?.cardLast4 || payload?.last4 || payload?.card?.last4;
                
                // Try to extract appointment ID from invoice number
                let appointmentId = null;
                const invFromWebhook = queryInvoiceNumber || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference;
                if (invFromWebhook) {
                  const match = invFromWebhook.match(/INV(\d+)/);
                  if (match) {
                    const paymentId = parseInt(match[1], 10);
                    try {
                      const allPayments = await storage.getAllPayments();
                      const payment = allPayments.find((p: any) => p.id === paymentId);
                      if (payment && payment.appointmentId) {
                        appointmentId = payment.appointmentId;
                      }
                    } catch (e) {}
                  }
                }
                
                // Call the internal fix-payment endpoint
                const port = process.env.PORT || 3003;
                const fixUrl = `http://localhost:${port}/api/terminal/fix-payment/${txId}`;
                console.log(`🔧 Calling fix-payment endpoint for ${cancelStatus} at: ${fixUrl}`);
                const fixResponse = await fetch(fixUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    appointmentId,
                    tipAmount,
                    totalAmount,
                    cardLast4,
                    status: cancelStatus
                  })
                });
                
                if (fixResponse.ok) {
                  const fixResult = await fixResponse.json();
                  console.log(`✅ Payment fixed as ${cancelStatus} via webhook: ${fixResult.paymentId}`);
                } else {
                  console.error(`❌ Failed to fix ${cancelStatus} payment via webhook: ${fixResponse.status}`);
                }
              } catch (fixErr) {
                console.error(`❌ Error calling fix-payment endpoint for ${cancelStatus}:`, fixErr);
              }
              
              // CRITICAL: Update payment records in database for cancelled/declined payments
              try {
                const invoiceNumber = queryInvoiceNumber || payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference;
                
                if (invoiceNumber && (invoiceNumber.startsWith('POS-') || invoiceNumber.startsWith('INV'))) {
                  console.log(`🔍 Looking for payment with invoice: ${invoiceNumber} to mark as ${cancelStatus}`);
                  
                  // Find payments by searching notes field for invoice number
                  const allPayments = await storage.getAllPayments();
                  const matchingPayment = allPayments.find((p: any) => {
                    try {
                      const notes = p.notes ? JSON.parse(p.notes) : {};
                      return notes.invoiceNumber === invoiceNumber;
                    } catch {
                      return false;
                    }
                  });
                  
                  if (matchingPayment) {
                    console.log(`✅ Found payment ${matchingPayment.id} for cancelled/declined invoice ${invoiceNumber}`);
                    
                    // Update payment with webhook data
                    await storage.updatePayment(matchingPayment.id, {
                      status: cancelStatus,
                      helcimPaymentId: txId, // Store the POS transaction ID even for failed payments
                      processedAt: new Date(),
                      notes: JSON.stringify({
                        ...(matchingPayment.notes ? JSON.parse(matchingPayment.notes) : {}),
                        helcimTransactionId: txId,
                        invoiceNumber,
                        webhookProcessed: true,
                        webhookStatus: cancelStatus,
                        declineReason: payload?.response || payload?.responseMessage || type
                      })
                    });
                    
                    console.log(`✅ Updated payment ${matchingPayment.id} to ${cancelStatus}`);
                    
                    // Update appointment if linked
                    if (matchingPayment.appointmentId) {
                      await storage.updateAppointment(matchingPayment.appointmentId, {
                        paymentStatus: 'unpaid'
                      });
                      console.log(`✅ Updated appointment ${matchingPayment.appointmentId} payment status to unpaid`);
                    }
                  } else {
                    console.log(`⚠️ No payment found for invoice ${invoiceNumber} - may not be created yet`);
                  }
                } else if (!invoiceNumber) {
                  // If no invoice number in webhook, try to match by pending terminal payments
                  console.log(`⚠️ No invoice number in webhook for ${cancelStatus}, looking for recent pending terminal payments...`);
                  
                  const allPayments = await storage.getAllPayments();
                  const recentPendingPayments = allPayments.filter((p: any) => {
                    // Look for pending terminal payments created in last 5 minutes
                    const isRecent = p.createdAt && (Date.now() - new Date(p.createdAt).getTime() < 5 * 60 * 1000);
                    const isPending = p.status === 'pending';
                    const isTerminal = p.method === 'terminal';
                    return isRecent && isPending && isTerminal;
                  });
                  
                  if (recentPendingPayments.length > 0) {
                    // Use the most recent pending payment
                    const payment = recentPendingPayments[0];
                    console.log(`✅ Found recent pending terminal payment ${payment.id} to mark as ${cancelStatus}`);
                    
                    await storage.updatePayment(payment.id, {
                      status: cancelStatus,
                      helcimPaymentId: txId,
                      processedAt: new Date(),
                      notes: JSON.stringify({
                        ...(payment.notes ? JSON.parse(payment.notes) : {}),
                        helcimTransactionId: txId,
                        webhookProcessed: true,
                        webhookStatus: cancelStatus,
                        declineReason: payload?.response || payload?.responseMessage || type
                      })
                    });
                    
                    console.log(`✅ Updated payment ${payment.id} to ${cancelStatus} with transaction ID ${txId}`);
                    
                    if (payment.appointmentId) {
                      await storage.updateAppointment(payment.appointmentId, {
                        paymentStatus: 'unpaid'
                      });
                      console.log(`✅ Updated appointment ${payment.appointmentId} payment status to unpaid`);
                    }
                  } else {
                    console.log(`⚠️ No recent pending terminal payments found for ${cancelStatus}`);
                  }
                }
              } catch (dbErr) {
                console.error('❌ Failed to update cancelled/declined payment in database:', dbErr);
              }
            } catch (err) {
              console.error(`❌ Terminal ${type} webhook processing failed:`, err);
              try {
                const webhookStore = (terminalService as any).webhookStore || new Map();
                webhookStore.set(String(txId), {
                  status: cancelStatus,
                  transactionId: txId,
                  updatedAt: Date.now(),
                });
              } catch {}
            }
          });
        }
      } else if (type === 'refund' || type === 'void') {
        console.log('🔁 Refund/void webhook received:', payload);
        // Handle refund or void
        if (txId) {
          setImmediate(async () => {
            try {
              await (terminalService as any).handleWebhook({
                id: txId,
                transactionId: txId,
                type: type,
                status: 'failed', // Treat refunds/voids as failed for the original payment
                rawPayload: payload
              });
              console.log(`✅ ${type} webhook processed for transaction:`, txId);
            } catch (err) {
              console.error(`❌ ${type} webhook processing failed:`, err);
            }
          });
        }
      }

      // Respond immediately with 200 OK to acknowledge receipt
      // This is critical - Helcim expects a 2xx response quickly
      return res.status(200).json({ received: true });
    } catch (error: any) {
      try { console.error('❌ Error in success-only Helcim webhook:', error); } catch {}
      return res.status(200).json({ received: true });
    }
  };

  router.post('/webhook', handler);
  router.post('/webhook/payment-success', handler);
  // For BASIC setups, treat any failure callback as a no-op to avoid loops
  router.post('/webhook/payment-failed', handler);
  // Legacy/alternate alias (some older configs may still call this path)
  router.post('/smart-terminal/webhook', handler);
  // Minimal confirmation endpoints that accept any POST and mark last completed
  router.post('/webhook/success', (req: any, res: any) => {
    try {
      // Extract transaction ID from the payload
      let payload = req.body;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch {}
      }
      
      const txId = payload?.id || payload?.transactionId || payload?.invoiceNumber;
      
      // Only set the global marker if we have a transaction ID
      if (txId) {
        try {
          (globalThis as any).__HEL_WEBHOOK_LAST_COMPLETED__ = {
            status: 'completed',
            transactionId: txId,
            invoiceNumber: txId, // Use same ID for both fields for compatibility
            updatedAt: Date.now(),
          };
          console.log(`✅ Webhook success marked for transaction: ${txId}`);
        } catch {}
      } else {
        console.log('⚠️ Webhook success endpoint called without transaction ID');
      }
      return res.json({ received: true });
    } catch {
      return res.json({ received: true });
    }
  });
  // Health/simple GET success confirmation for quick tests
  router.get('/webhook/success', (_req, res) => res.json({ received: true }));
  router.get('/webhook/health', (_req, res) => res.json({ status: 'ok' }));

  return router;
}



