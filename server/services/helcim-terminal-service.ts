import axios from 'axios';
import crypto from 'crypto';
import { TerminalConfig } from '../../shared/schema.js';
import { TerminalConfigService } from './terminal-config-service.js';
import { HelcimApiClient } from './helcim-api-client.js';

// Simple in-memory cache for webhook data
const webhookStore = new Map<
  string,
  { status: 'completed' | 'failed' | 'pending'; transactionId?: string; last4?: string; updatedAt: number }
>();

// Track recent payment sessions to correlate terminal responses
const sessionStore = new Map<
  string,
  { 
    startedAt: number; 
    locationId: string; 
    deviceCode: string;
    totalAmount?: number;
    baseAmount?: number;  // Base amount before tip
    paymentId?: number;
    appointmentId?: number;
    invoiceNumber?: string;
    helcimTxId?: string;
  }
>();

export class HelcimTerminalService {
  private readonly baseUrl = 'https://api.helcim.com/v2';
  private helcimApiClient = new HelcimApiClient();
  // Expose webhookStore as a public property so routes can access it directly
  public readonly webhookStore = webhookStore;
  // Expose sessionStore for payment routes to create sessions for Helcim Pay.js
  public readonly sessionStore = sessionStore;

  constructor(private readonly configService: TerminalConfigService) {}

