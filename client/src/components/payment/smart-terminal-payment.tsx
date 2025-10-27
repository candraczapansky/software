import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreditCard, CheckCircle, XCircle, Mail, MessageCircle, Send } from 'lucide-react';

interface PaymentResponse {
  success: boolean;
  status: string;
  transactionId?: string;
  last4?: string;
  cardLast4?: string;
  amount?: number;
  tipAmount?: number;
  baseAmount?: number;
  paymentMethod?: string;
}

interface SmartTerminalPaymentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  onSuccess?: (response: any) => void;
  onError?: (error: any) => void;
  description?: string;
  locationId?: number | string;
  tipAmount?: number;
}

export default function SmartTerminalPayment({
  open,
  onOpenChange,
  amount,
  onSuccess,
  onError,
  description = "Payment",
  locationId,
  tipAmount,
}: SmartTerminalPaymentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [paymentDetails, setPaymentDetails] = useState<PaymentResponse | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const { toast } = useToast();
  
  // CRITICAL: Track if polling should continue
  const shouldPollRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: NEVER stop polling just because dialog closes
  // Terminal payments and webhooks continue regardless of UI state
  useEffect(() => {
    if (!open && status === 'idle') {
      // Only reset if truly idle (not started yet)
      setMessage('');
      setIsLoading(false);
      setPaymentDetails(null);
    } else if (!open && (status === 'processing' || status === 'waiting')) {
      // Payment is active - KEEP POLLING for webhook!
      console.log('🔄 Dialog closed but payment active - continuing to poll for webhook');
      // DO NOT stop polling or reset state
    }
    // Never stop polling here - let it run for the full duration
    
    // DO NOT stop polling on cleanup - terminal payments continue!
    // The webhook will arrive even after dialog closes
    // Polling should continue for the full duration to catch the webhook
  }, [open, status]);

  const startPayment = async () => {
    // Pre-generate a reference so we can attach to an in-progress terminal session if Helcim returns a conflict
    const preReference = `POS-${Date.now()}`;
    try {
      setIsLoading(true);
      setStatus('processing');
      setMessage('Initializing payment terminal...');

      // Start the payment process
      const response = await apiRequest('POST', '/api/terminal/payment/start', {
        locationId: String(locationId ?? ''),
        amount,
        description,
        reference: preReference,
        tipAmount: typeof tipAmount === 'number' ? tipAmount : undefined,
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to start payment');
      }

      // Derive a payment identifier from multiple possible fields
      const pid = (data?.paymentId) || (data?.transactionId) || (data?.id) || (data?.invoiceNumber);
      const sessionId = data?.invoiceNumber || pid;

      // Poll for payment status only if we have an identifier
      console.log('🔄 Starting to poll for payment status with ID:', pid || sessionId);
      if (pid) {
        await pollPaymentStatus(String(locationId ?? ''), String(pid));
      } else {
        // No id yet; keep UI in processing and use invoice-based session to unblock later
        if (sessionId) {
          console.log('📋 Polling with invoice number:', sessionId);
          await pollPaymentStatus(String(locationId ?? ''), String(sessionId));
        } else {
          setMessage('Waiting for terminal to acknowledge transaction...');
        }
      }

    } catch (error) {
      // CRITICAL: Check if this was a cancellation
      const errMsg = String((error as any)?.message || error || '').toLowerCase();
      if (errMsg === 'cancelled' || !shouldPollRef.current) {
        console.log('⛔ Payment cancelled');
        setIsLoading(false);
        setStatus('idle');
        setMessage('');
        return;
      }
      
      // If Helcim reports a conflict/busy terminal, attach to the in-progress session using our pre-generated reference
      if (errMsg.includes('conflict') || errMsg.includes('busy')) {
        try {
          setStatus('processing');
          setMessage('Terminal is busy. Attaching to in-progress payment...');
          const locId = String(locationId ?? '');
          const ref = preReference;
          await pollPaymentStatus(locId, ref);
          return;
        } catch (attachErr) {
          // Fall through to error handling below
        }
      }
      console.error('Payment failed:', error);
      setStatus('error');
      setMessage('Payment failed. Please try again.');
      handlePaymentError(error);
    }
    
    // Continue processing even if dialog closed - payment continues on terminal
  };

  const pollPaymentStatus = async (locId: string, paymentId: string) => {
    // Set flag to indicate polling should start
    shouldPollRef.current = true;
    
    try {
      let attempts = 0;
      const maxAttempts = 90; // 3 minutes with 2-second intervals - enough for webhook but not blocking
      let currentId = paymentId;
      
      const poll = async () => {
        // Check if we should continue polling
        if (!shouldPollRef.current && status === 'idle') {
          // Only stop if explicitly idle
          console.log('⛔ Polling stopped - idle status');
          setStatus('idle');
          setMessage('');
          setIsLoading(false);
          return; // Exit gracefully without error
        }
        
        if (attempts >= maxAttempts) {
          throw new Error('Payment timed out');
        }

        const statusPath = locId && String(locId).length > 0
          ? `/api/terminal/payment/${locId}/${currentId}`
          : `/api/terminal/payment/${currentId}`;
        const response = await apiRequest('GET', statusPath);
        const data = await response.json();
        
        console.log(`🔍 Poll attempt ${attempts + 1}: status=${data.status}, transactionId=${data.transactionId}`);

        // CRITICAL: NEVER switch to a different transaction ID!
        // This was causing cancelled payments to use old successful transaction IDs
        if (data?.transactionId && String(data.transactionId) !== String(currentId)) {
          console.error('⚠️ Server returned different transaction ID - this is suspicious!');
          console.error(`  Expected: ${currentId}, Got: ${data.transactionId}`);
          // DO NOT switch! Keep polling with our original ID
          // If this is truly a different payment, it should fail properly
        }

        if (data.status === 'completed') {
          console.log('✅ Payment completed! Full response data:', {
            ...data,
            tipAmount: data.tipAmount,
            baseAmount: data.baseAmount,
            amount: data.amount,
            calculatedBase: data.baseAmount || (data.amount && data.tipAmount ? data.amount - data.tipAmount : amount)
          });
          setStatus('success');
          setMessage('Payment successful!');
          const paymentData = {
            ...data,
            cardLast4: data.cardLast4 || data.last4,
            paymentMethod: 'terminal',
            tipAmount: data.tipAmount || 0,  // Explicitly include tipAmount
            baseAmount: data.baseAmount || (data.amount && data.tipAmount ? data.amount - data.tipAmount : amount)
          };
          console.log('👉 Passing to parent:', paymentData);
          handlePaymentSuccess(paymentData);
          shouldPollRef.current = false; // Stop polling
          return;
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          // IMPORTANT: Don't stop polling yet - webhook might still arrive with final status!
          console.log('⚠️ Initial status is failed/cancelled but continuing to poll for webhook:', data);
          setStatus('waiting');
          setMessage('Waiting for final confirmation from terminal...');
          // Continue polling - don't throw error yet
        }

        // Update status message
        setMessage(data.message || 'Processing payment...');

        // Check if we should continue polling
        if (!shouldPollRef.current && status === 'idle') {
          // Only stop if explicitly cancelled and idle
          console.log('⛔ Polling stopped');
          setStatus('idle');
          setMessage('');
          setIsLoading(false);
          return;
        }

        // Continue polling
        attempts++;
        pollingTimeoutRef.current = setTimeout(poll, 2000);
      };

      await poll();
    } catch (error) {
      shouldPollRef.current = false; // Ensure polling stops on error
      throw error;
    }
  };

  const handlePaymentSuccess = (response: PaymentResponse) => {
    // Handle success even if dialog was closed - payment completed on terminal
    
    setPaymentDetails(response);
    const tipDisplay = response.tipAmount && response.tipAmount > 0 
      ? ` (includes $${response.tipAmount.toFixed(2)} tip)` 
      : '';
    toast({
      title: "Payment Successful",
      description: `Payment of $${(response.amount || amount).toFixed(2)} processed successfully${tipDisplay}`,
    });
    onSuccess?.(response);
    // Don't auto-close - let user dismiss the success screen manually
    // This gives them time to send receipts via SMS/email
  };

  const stringifyError = (err: any): string => {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || 'Error';
    if (typeof err === 'object') return (err.message || err.error || JSON.stringify(err));
    return String(err);
  };

  const handlePaymentError = (error: any) => {
    toast({
      title: "Payment Failed",
      description: stringifyError(error) || "There was an error processing your payment. Please try again.",
      variant: "destructive",
    });
    onError?.(stringifyError(error));
    // Keep the error visible for user to read
    // User can close manually
  };

  const sendEmailReceipt = async () => {
    if (!emailInput.trim() || !paymentDetails) return;
    
    setSendingReceipt(true);
    try {
      await apiRequest('POST', '/api/send-receipt', {
        type: 'email',
        recipient: emailInput.trim(),
        paymentDetails: {
          ...paymentDetails,
          description,
          timestamp: new Date().toISOString(),
        },
      });
      
      toast({
        title: "Receipt Sent",
        description: `Email receipt sent to ${emailInput}`,
      });
      setEmailInput('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingReceipt(false);
    }
  };

  const sendSMSReceipt = async () => {
    if (!phoneInput.trim() || !paymentDetails) return;
    
    setSendingReceipt(true);
    try {
      await apiRequest('POST', '/api/send-receipt', {
        type: 'sms',
        recipient: phoneInput.trim(),
        paymentDetails: {
          ...paymentDetails,
          description,
          timestamp: new Date().toISOString(),
        },
      });
      
      toast({
        title: "Receipt Sent",
        description: `SMS receipt sent to ${phoneInput}`,
      });
      setPhoneInput('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send SMS receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingReceipt(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Terminal Payment</DialogTitle>
          <DialogDescription>
            Process payment using the card terminal
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            {status === 'idle' && (
              <>
                <CreditCard className="h-16 w-16 text-gray-400" />
                <p className="text-center text-gray-600">
                  Click start to begin processing payment on the terminal
                </p>
                <Button
                  onClick={startPayment}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? "Starting..." : "Start Payment"}
                </Button>
              </>
            )}

            {status === 'processing' && (
              <>
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-900"></div>
                <p className="text-center text-gray-600">{message}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className="text-center text-gray-600 font-semibold text-lg">Payment Complete!</p>
                {paymentDetails && (
                  <div className="w-full space-y-2 mt-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Amount:</span>
                      <span className="font-semibold">
                        ${(paymentDetails.baseAmount || amount).toFixed(2)}
                      </span>
                    </div>
                    {paymentDetails.tipAmount && paymentDetails.tipAmount > 0 && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Tip:</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            +${paymentDetails.tipAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="border-t pt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold">Total:</span>
                            <span className="font-bold text-lg">
                              ${(paymentDetails.amount || amount).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                    {!paymentDetails.tipAmount && (
                      <div className="border-t pt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold">Total:</span>
                          <span className="font-bold text-lg">
                            ${(paymentDetails.amount || amount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                    {(paymentDetails.last4 || paymentDetails.cardLast4) && (
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pt-2">
                        <span>Card:</span>
                        <span>****{paymentDetails.last4 || paymentDetails.cardLast4}</span>
                      </div>
                    )}
                    {paymentDetails.transactionId && (
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                        <span>Transaction ID:</span>
                        <span className="font-mono">{paymentDetails.transactionId}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Receipt Options */}
                <div className="w-full mt-4 p-4 border rounded-lg space-y-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Send Receipt</h4>
                  
                  {/* Email Receipt */}
                  <div className="space-y-2">
                    <Label htmlFor="email-receipt" className="text-xs">Email Receipt</Label>
                    <div className="flex gap-2">
                      <Input
                        id="email-receipt"
                        type="email"
                        placeholder="customer@email.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        className="flex-1"
                        disabled={sendingReceipt}
                      />
                      <Button
                        size="sm"
                        onClick={sendEmailReceipt}
                        disabled={!emailInput.trim() || sendingReceipt}
                        variant="outline"
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Send
                      </Button>
                    </div>
                  </div>
                  
                  {/* SMS Receipt */}
                  <div className="space-y-2">
                    <Label htmlFor="sms-receipt" className="text-xs">SMS Receipt</Label>
                    <div className="flex gap-2">
                      <Input
                        id="sms-receipt"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        className="flex-1"
                        disabled={sendingReceipt}
                      />
                      <Button
                        size="sm"
                        onClick={sendSMSReceipt}
                        disabled={!phoneInput.trim() || sendingReceipt}
                        variant="outline"
                      >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Send
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle className="h-16 w-16 text-red-500" />
                <p className="text-center text-gray-600">{message}</p>
                <Button
                  onClick={startPayment}
                  disabled={isLoading}
                  className="w-full"
                >
                  Try Again
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          {status === 'success' ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                setStatus('idle');
                setMessage('');
                setPaymentDetails(null);
                setEmailInput('');
                setPhoneInput('');
              }}
              className="w-full sm:w-auto"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Done
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                // Force stop polling when user cancels
                shouldPollRef.current = false;
                if (pollingTimeoutRef.current) {
                  clearTimeout(pollingTimeoutRef.current);
                  pollingTimeoutRef.current = null;
                }
                onOpenChange(false);
                setStatus('idle');
                setMessage('');
                setPaymentDetails(null);
                setEmailInput('');
                setPhoneInput('');
                setIsLoading(false);
              }}
              disabled={false}  // Allow cancelling even during processing
            >
              {isLoading ? 'Stop Waiting' : 'Cancel'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
