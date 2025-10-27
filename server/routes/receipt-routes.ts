import { Router } from 'express';
import { IStorage } from '../storage.js';
import { sendSMS } from '../sms.js';
import { sendEmail } from '../email.js';

interface PaymentDetailsExtracted {
  amount: number;
  tipAmount?: number;
  transactionId?: string;
  cardLast4?: string;
  timestamp: string;
  description: string;
}

/**
 * Extracts and normalizes payment details from various possible field names
 * to handle different payment provider response formats
 */
function extractPaymentDetails(paymentDetails: any): PaymentDetailsExtracted {
  // Ensure amount is a valid number
  const amount = Number(paymentDetails.amount || paymentDetails.total || 0);
  
  if (isNaN(amount)) {
    throw new Error('Invalid amount provided');
  }
  
  return {
    amount: amount,
    tipAmount: paymentDetails.tipAmount ? Number(paymentDetails.tipAmount) : undefined,
    transactionId: paymentDetails.transactionId,
    cardLast4: paymentDetails.last4 || paymentDetails.cardLast4,
    timestamp: new Date(paymentDetails.timestamp || Date.now()).toLocaleString(),
    description: paymentDetails.description || 'Payment'
  };
}

/**
 * Formats payment details into a plain text receipt for SMS
 */
function formatTextReceipt(paymentDetails: PaymentDetailsExtracted): string {
  const { amount, tipAmount, transactionId, cardLast4, timestamp, description } = paymentDetails;
  
  // Special handling for balance inquiries
  if (description && description.includes('Balance Inquiry')) {
    let message = `Gift Card Balance\n`;
    message += `================\n`;
    message += `${description}\n\n`;
    message += `Date: ${timestamp}\n`;
    message += `Current Balance: $${amount.toFixed(2)}`;
    
    if (transactionId) {
      message += `\nCard: ${transactionId.replace('Balance-', '')}`;
    }
    
    message += `\n\nThank you for checking your balance!`;
    return message;
  }
  
  let message = `Payment Receipt\n`;
  message += `================\n`;
  message += `${description}\n\n`;
  message += `Date: ${timestamp}\n`;
  
  // Include tip breakdown if tip was provided
  if (tipAmount && tipAmount > 0) {
    const subtotal = amount - tipAmount;
    message += `Subtotal: $${subtotal.toFixed(2)}\n`;
    message += `Tip: $${tipAmount.toFixed(2)}\n`;
    message += `Total: $${amount.toFixed(2)}`;
  } else {
    message += `Amount: $${amount.toFixed(2)}`;
  }

  if (cardLast4) {
    message += `\nCard: ****${cardLast4}`;
  }

  if (transactionId) {
    message += `\nTransaction ID: ${transactionId}`;
  }

  message += `\n\nThank you for your payment!`;
  return message;
}

/**
 * Formats payment details into an HTML receipt for email
 */