  /**
   * Initialize a terminal for a specific location
   */
  async initializeTerminal(config: Omit<TerminalConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      // Save the configuration to database
      await this.configService.saveTerminalConfig({
        ...config,
        isActive: true
      });
      
      console.log(`✅ Terminal ${config.terminalId} initialized for location ${config.locationId}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Error initializing terminal ${config.terminalId}:`, error.message);
      return false;
    }
  }

  /**
   * Start a payment on a specific terminal
   */
  async startPayment(
    locationId: string,
    totalAmount: number,
    options: { 
      invoiceNumber?: string;
      description?: string;
      appointmentId?: number;
      reference?: string;
      tipAmount?: number;
      baseAmount?: number;  // Add baseAmount to track service cost separately
      paymentId?: number;    // Add paymentId for tracking
    } = {}
  ) {
    // Resolve config; if locationId is blank or not found, fall back to any active config
    let config = locationId ? await this.configService.getTerminalConfig(locationId) : null;
    if (!config) {
      try {
        const fallback = await this.configService.getAnyActiveTerminalConfig();
        if (fallback) {
          config = fallback as any;
          console.warn('⚠️ Using fallback terminal configuration (no location provided or not found).');
        }
      } catch {}
    }
    if (!config) {
      console.error(`❌ No terminal configured${locationId ? ` for location ${locationId}` : ''}`);
      throw new Error(`No terminal configured${locationId ? ` for location ${locationId}` : ''}`);
    }

    // Generate unique invoice number if not provided; prefer client-provided reference
    const invoiceNumber = options.invoiceNumber || options.reference || `POS-${Date.now()}`;

    // Store session for tracking including base amount for tip calculation
    // If baseAmount is provided, use it; otherwise assume totalAmount is the base
    const actualBaseAmount = options.baseAmount !== undefined ? options.baseAmount : 
                            (options.tipAmount ? totalAmount - options.tipAmount : totalAmount);
    
    const sessionData = {
      startedAt: Date.now(),
      locationId,
      deviceCode: config.deviceCode,
      totalAmount,
      baseAmount: actualBaseAmount,  // Store the actual service cost
      tipAmount: options.tipAmount || 0,
      paymentId: options.paymentId,
      appointmentId: options.appointmentId,
    };
    sessionStore.set(invoiceNumber, sessionData);
    console.log(`💾 Stored payment session: ${invoiceNumber}`, {
      ...sessionData,
      sessionCount: sessionStore.size
    });

    // Clean up old sessions (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    sessionStore.forEach((value, key) => {
      if (value.startedAt < oneHourAgo) {
        sessionStore.delete(key);
      }
    });

    try {
      // Include webhook URL in the payment request if available
      let webhookUrl: string | undefined = process.env.TERMINAL_WEBHOOK_URL || process.env.HELCIM_WEBHOOK_URL;
      
      // If no explicit webhook URL, try to construct from base URL
      if (!webhookUrl) {
        // Use CUSTOM_DOMAIN first (actual domain), then PUBLIC_BASE_URL
        const baseUrl = process.env.CUSTOM_DOMAIN || process.env.PUBLIC_BASE_URL;
        if (baseUrl) {
          const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          webhookUrl = `${cleanUrl}/api/terminal/webhook`;
        }
      }
      
      // Fallback to localhost for development if no URL is configured
      if (!webhookUrl) {
        // Try to detect if we're in development mode
        const isDev = process.env.NODE_ENV === 'development';
        if (isDev) {
          const port = process.env.PORT || '3002';
          webhookUrl = `http://localhost:${port}/api/terminal/webhook`;
          console.log('📝 Using localhost webhook URL for development:', webhookUrl);
        } else {
          console.warn('⚠️ No webhook URL configured. Set TERMINAL_WEBHOOK_URL, HELCIM_WEBHOOK_URL, or PUBLIC_BASE_URL environment variable for terminal payment callbacks.');
          console.warn('⚠️ Without webhook, payment status will only update via polling, which may timeout.');
          console.warn('Current environment variables:', {
            TERMINAL_WEBHOOK_URL: process.env.TERMINAL_WEBHOOK_URL || 'not set',
            HELCIM_WEBHOOK_URL: process.env.HELCIM_WEBHOOK_URL || 'not set',
            PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'not set'
          });
        }
      } else {
        console.log('📡 Using webhook URL:', webhookUrl);
      }
      
      console.log('🔗 Webhook URL for terminal payment:', webhookUrl);

      // Prepare the payment payload with correct Helcim field names
      const resolvedCurrency = (process.env.HELCIM_CURRENCY || process.env.CURRENCY || '').toUpperCase() || 'USD';
      const transactionAmount = Number(totalAmount.toFixed(2));
      // Append our internal invoiceNumber as a query param so minimal webhooks can be correlated
      let finalWebhookUrl: string | undefined = webhookUrl;
      try {
        if (webhookUrl) {
          const u = new URL(webhookUrl);
          u.searchParams.set('invoiceNumber', String(invoiceNumber));
          finalWebhookUrl = u.toString();
        }
      } catch {
        if (webhookUrl) {
          finalWebhookUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}invoiceNumber=${encodeURIComponent(String(invoiceNumber))}`;
        }
      }
      const payload: any = {
        // Some Helcim endpoints expect `transactionAmount`, others `amount` – provide both to be safe
        transactionAmount,
        amount: transactionAmount,
        currency: resolvedCurrency,
        invoiceNumber,
        customerCode: (options as any)?.customerCode || '',
        // Add webhook/callback aliases so Helcim can notify completion
        webhookUrl: finalWebhookUrl || webhookUrl,
        callbackUrl: finalWebhookUrl || webhookUrl,
        notificationUrl: finalWebhookUrl || webhookUrl,
      };
      try { console.log('💱 Using currency for Helcim terminal purchase:', resolvedCurrency); } catch {}

      const token = config.apiToken || process.env.HELCIM_API_TOKEN;
      
      console.log('📤 Sending payment to terminal:', {
        deviceCode: config.deviceCode,
        invoiceNumber,
        totalAmount,
        hasToken: !!token
      });
      
      let response: any;
      let paymentSent = false;
      
      // Try multiple endpoints to send payment to terminal
      const endpoints = [
        { 
          path: `/devices/${config.deviceCode}/payment/purchase`,
          name: 'Device Purchase',
          requiresIdempotency: false
        },
        // Only include generic purchase if we have a numeric terminal ID
        ...((config as any).id ? [{
          path: `/payment/purchase`,
          name: 'Generic Purchase with terminalId',
          requiresIdempotency: true,
          modifyPayload: (p: any) => ({ 
            ...p, 
            terminalId: (config as any).id, // Use the numeric database ID
            deviceCode: undefined // Remove deviceCode for this endpoint
          })
        }] : [])
      ];
      
      for (const endpoint of endpoints) {
        console.log(`🔄 Attempting ${endpoint.name}:`, {
          endpoint: endpoint.path,
          deviceCode: config.deviceCode,
          invoiceNumber,
          amount: payload.transactionAmount,
          webhookUrl: payload.webhookUrl || 'NOT SET',
          hasToken: !!token
        });
        
        try {
          const endpointPayload = endpoint.modifyPayload ? endpoint.modifyPayload(payload) : payload;
          const headers: Record<string, string> = {};
          
          if (endpoint.requiresIdempotency) {
            // Generate UUID for idempotency key as Helcim requires
            const uuid = crypto.randomUUID ? crypto.randomUUID() : 
                        `${invoiceNumber}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            headers['idempotency-key'] = uuid;
            console.log(`🔑 Using idempotency key: ${uuid}`);
          }
          
          response = await this.makeRequest(
            'POST', 
            endpoint.path, 
            // Add ipAddress for endpoints that require client IP context
            { ipAddress: '0.0.0.0', ...endpointPayload }, 
            token,
            headers
          );
          
          console.log(`✅ Payment sent to terminal via ${endpoint.name}:`, {
            invoiceNumber,
            response: response?.data || response
          });
          
          // Check if the transaction was actually declined
          const responseData = response?.data || response;
          if (responseData?.approved === false || responseData?.status === 'declined' || responseData?.responseMessage?.toLowerCase().includes('decline')) {
            console.warn(`⚠️ Transaction was DECLINED by the processor!`);
            console.warn(`Decline reason: ${responseData?.responseMessage || responseData?.message || 'Unknown'}`);
            console.warn(`Full response:`, responseData);
          }
          
          paymentSent = true;
          break; // Success, exit loop
          
        } catch (err: any) {
          const errorMsg = String(err?.message || err?.response?.data || err).toLowerCase();
          console.error(`❌ ${endpoint.name} failed:`, errorMsg);
          
          // Log the full error details for debugging
          console.error('Full error details:', {
            message: err?.message,
            response: err?.response?.data,
            status: err?.response?.status,
            statusText: err?.response?.statusText,
            headers: err?.response?.headers
          });
          
          // If this is the last endpoint, throw the error
          if (endpoint === endpoints[endpoints.length - 1]) {
            throw err;
          }
        }
      }
      
      // Process the response to extract transaction details
      if (paymentSent && response) {
        const responseData = response?.data || response;
        const transactionId = responseData?.transactionId || responseData?.id || responseData?.paymentId || invoiceNumber;
        
        console.log('💳 Transaction details:', {
          transactionId,
          invoiceNumber,
          approved: responseData?.approved,
          status: responseData?.status,
          message: responseData?.responseMessage || responseData?.message
        });
        
        // Update session with transaction ID
        if (transactionId && transactionId !== invoiceNumber) {
          const session = sessionStore.get(invoiceNumber);
          if (session) {
            sessionStore.set(String(transactionId), session);
          }
        }
        
        // Store in webhook cache if payment was successful
        if (responseData?.approved === true || responseData?.status === 'completed') {
          webhookStore.set(String(transactionId), {
            status: 'completed',
            transactionId: String(transactionId),
            last4: responseData?.cardLast4 || responseData?.last4,
            updatedAt: Date.now(),
          });
          if (invoiceNumber !== transactionId) {
            webhookStore.set(String(invoiceNumber), {
              status: 'completed',
              transactionId: String(transactionId),
              last4: responseData?.cardLast4 || responseData?.last4,
              updatedAt: Date.now(),
            });
          }
        }
        
        return {
          success: true,
          transactionId: String(transactionId),
          message: 'Payment sent to terminal',
        };
      }
      
      if (!paymentSent) {
        // All endpoints failed - try to locate the transaction anyway
        console.error('❌ All payment endpoints failed. Checking for existing transaction...');
        try {
          const recentQuery = await this.makeRequest(
            'GET',
            `/card-transactions`,
            undefined,
            token
          );
          const rd = (recentQuery?.data as any) || {};
          const list = Array.isArray(rd) ? rd : (Array.isArray(rd?.transactions) ? rd.transactions : []);
          const match = list.find((t: any) => {
            const inv = t?.invoiceNumber || t?.invoice || t?.referenceNumber || t?.reference || '';
            return inv === invoiceNumber;
          });
          if (match) {
            const pid = match.id || match.transactionId || match.paymentId || invoiceNumber;
            if (typeof pid === 'string' && pid !== invoiceNumber) {
              try {
                const existing = sessionStore.get(invoiceNumber);
                if (existing) {
                  sessionStore.set(String(pid), existing);
                }
              } catch {}
              return { transactionId: pid, paymentId: pid, invoiceNumber, status: 'pending' };
            }
          }
        } catch {}
        // Return with pending state to enable polling
        try { console.warn('⚠️ Helcim purchase error; returning invoice for polling'); } catch {}
        return { invoiceNumber, status: 'pending' };
      }

      const data = response?.data || {};
      
      // Check for transaction ID in various response formats
      let transactionId = data?.transactionId || data?.id || data?.paymentId;
      
      // Check response headers for Location or transaction ID
      let locationHeader = response?.headers?.location || response?.headers?.Location;
      if (!locationHeader) {
        const raw = (response as any)?.headers || {};
        const lk = Object.keys(raw).find(k => k.toLowerCase() === 'location');
        if (lk) {
          locationHeader = (response as any).headers[lk];
        }
      }
      if (!locationHeader) {
        const raw = (response as any)?.res?.headers || {};
        const lk = Object.keys(raw).find(k => k.toLowerCase() === 'location');
        if (lk) {
          locationHeader = raw[lk];
        }
      }
      if (locationHeader && typeof locationHeader === 'string') {
        const match = locationHeader.match(/\/([^\/]+)$/);
        if (match?.[1]) {
          transactionId = match[1];
        }
      }
      
      // Store the payment in webhook cache with pending status
      if (transactionId) {
        webhookStore.set(String(transactionId), {
          status: 'pending',
          transactionId,
          updatedAt: Date.now(),
        });
        // Also store under invoice number for lookup
        try {
          if (invoiceNumber !== transactionId) {
            sessionStore.set(String(transactionId), {
              startedAt: Date.now(),
              locationId,
              deviceCode: config.deviceCode,
              totalAmount,
              // omit description in session typing to keep types minimal in dist
            });
          }
        } catch {}
        return { transactionId, paymentId: transactionId, invoiceNumber, status: 'pending' };
      }
      
      // If no transaction ID immediately available, check for it in the response
      const pid = data?.paymentId || data?.id || data?.transactionId || invoiceNumber;
      if (pid && typeof pid === 'string' && pid !== invoiceNumber) {
        try {
          const existing = sessionStore.get(invoiceNumber);
          if (existing) {
            sessionStore.set(String(pid), existing);
          }
        } catch {}
        return { ...data, transactionId: pid, paymentId: pid, invoiceNumber };
      }

      // Sometimes the transaction ID is returned after a brief delay
      // Try polling recent transactions for our invoice number
      const maxAttempts = 6;
      const pollDelayMs = 500;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const recentQuery = await this.makeRequest(
            'GET',
            `/card-transactions`,
            undefined,
            token
          );
          const rd = (recentQuery?.data as any) || {};
          const list = Array.isArray(rd) ? rd : (Array.isArray(rd?.transactions) ? rd.transactions : []);
          const match = list.find((t: any) => {
            const inv = t?.invoiceNumber || t?.invoice || t?.referenceNumber || t?.reference || '';
            return inv === invoiceNumber;
          });
          if (match) {
            const pid = match.id || match.transactionId || match.paymentId;
            if (typeof pid === 'string' && pid !== invoiceNumber) {
              try {
                const existing = sessionStore.get(invoiceNumber);
                if (existing) {
                  sessionStore.set(String(pid), existing);
                }
              } catch {}
              try { console.log('⚡ Found transactionId after purchase', { invoiceNumber, transactionId: pid }); } catch {}
              return { transactionId: pid, paymentId: pid, invoiceNumber, status: 'pending' };
            }
          }
        } catch {}
        // wait 500ms before next attempt
        await new Promise((r) => setTimeout(r, pollDelayMs));
      }

      // Return with invoice number for polling
      return { ...data, invoiceNumber, status: 'pending' };
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('Conflict') || msg.includes('busy') || msg.includes('in use')) {
        console.warn('⚠️ Terminal busy, returning invoice for status polling');
        return { invoiceNumber, status: 'pending' };
      }
      if (msg.includes('Not Found') || msg.includes('404') || msg.includes('not configured')) {
        console.error(`❌ Error starting payment on terminal ${config.terminalId}:`, error.message);
        throw error;
      }
      try { console.warn('⚠️ startPayment unexpected error; returning invoice for polling:', { invoiceNumber, msg }); } catch {}
      return { invoiceNumber, status: 'pending' };
    }
  }

  /**
   * Check webhook cache for payment status
   */
  checkWebhookCache(paymentId: string) {
    if (webhookStore.has(String(paymentId))) {
      return webhookStore.get(String(paymentId));
    }
    return null;
  }

  /**
   * Get cached webhook status (alias for checkWebhookCache)
   */
  getCachedWebhookStatus(paymentId: string) {
    return this.checkWebhookCache(paymentId);
  }

  /**
   * Check payment status on a terminal
   */
  async checkPaymentStatus(locationId: string, paymentId: string) {
    console.log('🔍 Checking payment status:', { locationId, paymentId });
    
    // Debug: Show what's in the cache
    const cacheKeys = Array.from(webhookStore.keys()).filter(k => !k.includes('GLOBAL'));
    console.log('🗑️ Current webhook cache keys:', cacheKeys.slice(-10)); // Show last 10 keys
    
    // Strict mode: do not auto-complete from global markers; require explicit cache match.

    // First check webhook cache - this is the most reliable source
    if (webhookStore.has(String(paymentId))) {
      const cached = webhookStore.get(String(paymentId))!;
      console.log('✅ Found payment in webhook cache:', cached);
      return {
        status: cached.status,
        transactionId: cached.transactionId || paymentId,
        last4: cached.last4,
        cardLast4: cached.last4,
        amount: (cached as any).amount,
        tipAmount: (cached as any).tipAmount,
        baseAmount: (cached as any).baseAmount,
      };
    } else {
      console.log(`⚠️ Payment ${paymentId} not found in webhook cache`);
    }
    
    // Check if we have an active session for this payment
    const session = sessionStore.get(String(paymentId));
    if (session) {
      console.log('📋 Found active session for payment');
      // Try to enrich status by querying recent card transactions and matching by invoice or id
      try {
        const looksLikeInvoice = String(paymentId).startsWith('POS-');
        const invoiceNumber = looksLikeInvoice ? String(paymentId) : undefined;
        // Resolve terminal config to obtain API token
        let cfg = session.locationId
          ? await this.configService.getTerminalConfig(session.locationId)
          : null;
        if (!cfg && session.deviceCode) {
          try { cfg = await this.configService.getTerminalConfigByDeviceCode(session.deviceCode); } catch {}
        }
        const apiToken = cfg?.apiToken || process.env.HELCIM_API_TOKEN;
        if (apiToken) {
          // CRITICAL: DO NOT attempt API enrichment during polling
          // Terminal transactions should only be marked complete via webhook
          console.log('⚠️ Terminal payment in progress - waiting for webhook confirmation');
          console.log('ℹ️ Not making API calls during polling to prevent false positives');
        }
      } catch {}
      // If we have a Helcim transaction ID in the session, fetch actual status from API
      // This is critical for catching cancelled payments when webhooks fail
      const helcimTxId = (session as any).helcimTxId || (session as any).transactionId;
      if (helcimTxId && /^\d+$/.test(String(helcimTxId))) {
        try {
          console.log(`🔍 Session has Helcim txId ${helcimTxId} - fetching actual status from API`);
          const transactionDetails = await this.helcimApiClient.getTransactionDetails(String(helcimTxId));
          
          let finalStatus = 'pending';
          let message = 'Processing payment...';
          
          if (this.helcimApiClient.isTransactionApproved(transactionDetails)) {
            finalStatus = 'completed';
            message = 'Payment successful';
            console.log('✅ Transaction APPROVED per Helcim API');
          } else if (this.helcimApiClient.isTransactionCancelled(transactionDetails)) {
            finalStatus = 'cancelled';
            message = 'Payment was cancelled';
            console.log('❌ Transaction CANCELLED per Helcim API');
          } else if (transactionDetails.declined) {
            finalStatus = 'failed';
            message = 'Payment was declined';
            console.log('❌ Transaction DECLINED per Helcim API');
          }
          
          // Update cache with the actual status
          const cacheData = {
            status: finalStatus as any,
            transactionId: helcimTxId,
            amount: transactionDetails.amount,
            updatedAt: Date.now()
          };
          webhookStore.set(String(helcimTxId), cacheData);
          webhookStore.set(String(paymentId), cacheData);
          
          // Calculate tip if we have base amount in session
          let tipAmount = 0;
          let baseAmount = session.baseAmount || transactionDetails.amount;
          if (session.baseAmount && transactionDetails.amount > session.baseAmount) {
            tipAmount = transactionDetails.amount - session.baseAmount;
            console.log(`💰 Calculated tip: base=$${session.baseAmount}, tip=$${tipAmount}, total=$${transactionDetails.amount}`);
          }
          
          return {
            status: finalStatus,
            transactionId: helcimTxId,
            amount: transactionDetails.amount,
            tipAmount: tipAmount,
            baseAmount: baseAmount,
            message: message
          };
        } catch (error) {
          console.error('❌ Failed to fetch from Helcim API:', error);
          // Fall through to pending status below
        }
      }
      
      // Still pending if we couldn't verify
      console.log(`⏳ Waiting for confirmation for ${paymentId}`);
      return {
        status: 'pending',
        message: 'Waiting for terminal confirmation...',
        transactionId: paymentId,
      };
    }
    
    // No cache or session - payment might be old or webhook was missed
    console.log('⚠️ No status found for payment:', paymentId);
    return {
      status: 'pending',
      message: 'Payment status unknown - check terminal',
      transactionId: paymentId,
    };
  }

  /**
   * Cancel an in-progress payment
   */
  async cancelPayment(locationId: string, paymentId: string) {
    const config = await this.configService.getTerminalConfig(locationId);
    if (!config) {
      throw new Error(`No terminal configured for location ${locationId}`);
    }

    try {
      const response = await this.makeRequest('POST', `/devices/${config.deviceCode}/transactions/${paymentId}/cancel`, undefined, config.apiToken);
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error canceling payment on terminal ${config.terminalId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get terminal status
   */
  async getTerminalStatus(locationId: string) {
    const config = await this.configService.getTerminalConfig(locationId);
    if (!config) {
      throw new Error(`No terminal configured for location ${locationId}`);
    }

    try {
      // Return a minimal status; detailed connectivity is exercised during payment
      return { success: true, status: 'configured', terminalId: config.terminalId, deviceCode: config.deviceCode };
    } catch (error: any) {
      console.error(`❌ Error getting terminal status ${config.terminalId}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle webhook payloads from Helcim and cache by invoiceNumber or transactionId
   * If only an id is provided, enrich by fetching transaction details.
   */
  async handleWebhook(payload: any) {
    try {
      console.log('🔍 Processing webhook payload:', JSON.stringify(payload, null, 2));
      console.log('📌 Webhook has transactionId:', payload?.transactionId || payload?.id, 'type:', payload?.type);
      
      // Debug: Show current sessions
      const currentSessions: string[] = [];
      sessionStore.forEach((value, key) => {
        const age = Date.now() - value.startedAt;
        if (age <= 10 * 60 * 1000) { // Sessions from last 10 minutes
          currentSessions.push(`${key} (${Math.round(age / 1000)}s old)`);
        }
      });
      console.log('📋 Active sessions when webhook arrived:', currentSessions.length > 0 ? currentSessions : 'NONE');
      
      // Extract invoice number - check for POS-* pattern in various fields
      let invoiceNumber = payload?.invoiceNumber || payload?.invoice || payload?.referenceNumber || payload?.reference || payload?.invoiceId;
      const transactionId = payload?.transactionId || payload?.cardTransactionId || payload?.id || payload?.paymentId;
      let last4 = payload?.last4 || payload?.cardLast4 || payload?.card?.last4 || payload?.cardLastFour || undefined;
      const amount = payload?.amount || payload?.totalAmount;
      
      // Log what we extracted
      console.log('📝 Extracted from webhook:', {
        invoiceNumber,
        transactionId,
        last4,
        amount,
        type: payload?.type
      });
      
      // Check various status fields from Helcim webhook
      const rawStatus = String(
        payload?.status || 
        payload?.result || 
        payload?.outcome || 
        payload?.type || 
        payload?.approved || 
        ''
      ).toLowerCase();
      
      console.log('📊 Webhook status fields:', {
        invoiceNumber,
        transactionId,
        rawStatus,
        last4,
        amount,
        approved: payload?.approved,
        type: payload?.type
      });
      
      // CRITICAL FIX: Be conservative with status detection
      // DEFAULT TO PENDING to prevent auto-completion of failed transactions
      let normalized: 'completed' | 'failed' | 'pending' = 'pending';
      
      // CRITICAL: Check webhook TYPE first - 'cardTransaction' type means SUCCESS
      // This is the standard Helcim Smart Terminal success webhook format
      if (payload?.type === 'cardTransaction') {
        console.log('✅ Smart Terminal cardTransaction webhook - marking as COMPLETED');
        console.log('   This is the standard format for successful terminal payments');
        normalized = 'completed';
      }
      // Check for terminal-specific failure types
      else if (payload?.type === 'terminalDecline' || payload?.type === 'terminalCancel') {
        console.log('❌ Smart Terminal declined/cancelled webhook detected');
        normalized = 'failed';
      }
      // Check for EXPLICIT success indicators
      else if (
        rawStatus.includes('approved') || 
        rawStatus.includes('success') || 
        rawStatus.includes('completed') || 
        rawStatus.includes('captured') || 
        rawStatus.includes('sale') ||
        rawStatus === 'true' || // Sometimes 'approved' field is boolean
        payload?.approved === true ||
        payload?.approved === 'true' ||
        payload?.approved === 1 ||
        payload?.approved === '1' ||
        payload?.status === 'completed' ||
        payload?.status === 'approved'
      ) {
        console.log('✅ Payment EXPLICITLY approved/completed in webhook');
        normalized = 'completed';
      } 
      // Check for failure indicators
      else if (
        rawStatus.includes('declined') || 
        rawStatus.includes('failed') || 
        rawStatus.includes('canceled') || 
        rawStatus.includes('cancelled') ||
        rawStatus.includes('voided') ||
        rawStatus.includes('refunded') ||
        rawStatus.includes('error') ||
        rawStatus.includes('rejected') ||
        rawStatus.includes('insufficient') ||
        payload?.approved === false ||
        payload?.approved === 'false' ||
        payload?.approved === 0 ||
        payload?.approved === '0' ||
        payload?.status === 'failed' ||
        payload?.status === 'cancelled' ||
        payload?.status === 'declined'
      ) {
        console.log('❌ Payment declined/failed status detected in webhook');
        normalized = 'failed';
      }
      // NO CLEAR STATUS - keep as pending (DO NOT auto-complete!)
      else {
        console.log('⚠️ Webhook status unclear - keeping as PENDING to prevent auto-completion');
        console.log('   Cannot determine status from:', {
          approved: payload?.approved,
          status: payload?.status,
          type: payload?.type,
          rawStatus
        });
        // DO NOT default to completed for any webhook type!
      }
      
      console.log('✅ Webhook normalized status:', normalized);

      if (!invoiceNumber && !transactionId) {
        console.log('⚠️ No invoice or transaction ID in webhook');
        return;
      }

      // Always try to enrich the webhook data if we have a transaction ID
      // This will help us get the invoice number and card last 4 digits
      let enrichmentAttempted = false;
      let enrichmentSuccess = false;
      
      // Try to find the session to get the invoice number and base amount
      let sessionKey: string | null = null;
      let session: { startedAt: number; locationId: string; deviceCode: string; baseAmount?: number } | null = null;
      if (invoiceNumber && sessionStore.has(String(invoiceNumber))) {
        sessionKey = String(invoiceNumber);
        session = sessionStore.get(sessionKey)!;
      } else if (!invoiceNumber && transactionId) {
        // Try to find session by recent time window
        const now = Date.now();
        let bestKey: string | null = null;
        let best: { startedAt: number; locationId: string; deviceCode: string; baseAmount?: number } | null = null;
        sessionStore.forEach((value, key) => {
          if (now - value.startedAt <= 10 * 60 * 1000) {
            if (!best || value.startedAt > best.startedAt) {
              best = value;
              bestKey = key;
            }
          }
        });
        if (best && bestKey) {
          session = best;
          sessionKey = bestKey;
          if (!invoiceNumber) {
            invoiceNumber = bestKey; // Use session key as invoice number
            console.log('📝 Using session key as invoice number:', invoiceNumber);
          }
        }
      }

      // Try to enrich the webhook data by querying the transaction details
      // This helps us get the invoice number, card last 4 digits, and tip amounts
      // Always enrich if we have a transaction ID to get complete payment details including tips
      if (transactionId) {
        enrichmentAttempted = true;
        try {
          let apiToken: string | undefined;
          try {
            const cfg = await this.configService.getAnyActiveTerminalConfig();
            apiToken = cfg?.apiToken || process.env.HELCIM_API_TOKEN;
          } catch {
            apiToken = process.env.HELCIM_API_TOKEN;
          }
          if (apiToken) {
            console.log('🔄 Attempting to enrich transaction:', transactionId);
            // Try to get transaction details from Helcim API
            // Note: Helcim v2 API doesn't have a direct endpoint to get transaction by ID
            // The enrichment will likely fail, but we'll handle it gracefully
            let t: any = {};
            try {
              // Attempt to get transaction details (this endpoint may not exist in v2)
              const resp = await this.makeRequest('GET', `/payment/transaction/${transactionId}`, undefined, apiToken);
              t = (resp?.data as any) || {};
            } catch (err) {
              // If direct transaction lookup fails, that's okay - we'll use webhook data
              console.log('ℹ️ Transaction details not available via API, using webhook data');
              t = payload; // Use webhook payload as fallback
            }
            
            // Log the full response to debug tip handling
            console.log('💳 Full transaction details from Helcim:', JSON.stringify(t, null, 2));
            
            const inv = t?.invoiceNumber || t?.invoice || t?.referenceNumber || t?.reference || undefined;
            const l4 = t?.cardLast4 || t?.last4 || t?.card?.last4 || t?.cardNumber || last4;
            
            // Extract total amount from Helcim (includes tip)
            const totalAmount = t?.amount || t?.totalAmount || t?.transactionAmount || t?.total || payload?.amount;
            
            // If initial webhook didn't indicate outcome, derive it from enriched details
            if (normalized !== 'completed' && normalized !== 'failed') {
              const enrichedRaw = String(
                t?.status || t?.result || t?.outcome || t?.type || t?.approved || ''
              ).toLowerCase();
              const enrichedApproved = t?.approved === true || String(t?.approved).toLowerCase() === 'true';
              if (
                enrichedApproved ||
                enrichedRaw.includes('approved') ||
                enrichedRaw.includes('success') ||
                enrichedRaw.includes('completed') ||
                enrichedRaw.includes('captured') ||
                enrichedRaw.includes('sale')
              ) {
                console.log('✅ Enriched transaction indicates completion');
                normalized = 'completed';
              } else if (
                enrichedRaw.includes('declined') ||
                enrichedRaw.includes('failed') ||
                enrichedRaw.includes('voided') ||
                enrichedRaw.includes('refunded') ||
                enrichedRaw.includes('canceled') ||
                enrichedRaw.includes('cancelled')
              ) {
                console.log('❌ Enriched transaction indicates failure');
                normalized = 'failed';
              }
            }

            // Helcim doesn't return tip as separate field, so calculate it from session data
            let tipAmount = 0;
            let baseAmount = totalAmount;
            
            // Try to get base amount from session to calculate tip
            if (session && session.baseAmount && totalAmount) {
              baseAmount = session.baseAmount;
              tipAmount = Number((totalAmount - baseAmount).toFixed(2));
              console.log('💰 TIP CALCULATION FROM SESSION - ENRICHED:', { 
                baseAmount, 
                tipAmount, 
                totalAmount,
                sessionKey,
                transactionId 
              });
            } else {
              console.log('⚠️ Unable to calculate tip - missing data:', {
                hasSession: !!session,
                sessionBaseAmount: session?.baseAmount,
                totalAmount,
                sessionKey
              });
            }
            
            if (inv) invoiceNumber = String(inv);
            if (l4) last4 = String(l4);
            
            // Store the amounts in the payload for caching
            if (totalAmount) payload.amount = totalAmount;
            if (tipAmount) payload.tipAmount = tipAmount;
            if (baseAmount) payload.baseAmount = baseAmount;
            
            console.log('🧩 Enriched webhook via API', { 
              invoiceNumber, 
              last4, 
              transactionId,
              totalAmount,
              tipAmount,
              baseAmount
            });
            enrichmentSuccess = true;
          }
        } catch (e) {
          const errorMsg = String((e as any)?.message || e);
          // Don't worry about 404 errors - the transaction might not be immediately available
          if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
            console.log('ℹ️ Transaction not yet available in API; proceeding with minimal webhook data');
          } else {
            console.log('⚠️ Transaction enrichment failed:', errorMsg);
          }
        }
      } else {
        console.log('⚠️ No API token available for enrichment');
      }

      // CRITICAL FIX: If Helcim omitted invoiceNumber, match to recent sessions
      if (!invoiceNumber && transactionId) {
        console.log('⚠️ No invoice number in webhook, attempting to match to recent sessions...');
        
        // FIRST: Check if we have a session stored by this exact transaction ID
        const sessionByTxId = sessionStore.get(String(transactionId));
        if (sessionByTxId && sessionByTxId.invoiceNumber) {
          invoiceNumber = sessionByTxId.invoiceNumber;
          console.log(`✅ Found session by exact txId! Using invoice: ${invoiceNumber}`);
          session = sessionByTxId;
          sessionKey = invoiceNumber;
        } else {
          // FALLBACK: Find the most recent session
          try {
            const now = Date.now();
            let bestMatchKey: string | null = null;
            let bestMatchSession: any = null;
            let bestMatchAge: number = Infinity;
            
            sessionStore.forEach((value, key) => {
              // Consider ALL session keys, not just POS-* or INV*
              // Payment start now uses numeric-only invoice numbers
              const age = now - value.startedAt;
              if (age <= 5 * 60 * 1000) { // Within 5 minutes
                // Prefer the most recent session
                if (age < bestMatchAge) {
                  bestMatchKey = key;
                  bestMatchSession = value;
                  bestMatchAge = age;
                }
              }
            });
            
            if (bestMatchKey && bestMatchSession) {
              // Use the invoice number from the session if available, otherwise use the key
              invoiceNumber = bestMatchSession.invoiceNumber || bestMatchKey;
              console.log(`✅ Matched webhook to recent session: ${invoiceNumber} (${Math.round(bestMatchAge / 1000)}s old)`);
              session = bestMatchSession;
              sessionKey = bestMatchKey;
              
              // Also store the session by transaction ID for future lookups
              sessionStore.set(String(transactionId), bestMatchSession);
            } else {
              console.log('❌ No matching session found in last 5 minutes');
            }
          } catch (err) {
            console.error('❌ Error matching webhook to session:', err);
          }
        }
      }

      // If we didn't get tip amount from enrichment but have session with base amount, calculate it
      if (!payload?.tipAmount && session?.baseAmount && payload?.amount) {
        const totalAmount = payload.amount;
        const baseAmount = session.baseAmount;
        const tipAmount = Number((totalAmount - baseAmount).toFixed(2));
        
        payload.baseAmount = baseAmount;
        payload.tipAmount = tipAmount;
        
        console.log('💰 TIP CALCULATION FROM SESSION - NO ENRICHMENT:', { 
          baseAmount, 
          tipAmount, 
          totalAmount,
          sessionKey: sessionKey || 'unknown',
          invoiceNumber,
          transactionId
        });
      } else if (!payload?.tipAmount) {
        console.log('⚠️ NO TIP CALCULATED - Missing required data:', {
          hasTipInPayload: !!payload?.tipAmount,
          hasSession: !!session,
          sessionBaseAmount: session?.baseAmount,
          payloadAmount: payload?.amount,
          invoiceNumber,
          transactionId
        });
      }
      
      // Cache under both keys so polling by either id can resolve
      const cacheValue = {
        status: normalized,
        transactionId,
        last4,
        amount: payload?.amount,
        tipAmount: payload?.tipAmount,
        baseAmount: payload?.baseAmount,
        updatedAt: Date.now(),
        invoiceNumber,  // Store invoice number if we have it
      } as const;
      
      // Cache by invoice number
      if (invoiceNumber) {
        webhookStore.set(String(invoiceNumber), cacheValue);
        console.log(`💾 Cached by invoice: ${invoiceNumber} -> status: ${normalized}`);
      }
      
      // CRITICAL: Always cache by transaction ID - this is what we get from Helcim
      // This ensures webhooks that arrive before payment creation can still be found
      if (transactionId) {
        webhookStore.set(String(transactionId), cacheValue);
        console.log(`💾 Cached by transaction: ${transactionId} -> status: ${normalized}`);
        
        // Also store in a special "orphan" cache for webhooks without sessions
        // These can be checked when payments are created later
        if (!session && !invoiceNumber) {
          const orphanKey = `ORPHAN_${transactionId}`;
          webhookStore.set(orphanKey, cacheValue);
          console.log(`⚠️ Webhook cached as orphan (no session yet): ${orphanKey}`);
        }
      }
      
      // CRITICAL: Always try to match webhooks to recent sessions (both POS-* and INV*)
      // This is essential because Helcim doesn't include our invoice number in webhooks
      if (transactionId && !invoiceNumber) {
        console.log('🔍 Looking for recent sessions to match webhook...');
        const now = Date.now();
        let bestMatch: { key: string; age: number; session: any } | null = null;
        
        sessionStore.forEach((value, key) => {
          // Match both POS-* (terminal) and INV* (Helcim Pay.js) sessions
          if (key && (key.startsWith('POS-') || key.startsWith('INV'))) {
            const age = now - value.startedAt;
            // Only consider very recent sessions (last 5 minutes for single match)
            if (age <= 5 * 60 * 1000) {
              if (!bestMatch || age < bestMatch.age) {
                bestMatch = { key, age, session: value };
              }
            }
          }
        });
        
        if (bestMatch) {
          const match = bestMatch as { key: string; age: number; session: any };
          console.log(`🎯 Found matching session: ${match.key} (${Math.round(match.age / 1000)}s old)`);
          
          // Cache under the session key (invoice number)
          webhookStore.set(match.key, cacheValue);
          console.log(`✅ Cached payment under session key: ${match.key} -> status: ${normalized}`);
          
          // Update the invoice number for further processing
          invoiceNumber = match.key;
          
          // If the session has a payment ID, also cache by that
          if (match.session.paymentId) {
            const paymentKey = `INV${String(match.session.paymentId).padStart(6, '0')}`;
            webhookStore.set(paymentKey, cacheValue);
            console.log(`✅ Also cached by payment ID: ${paymentKey}`);
          }
        } else {
          console.log('⚠️ No recent POS-* or INV* sessions found - webhook may not match any payment!');
        }
      }
      
      // If we have an invoice number now (either from webhook or matched session), ensure it's cached
      if (invoiceNumber && !webhookStore.has(invoiceNumber)) {
        webhookStore.set(invoiceNumber, cacheValue);
        console.log(`💾 Ensured cached by invoice: ${invoiceNumber} -> status: ${normalized}`);
      }
      
      // Also record a global last-completed marker to allow simple confirmation flows
      if (normalized === 'completed') {
        try {
          webhookStore.set('__GLOBAL_LAST_COMPLETED__', cacheValue as any);
          (globalThis as any).__HEL_WEBHOOK_LAST_COMPLETED__ = {
            status: 'completed',
            transactionId: transactionId,
            invoiceNumber: invoiceNumber,
            last4: last4,
            amount: payload?.amount,
            tipAmount: payload?.tipAmount,
            baseAmount: payload?.baseAmount,
            updatedAt: Date.now(),
          };
        } catch {}
      }
      
      // Also try to match with any active sessions that might be waiting
      // This helps when the invoice number format doesn't match exactly
      if (normalized === 'completed' && sessionStore.size > 0) {
        const now = Date.now();
        const recentThreshold = 5 * 60 * 1000; // 5 minutes
        
        sessionStore.forEach((session, sessionKey) => {
          // Check if this is a recent session that might be waiting for this webhook
          if (now - session.startedAt <= recentThreshold) {
            console.log(`🔄 Checking session ${sessionKey} for match...`);
            
            // If we don't have a specific invoice match, consider this might be the payment
            // for the most recent session (especially if it's the only recent one)
            if (!webhookStore.has(sessionKey)) {
              console.log(`📌 Associating webhook with session ${sessionKey}`);
              webhookStore.set(sessionKey, cacheValue);
            }
          }
        });
      }

      console.log('✅ Webhook processing complete:', { 
        invoiceNumber, 
        transactionId, 
        status: normalized, 
        last4,
        cachedKeys: Array.from(webhookStore.keys()).filter(k => !k.includes('GLOBAL')) // Show all non-global keys
      });
    } catch (error: any) {
      console.error('❌ Error handling webhook:', error);
      
      // CRITICAL: Even if there's an error, try to cache the webhook
      // This ensures we don't lose payment status
      try {
        const fallbackTransactionId = payload?.transactionId || payload?.id;
        if (fallbackTransactionId) {
          // DO NOT default to completed - use pending to prevent auto-completion
          const fallbackCache = {
            status: 'pending' as const, // SAFE DEFAULT - don't assume success on error
            transactionId: fallbackTransactionId,
            updatedAt: Date.now(),
          };
          
          // Cache by transaction ID
          webhookStore.set(String(fallbackTransactionId), fallbackCache);
          console.log('🆘 Emergency cache: Stored webhook as PENDING due to error');
          
          // Also try to cache under recent POS sessions
          const now = Date.now();
          sessionStore.forEach((value, key) => {
            if (key && key.startsWith('POS-')) {
              const age = now - value.startedAt;
              if (age <= 10 * 60 * 1000) {
                webhookStore.set(key, fallbackCache);
                console.log(`🆘 Emergency cache: Also cached as PENDING under ${key}`);
              }
            }
          });
        }
      } catch (emergencyError) {
        console.error('❌❌ Even emergency caching failed:', emergencyError);
      }
    }
  }

  /**
   * Debug snapshot of recent sessions and webhooks for troubleshooting
   */
  getDebugSnapshot() {
    const sessions: any[] = [];
    sessionStore.forEach((value, key) => {
      sessions.push({ key, ...value });
    });
    
    const webhooks: any[] = [];
    webhookStore.forEach((value, key) => {
      webhooks.push({ key, ...value });
    });
    
    return {
      sessions: sessions.slice(-10),
      webhooks: webhooks.slice(-10),
      sessionCount: sessionStore.size,
      webhookCount: webhookStore.size,
    };
  }

  // Removed duplicate getCachedWebhookStatus and checkWebhookCache - defined earlier in the file

  private async makeRequest(method: string, endpoint: string, data?: any, apiToken?: string, extraHeaders?: Record<string, string>) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`🌐 Making ${method} request to: ${url}`);
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'api-token': apiToken,
          // Send Bearer as well for environments that require it
          ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...extraHeaders
        },
        data,
      });

      return response;
    } catch (error: any) {
      console.error('❌ Helcim API request failed:', {
        url: `${this.baseUrl}${endpoint}`,
        method,
        error: error.response?.data || error.message
      });
      
      if (error.response) {
        const errorMessage = error.response.data?.message || 
                            error.response.data?.error || 
                            error.response.statusText || 
                            'API request failed';
        throw new Error(errorMessage);
      }
      throw error;
    }
  }
}
