import axios from 'axios';

export class HelcimApiClient {
  private apiToken: string;
  private baseUrl = 'https://api.helcim.com/v2';

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.HELCIM_API_TOKEN || '';
    if (!this.apiToken) {
      console.warn('⚠️ Helcim API token not configured');
    }
  }

  /**
   * Fetch full transaction details from Helcim API
   * This is required because webhooks only send minimal payload: {"id":"TRANSACTION_ID", "type":"cardTransaction"}
   */
  async getTransactionDetails(transactionId: string) {
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    if (!this.apiToken) {
      throw new Error('Helcim API token not configured');
    }

    try {
      console.log(`📡 Fetching transaction details from Helcim for ID: ${transactionId}`);
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/card-transactions/${transactionId}`,
        headers: {
          'api-token': this.apiToken,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      const transaction = response.data;
      
      console.log('✅ Transaction details fetched:', {
        id: transaction.id,
        status: transaction.status,
        approved: transaction.approved,
        amount: transaction.amount,
        tipAmount: transaction.tipAmount,
        invoiceNumber: transaction.invoiceNumber,
        cardLast4: transaction.cardLast4,
        type: transaction.type
      });

      // Parse the transaction to extract key fields
      return {
        id: transaction.id,
        transactionId: transaction.id,
        status: transaction.status,
        approved: transaction.approved === true || transaction.approved === 'true' || transaction.approved === 1,
        declined: transaction.approved === false || transaction.approved === 'false' || transaction.approved === 0,
        amount: parseFloat(transaction.amount || 0),
        // IMPORTANT: Helcim doesn't separate tips in the API response
        // The amount includes the tip already
        // We need to get the base amount from our session or payment record
        tipAmount: parseFloat(transaction.tipAmount || 0),
        totalAmount: parseFloat(transaction.amount || 0),
        invoiceNumber: transaction.invoiceNumber,
        referenceNumber: transaction.referenceNumber,
        cardLast4: transaction.cardLast4 || transaction.cardNumber?.slice(-4),
        cardType: transaction.cardType || transaction.cardBrand,
        responseMessage: transaction.responseMessage,
        approvalCode: transaction.approvalCode,
        customerCode: transaction.customerCode,
        dateCreated: transaction.dateCreated,
        currency: transaction.currency,
        type: transaction.type,
        // Check if this was cancelled or voided
        voided: transaction.voided === true || transaction.voided === 'true',
        reversed: transaction.reversed === true || transaction.reversed === 'true',
        // Full response for debugging
        raw: transaction
      };
    } catch (error: any) {
      console.error('❌ Failed to fetch transaction details from Helcim:', error.message);
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        headers: error.response?.headers
      });
      
      // Return minimal info if fetch fails
      return {
        id: transactionId,
        transactionId: transactionId,
        status: 'unknown',
        approved: false,
        error: error.message
      };
    }
  }

  /**
   * Verify if a transaction is approved
   */
  isTransactionApproved(transaction: any): boolean {
    // Check multiple fields for approval status
    if (transaction.voided || transaction.reversed) {
      return false;
    }
    
    if (transaction.declined) {
      return false;
    }
    
    // Check explicit approval
    if (transaction.approved === true || transaction.approved === 'true' || transaction.approved === 1) {
      return true;
    }
    
    // Check status field
    const status = String(transaction.status || '').toLowerCase();
    if (status === 'approved' || status === 'completed' || status === 'success') {
      return true;
    }
    
    return false;
  }

  /**
   * Check if a transaction was cancelled
   */
  isTransactionCancelled(transaction: any): boolean {
    if (transaction.voided || transaction.reversed) {
      return true;
    }
    
    const status = String(transaction.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'canceled' || status === 'voided') {
      return true;
    }
    
    return false;
  }
}

export const helcimApiClient = new HelcimApiClient();