function formatHtmlReceipt(paymentDetails: PaymentDetailsExtracted): string {
  const { amount, tipAmount, transactionId, cardLast4, timestamp, description } = paymentDetails;
  
  // Special handling for balance inquiries
  if (description && description.includes('Balance Inquiry')) {
    const cardCode = transactionId ? transactionId.replace('Balance-', '') : '';
    
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Gift Card Balance</h2>
        <p style="color: #666; font-size: 16px; margin-top: 20px;">${description}</p>
        
        <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #666;">Date:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold;">${timestamp}</td>
          </tr>
          ${cardCode ? `
          <tr>
            <td style="padding: 10px 0; color: #666;">Card Number:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; font-family: monospace;">${cardCode}</td>
          </tr>` : ''}
          <tr style="border-top: 2px solid #ddd;">
            <td style="padding: 10px 0; color: #333; font-size: 18px;">Current Balance:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px; color: #4CAF50;">$${amount.toFixed(2)}</td>
          </tr>
        </table>
        
        <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
          <p style="margin: 0; color: #666; font-size: 14px;">
            This gift card can be used at any of our locations: Glo Head Spa, GloUp Medical Spa, Flutter Eyelash Salon or The Extensionist.
          </p>
        </div>
        
        <p style="margin-top: 30px; color: #999; font-size: 12px; text-align: center;">
          Thank you for checking your balance!<br>
          <a href="https://one0-22-25.onrender.com/booking" style="color: #4CAF50; text-decoration: none;">Book Your Appointment</a>
        </p>
      </div>`;
      
    return html;
  }
  
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Payment Receipt</h2>
      <p style="color: #666; font-size: 16px; margin-top: 20px;">${description}</p>
      
      <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #666;">Date:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: bold;">${timestamp}</td>
        </tr>`;

  // Include tip breakdown if tip was provided
  if (tipAmount && tipAmount > 0) {
    const subtotal = amount - tipAmount;
    html += `
        <tr>
          <td style="padding: 10px 0; color: #666;">Subtotal:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: bold;">$${subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;">Tip:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #4CAF50;">$${tipAmount.toFixed(2)}</td>
        </tr>
        <tr style="border-top: 2px solid #ddd;">
          <td style="padding: 10px 0; color: #333; font-size: 18px;">Total:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px; color: #333;">$${amount.toFixed(2)}</td>
        </tr>`;
  } else {
    html += `
        <tr style="border-top: 2px solid #ddd;">
          <td style="padding: 10px 0; color: #333; font-size: 18px;">Total:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px; color: #333;">$${amount.toFixed(2)}</td>
        </tr>`;
  }

  if (cardLast4) {
    html += `
        <tr>
          <td style="padding: 10px 0; color: #666;">Payment Method:</td>
          <td style="padding: 10px 0; text-align: right;">Card ****${cardLast4}</td>
        </tr>`;
  }

  if (transactionId) {
    html += `
        <tr>
          <td style="padding: 10px 0; color: #666;">Transaction ID:</td>
          <td style="padding: 10px 0; text-align: right; font-family: monospace; font-size: 12px;">${transactionId}</td>
        </tr>`;
  }

  html += `
      </table>
      
      <div style="margin-top: 30px; padding: 20px; background-color: #f5f5f5; border-radius: 5px; text-align: center;">
        <p style="color: #666; margin: 0;">Thank you for your payment!</p>
      </div>
    </div>`;

  return html;
}

/**
 * Sends receipt via email using SendGrid
 */
async function sendEmailReceipt(
  recipient: string, 
  paymentDetails: PaymentDetailsExtracted
): Promise<{ success: boolean; error?: string }> {
  const htmlContent = formatHtmlReceipt(paymentDetails);
  const plainTextContent = formatTextReceipt(paymentDetails);

  const success = await sendEmail({
    to: recipient,
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
    subject: 'Payment Receipt',
    text: plainTextContent,
    html: htmlContent,
  });

  if (success) {
    console.log(`📧 Email receipt sent to ${recipient}`);
    return { success: true };
  } else {
    console.error('Failed to send email receipt');
    return { success: false, error: 'Failed to send email receipt' };
  }
}

/**
 * Sends receipt via SMS using Twilio
 */
async function sendSmsReceipt(
  recipient: string, 
  paymentDetails: PaymentDetailsExtracted
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const message = formatTextReceipt(paymentDetails);
  const result = await sendSMS(recipient, message);

  if (result.success) {
    console.log(`📱 SMS receipt sent to ${recipient}`);
    return { success: true, messageId: result.messageId };
  } else {
    console.error('Failed to send SMS receipt:', result.error);
    return { success: false, error: result.error || 'Failed to send SMS receipt' };
  }
}

export default function createReceiptRoutes(storage: IStorage) {
  const router = Router();

  router.post('/send-receipt', async (req, res) => {
    try {
      const { type, recipient, paymentDetails } = req.body;

      if (!type || !recipient || !paymentDetails) {
        return res.status(400).json({ 
          error: 'Missing required fields: type, recipient, and paymentDetails' 
        });
      }

      const extractedPaymentDetails = extractPaymentDetails(paymentDetails);

      if (type === 'email') {
        const result = await sendEmailReceipt(recipient, extractedPaymentDetails);
        
        if (result.success) {
          return res.json({ success: true, message: 'Email receipt sent successfully' });
        } else {
          return res.status(500).json({ error: result.error });
        }
        
      } else if (type === 'sms') {
        const result = await sendSmsReceipt(recipient, extractedPaymentDetails);
        
        if (result.success) {
          return res.json({ 
            success: true, 
            message: 'SMS receipt sent successfully', 
            messageId: result.messageId 
          });
        } else {
          return res.status(500).json({ error: result.error });
        }
        
      } else {
        return res.status(400).json({ error: 'Invalid receipt type. Use "email" or "sms"' });
      }

    } catch (error: any) {
      console.error('Error sending receipt:', error);
      return res.status(500).json({ 
        error: 'Failed to send receipt', 
        details: error.message 
      });
    }
  });

  return router;
}
