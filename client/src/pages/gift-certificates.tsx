import { useState, useEffect } from "react";
import { SidebarController } from "@/components/layout/sidebar";
// import Header from "@/components/layout/header"; // Provided by MainLayout
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Gift, CreditCard, DollarSign, Mail, User, Search, CheckCircle, XCircle, Clock, Receipt, MessageSquare, Banknote, Terminal, Phone, Send, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import SmartTerminalPayment from "@/components/payment/smart-terminal-payment";
import HelcimPayJsModal from "@/components/payment/helcim-payjs-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const giftCertificateSchema = z.object({
  amount: z.number().min(10, "Minimum amount is $10").max(1000, "Maximum amount is $1000"),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientEmail: z.string().email("Please enter a valid email address").optional(),
  recipientPhone: z.string().optional(),
  purchaserName: z.string().min(1, "Your name is required"),
  purchaserEmail: z.string().email("Please enter a valid email address"),
  occasion: z.string().min(1, "Please select an occasion"),
  deliveryMethod: z.enum(["email", "sms", "both"]).default("email"),
  message: z.string().optional(),
}).refine((data) => {
  // Ensure at least one delivery method has corresponding contact info
  if (data.deliveryMethod === "email" || data.deliveryMethod === "both") {
    return !!data.recipientEmail;
  }
  if (data.deliveryMethod === "sms") {
    return !!data.recipientPhone;
  }
  return true;
}, {
  message: "Email is required for email delivery",
  path: ["recipientEmail"],
}).refine((data) => {
  if (data.deliveryMethod === "sms" || data.deliveryMethod === "both") {
    return !!data.recipientPhone;
  }
  return true;
}, {
  message: "Phone number is required for SMS delivery",
  path: ["recipientPhone"],
});

type GiftCertificateForm = z.infer<typeof giftCertificateSchema>;

// Gift Card (physical card) schema
const giftCardSchema = z.object({
  amount: z.number().min(10, "Minimum amount is $10").max(1000, "Maximum amount is $1000"),
  code: z.string().min(8, "Gift card number must be at least 8 characters"),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientEmail: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  recipientPhone: z.string().optional().or(z.literal("")),
  purchaserName: z.string().min(1, "Your name is required"),
  sendReceipt: z.boolean().default(false),
  receiptMethod: z.enum(["email", "sms", "both"]).optional(),
}).refine((data) => {
  if (data.sendReceipt && data.receiptMethod) {
    if ((data.receiptMethod === "email" || data.receiptMethod === "both") && !data.recipientEmail) {
      return false;
    }
    if ((data.receiptMethod === "sms" || data.receiptMethod === "both") && !data.recipientPhone) {
      return false;
    }
  }
  return true;
}, {
  message: "Contact information required for selected receipt method",
  path: ["recipientEmail"],
});
type GiftCardForm = z.infer<typeof giftCardSchema>;

// Gift Card Reload schema
const giftCardReloadSchema = z.object({
  code: z.string().min(8, "Gift card number must be at least 8 characters"),
  amount: z.number().min(10, "Minimum reload amount is $10").max(1000, "Maximum reload amount is $1000"),
});
type GiftCardReloadForm = z.infer<typeof giftCardReloadSchema>;

const PRESET_AMOUNTS = [25, 50, 75, 100, 150, 200];

const OCCASIONS = [
  { value: "birthday", label: "🎂 Happy Birthday", template: "Wishing you a wonderful birthday filled with joy and relaxation!" },
  { value: "just_because", label: "💝 Just Because", template: "Just a little something to brighten your day!" },
  { value: "congratulations", label: "🎉 Congratulations", template: "Congratulations on your special achievement!" },
  { value: "thank_you", label: "🙏 Thank You", template: "Thank you for being amazing!" },
  { value: "anniversary", label: "💕 Anniversary", template: "Happy Anniversary! Here's to many more wonderful years together!" },
  { value: "holiday", label: "🎄 Holiday Season", template: "Wishing you a joyful holiday season!" },
  { value: "mothers_day", label: "🌸 Mother's Day", template: "Happy Mother's Day to an incredible mom!" },
  { value: "fathers_day", label: "👔 Father's Day", template: "Happy Father's Day! You deserve some relaxation!" },
  { value: "graduation", label: "🎓 Graduation", template: "Congratulations on your graduation! You did it!" },
  { value: "wedding", label: "💐 Wedding", template: "Wishing you both a lifetime of love and happiness!" },
  { value: "baby_shower", label: "👶 Baby Shower", template: "Congratulations on your new arrival! Enjoy some well-deserved pampering!" },
  { value: "get_well", label: "🌻 Get Well Soon", template: "Wishing you a speedy recovery and sending healing thoughts your way!" },
];

// Payment form component for Helcim
const PaymentForm = ({ total, onSuccess, onError }: { 
  total: number; 
  onSuccess: (paymentId: string) => void; 
  onError: (error: string) => void; 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardData, setCardData] = useState({
    cardNumber: '',
    cardExpiryMonth: '',
    cardExpiryYear: '',
    cardCVV: ''
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Basic validation
    if (!cardData.cardNumber || !cardData.cardExpiryMonth || !cardData.cardExpiryYear || !cardData.cardCVV) {
      onError('Please fill in all card details.');
      return;
    }

    setIsProcessing(true);

    try {
      // Direct card processing deprecated; route via HelcimPay.js
      throw new Error('Card payments are handled via HelcimPay.js. Start a session via /api/helcim-pay/initialize.');
    } catch (error: any) {
      console.error('Gift Certificate Payment processing error:', error);
      
      let errorMessage = 'Payment failed';
      if (error.response?.data?.error) {
        const serverError = error.response.data.error;
        if (serverError.includes('GENERIC_DECLINE')) {
          errorMessage = 'Card declined by bank. Please check card details or try a different payment method.';
        } else if (serverError.includes('INSUFFICIENT_FUNDS')) {
          errorMessage = 'Insufficient funds on card. Please try a different payment method.';
        } else if (serverError.includes('CVV_FAILURE')) {
          errorMessage = 'CVV verification failed. Please check your security code.';
        } else if (serverError.includes('INVALID_CARD')) {
          errorMessage = 'Invalid card information. Please check your card details.';
        } else {
          errorMessage = 'Payment processing failed. Please try again or use a different payment method.';
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      onError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        {/* Card Number */}
        <div>
          <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Card Number
          </label>
          <input
            type="text"
            id="cardNumber"
            value={cardData.cardNumber}
            onChange={(e) => setCardData(prev => ({ ...prev, cardNumber: e.target.value }))}
            placeholder="1234 5678 9012 3456"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            maxLength={19}
          />
        </div>

        {/* Expiry Date and CVV */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="cardExpiryMonth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Month
            </label>
            <select
              id="cardExpiryMonth"
              value={cardData.cardExpiryMonth}
              onChange={(e) => setCardData(prev => ({ ...prev, cardExpiryMonth: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="">MM</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <option key={month} value={month.toString().padStart(2, '0')}>
                  {month.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="cardExpiryYear" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Year
            </label>
            <select
              id="cardExpiryYear"
              value={cardData.cardExpiryYear}
              onChange={(e) => setCardData(prev => ({ ...prev, cardExpiryYear: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="">YYYY</option>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(year => (
                <option key={year} value={year.toString()}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="cardCVV" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CVV
            </label>
            <input
              type="text"
              id="cardCVV"
              value={cardData.cardCVV}
              onChange={(e) => setCardData(prev => ({ ...prev, cardCVV: e.target.value }))}
              placeholder="123"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
              maxLength={4}
            />
          </div>
        </div>
      </div>
      
      <Button 
        type="submit" 
        disabled={isProcessing}
        className="w-full"
      >
        {isProcessing ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            Processing...
          </div>
        ) : (
          `Pay $${total.toFixed(2)}`
        )}
      </Button>
    </form>
  );
};

export default function GiftCertificatesPage() {
  useDocumentTitle("Gift Certificates & Cards | Glo Head Spa");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [balanceCheckCode, setBalanceCheckCode] = useState("");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [giftCertificateData, setGiftCertificateData] = useState<GiftCertificateForm | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [selectedCardAmount, setSelectedCardAmount] = useState<number | null>(null);
  
  // Payment method states
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "terminal">("card");
  const [showHelcimPayModal, setShowHelcimPayModal] = useState(false);
  const [showTerminalPayment, setShowTerminalPayment] = useState(false);
  const [pendingPurchaseData, setPendingPurchaseData] = useState<GiftCertificateForm | null>(null);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [showCashDialog, setShowCashDialog] = useState(false);
  
  // Gift card payment states
  const [showGiftCardPaymentDialog, setShowGiftCardPaymentDialog] = useState(false);
  const [giftCardPaymentMethod, setGiftCardPaymentMethod] = useState<"cash" | "card" | "terminal">("cash");
  const [pendingGiftCardData, setPendingGiftCardData] = useState<GiftCardForm | null>(null);
  const [showGiftCardCashDialog, setShowGiftCardCashDialog] = useState(false);
  const [showGiftCardHelcimPay, setShowGiftCardHelcimPay] = useState(false);
  const [showGiftCardTerminal, setShowGiftCardTerminal] = useState(false);
  const [giftCardCashReceived, setGiftCardCashReceived] = useState<string>("");

  // Gift card reload states
  const [showReloadPaymentDialog, setShowReloadPaymentDialog] = useState(false);
  const [reloadPaymentMethod, setReloadPaymentMethod] = useState<"cash" | "card" | "terminal">("cash");
  const [pendingReloadData, setPendingReloadData] = useState<GiftCardReloadForm | null>(null);
  const [showReloadCashDialog, setShowReloadCashDialog] = useState(false);
  const [showReloadHelcimPay, setShowReloadHelcimPay] = useState(false);
  const [showReloadTerminal, setShowReloadTerminal] = useState(false);
  const [reloadCashReceived, setReloadCashReceived] = useState<string>("");
  const [selectedReloadAmount, setSelectedReloadAmount] = useState<number | null>(null);
  
  // Gift card receipt states
  const [showGiftCardReceiptDialog, setShowGiftCardReceiptDialog] = useState(false);
  const [giftCardReceiptData, setGiftCardReceiptData] = useState<any>(null);
  const [showReloadReceiptDialog, setShowReloadReceiptDialog] = useState(false);
  const [reloadReceiptData, setReloadReceiptData] = useState<any>(null);
  
  // Balance inquiry states
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [currentBalanceData, setCurrentBalanceData] = useState<any>(null);
  
  // Gift cards search section states
  const [showGiftCardsSection, setShowGiftCardsSection] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredGiftCards, setFilteredGiftCards] = useState<any[]>([]);

  const form = useForm<GiftCertificateForm>({
    resolver: zodResolver(giftCertificateSchema),
    defaultValues: {
      amount: 0,
      recipientName: "",
      recipientEmail: "",
      recipientPhone: "",
      purchaserName: "",
      purchaserEmail: "",
      occasion: "",
      deliveryMethod: "email",
      message: "",
    },
  });

  const giftCardForm = useForm<GiftCardForm>({
    resolver: zodResolver(giftCardSchema),
    defaultValues: {
      amount: 0,
      code: "",
      recipientName: "",
      recipientEmail: "",
      recipientPhone: "",
      purchaserName: "",
      sendReceipt: false,
      receiptMethod: "email",
    },
  });

  const giftCardReloadForm = useForm<GiftCardReloadForm>({
    resolver: zodResolver(giftCardReloadSchema),
    defaultValues: {
      code: "",
      amount: 0,
    },
  });

  const purchaseGiftCertificateMutation = useMutation({
    mutationFn: async ({ data, paymentInfo }: { data: GiftCertificateForm; paymentInfo: any }) => {
      const response = await apiRequest("POST", "/api/gift-certificates/purchase", {
        ...data,
        paymentMethod: paymentInfo.method,
        paymentReference: paymentInfo.reference,
        paymentAmount: paymentInfo.amount,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setPurchaseData(data);
      setShowPaymentDialog(false);
      setShowCashDialog(false);
      setShowHelcimPayModal(false);
      setShowTerminalPayment(false);
      setShowReceiptDialog(true);
      queryClient.invalidateQueries({ queryKey: ['/api/gift-cards'] });
      form.reset();
      setSelectedAmount(null);
      setCashReceived("");
      setPendingPurchaseData(null);
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase gift certificate",
        variant: "destructive",
      });
    },
  });

  const balanceQuery = useQuery<any>({
    queryKey: [`/api/gift-card-balance/${balanceCheckCode}`],
    enabled: !!balanceCheckCode && balanceCheckCode.length >= 8,
    retry: false,
  });

  const giftCardsQuery = useQuery<any[]>({
    queryKey: ['/api/gift-cards'],
    enabled: showGiftCardsSection, // Only fetch when section is opened
  });

  // Filter gift cards based on search term
  useEffect(() => {
    if (giftCardsQuery.data) {
      const filtered = giftCardsQuery.data.filter((card: any) => {
        const searchLower = searchTerm.toLowerCase();
        return (
          card.code?.toLowerCase().includes(searchLower) ||
          card.issuedToName?.toLowerCase().includes(searchLower) ||
          card.issuedToEmail?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredGiftCards(filtered);
    }
  }, [searchTerm, giftCardsQuery.data]);

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    form.setValue("amount", amount);
  };

  const handleCustomAmount = (value: string) => {
    const amount = parseFloat(value);
    if (!isNaN(amount)) {
      setSelectedAmount(amount);
      form.setValue("amount", amount);
    }
  };

  const handleCardAmountSelect = (amount: number) => {
    setSelectedCardAmount(amount);
    giftCardForm.setValue("amount", amount);
  };

  const handleCardCustomAmount = (value: string) => {
    const amount = parseFloat(value);
    if (!isNaN(amount)) {
      setSelectedCardAmount(amount);
      giftCardForm.setValue("amount", amount);
    }
  };

  const onSubmit = async (data: GiftCertificateForm) => {
    setGiftCertificateData(data);
    setPendingPurchaseData(data);
    setShowPaymentDialog(true);
  };

  // Handle payment based on selected method
  const processPayment = () => {
    if (!pendingPurchaseData) {
      toast({
        title: "Error",
        description: "No purchase data available",
        variant: "destructive",
      });
      return;
    }

    setShowPaymentDialog(false);

    switch (paymentMethod) {
      case "cash":
        setShowCashDialog(true);
        break;
      case "card":
        setShowHelcimPayModal(true);
        break;
      case "terminal":
        setShowTerminalPayment(true);
        break;
    }
  };

  // Handle cash payment
  const handleCashPayment = () => {
    if (!pendingPurchaseData) return;

    const cashAmount = parseFloat(cashReceived);
    if (isNaN(cashAmount) || cashAmount < pendingPurchaseData.amount) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid cash amount",
        variant: "destructive",
      });
      return;
    }

    purchaseGiftCertificateMutation.mutate({
      data: pendingPurchaseData,
      paymentInfo: {
        method: "cash",
        reference: `CASH-${Date.now()}`,
        amount: pendingPurchaseData.amount,
      },
    });
  };

  // Handle Helcim Pay.js success
  const handleHelcimSuccess = (paymentData: any) => {
    if (!pendingPurchaseData) return;

    purchaseGiftCertificateMutation.mutate({
      data: pendingPurchaseData,
      paymentInfo: {
        method: "card",
        reference: paymentData.transactionId || paymentData.invoiceNumber || `CARD-${Date.now()}`,
        amount: pendingPurchaseData.amount,
      },
    });
  };

  // Handle terminal payment success
  const handleTerminalSuccess = (paymentData: any) => {
    if (!pendingPurchaseData) return;

    purchaseGiftCertificateMutation.mutate({
      data: pendingPurchaseData,
      paymentInfo: {
        method: "terminal",
        reference: paymentData.transactionId || paymentData.invoiceNumber || `TERMINAL-${Date.now()}`,
        amount: pendingPurchaseData.amount,
      },
    });
  };

  const handlePaymentSuccess = async (paymentId: string) => {
    if (!giftCertificateData) return;

    setIsProcessing(true);
    try {
      // Legacy payment handler - kept for backwards compatibility
      await purchaseGiftCertificateMutation.mutateAsync({
        data: giftCertificateData,
        paymentInfo: {
          method: "card",
          reference: paymentId,
          amount: giftCertificateData.amount,
        },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentError = (error: string) => {
    toast({
      title: "Payment Failed",
      description: error,
      variant: "destructive",
    });
  };

  const handleBalanceCheck = (code: string) => {
    setBalanceCheckCode(code.toUpperCase());
  };

  const addGiftCardMutation = useMutation({
    mutationFn: async ({ data, paymentInfo }: { data: GiftCardForm; paymentInfo?: any }) => {
      const response = await apiRequest("POST", "/api/add-gift-card", {
        code: data.code.toUpperCase(),
        balance: data.amount,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        recipientPhone: data.recipientPhone,
        purchaserName: data.purchaserName,
        sendReceipt: data.sendReceipt,
        receiptMethod: data.receiptMethod,
        paymentMethod: paymentInfo?.method,
        paymentReference: paymentInfo?.reference,
      });
      return await response.json();
    },
    onSuccess: (giftCard: any) => {
      // Store receipt data
      setGiftCardReceiptData({
        giftCard,
        paymentMethod: giftCardPaymentMethod,
        purchaserInfo: pendingGiftCardData
      });
      
      // Reset form states
      giftCardForm.reset();
      setSelectedCardAmount(null);
      setPendingGiftCardData(null);
      setGiftCardCashReceived("");
      setShowGiftCardPaymentDialog(false);
      setShowGiftCardCashDialog(false);
      setShowGiftCardHelcimPay(false);
      setShowGiftCardTerminal(false);
      queryClient.invalidateQueries({ queryKey: ['/api/saved-gift-cards'] });
      
      // Show receipt dialog
      setShowGiftCardReceiptDialog(true);
    },
    onError: (error: any) => {
      toast({
        title: "Sale Failed",
        description: error?.message || "Failed to sell gift card",
        variant: "destructive",
      });
    },
  });

  const onSubmitGiftCard = async (data: GiftCardForm) => {
    setPendingGiftCardData(data);
    setShowGiftCardPaymentDialog(true);
  };

  // Reload gift card mutation
  const reloadGiftCardMutation = useMutation({
    mutationFn: async ({ data, paymentInfo }: { data: GiftCardReloadForm; paymentInfo?: any }) => {
      const response = await apiRequest("POST", "/api/reload-gift-card", {
        code: data.code.toUpperCase(),
        amount: data.amount,
        paymentMethod: paymentInfo?.method,
        paymentReference: paymentInfo?.reference,
      });
      return await response.json();
    },
    onSuccess: (result: any) => {
      // Store receipt data
      setReloadReceiptData({
        ...result,
        paymentMethod: reloadPaymentMethod,
        reloadInfo: pendingReloadData
      });
      
      // Reset form states
      giftCardReloadForm.reset();
      setSelectedReloadAmount(null);
      setPendingReloadData(null);
      setReloadCashReceived("");
      setShowReloadPaymentDialog(false);
      setShowReloadCashDialog(false);
      setShowReloadHelcimPay(false);
      setShowReloadTerminal(false);
      queryClient.invalidateQueries({ queryKey: ['/api/saved-gift-cards'] });
      
      // Show receipt dialog
      setShowReloadReceiptDialog(true);
    },
    onError: (error: any) => {
      toast({
        title: "Reload Failed",
        description: error?.message || "Failed to reload gift card",
        variant: "destructive",
      });
    },
  });

  const onSubmitReload = async (data: GiftCardReloadForm) => {
    setPendingReloadData(data);
    setShowReloadPaymentDialog(true);
  };

  // Process reload payment based on selected method
  const processReloadPayment = () => {
    if (!pendingReloadData) return;

    setShowReloadPaymentDialog(false);

    switch (reloadPaymentMethod) {
      case "cash":
        setShowReloadCashDialog(true);
        break;
      case "card":
        setShowReloadHelcimPay(true);
        break;
      case "terminal":
        setShowReloadTerminal(true);
        break;
    }
  };

  // Handle reload cash payment
  const handleReloadCashPayment = () => {
    if (!pendingReloadData) return;

    const cashAmount = parseFloat(reloadCashReceived);
    if (cashAmount >= pendingReloadData.amount) {
      reloadGiftCardMutation.mutate({ 
        data: pendingReloadData,
        paymentInfo: {
          method: 'cash',
          reference: `Cash reload - Change: $${(cashAmount - pendingReloadData.amount).toFixed(2)}`
        }
      });
      setShowReloadCashDialog(false);
    } else {
      toast({
        title: "Insufficient Cash",
        description: `Cash received ($${cashAmount.toFixed(2)}) is less than the reload amount ($${pendingReloadData.amount.toFixed(2)}).`,
        variant: "destructive",
      });
    }
  };

  // Handle reload Helcim success
  const handleReloadHelcimSuccess = (paymentData: any) => {
    if (!pendingReloadData) return;
    
    reloadGiftCardMutation.mutate({ 
      data: pendingReloadData,
      paymentInfo: {
        method: 'card',
        reference: paymentData.paymentId
      }
    });
    setShowReloadHelcimPay(false);
  };

  // Handle reload terminal success
  const handleReloadTerminalSuccess = (paymentData: any) => {
    if (!pendingReloadData) return;
    
    reloadGiftCardMutation.mutate({ 
      data: pendingReloadData,
      paymentInfo: {
        method: 'terminal',
        reference: paymentData.transactionId
      }
    });
    setShowReloadTerminal(false);
  };

  // Process gift card payment based on selected method
  const processGiftCardPayment = () => {
    if (!pendingGiftCardData) return;

    setShowGiftCardPaymentDialog(false);

    switch (giftCardPaymentMethod) {
      case "cash":
        setShowGiftCardCashDialog(true);
        break;
      case "card":
        setShowGiftCardHelcimPay(true);
        break;
      case "terminal":
        setShowGiftCardTerminal(true);
        break;
    }
  };

  // Handle gift card cash payment
  const handleGiftCardCashPayment = () => {
    if (!pendingGiftCardData) return;

    const cashAmount = parseFloat(giftCardCashReceived);
    if (isNaN(cashAmount) || cashAmount < pendingGiftCardData.amount) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid cash amount",
        variant: "destructive",
      });
      return;
    }

    addGiftCardMutation.mutate({
      data: pendingGiftCardData,
      paymentInfo: {
        method: "cash",
        reference: `CASH-GC-${Date.now()}`,
      },
    });
  };

  // Handle gift card Helcim success
  const handleGiftCardHelcimSuccess = (paymentData: any) => {
    if (!pendingGiftCardData) return;

    addGiftCardMutation.mutate({
      data: pendingGiftCardData,
      paymentInfo: {
        method: "card",
        reference: paymentData.transactionId || paymentData.invoiceNumber || `CARD-GC-${Date.now()}`,
      },
    });
  };

  // Handle gift card terminal success
  const handleGiftCardTerminalSuccess = (paymentData: any) => {
    if (!pendingGiftCardData) return;

    addGiftCardMutation.mutate({
      data: pendingGiftCardData,
      paymentInfo: {
        method: "terminal",
        reference: paymentData.transactionId || paymentData.invoiceNumber || `TERMINAL-GC-${Date.now()}`,
      },
    });
  };

  const handleReceiptEmailSend = async (email: string) => {
    if (!purchaseData || !email) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'email',
        recipient: email,
        paymentDetails: {
          transactionId: purchaseData.giftCard.code,
          timestamp: new Date().toISOString(),
          amount: purchaseData.giftCard.initialAmount,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Certificate for ${purchaseData.giftCard.issuedToName}`,
          items: [
            {
              name: `Gift Certificate for ${purchaseData.giftCard.issuedToName}`,
              quantity: 1,
              price: purchaseData.giftCard.initialAmount,
              total: purchaseData.giftCard.initialAmount
            }
          ]
        }
      });

      toast({
        title: "Receipt Sent!",
        description: `Receipt sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Receipt",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const handleReceiptSMSSend = async (phone: string) => {
    if (!purchaseData || !phone) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'sms',
        recipient: phone,
        paymentDetails: {
          transactionId: purchaseData.giftCard.code,
          amount: purchaseData.giftCard.initialAmount,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Certificate for ${purchaseData.giftCard.issuedToName}`
        }
      });

      toast({
        title: "SMS Receipt Sent!",
        description: `Receipt sent to ${phone}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send SMS",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const handleCloseReceipt = () => {
    setShowReceiptDialog(false);
    setPurchaseData(null);
    setGiftCertificateData(null);
    form.reset();
    setSelectedAmount(null);
    
    toast({
      title: "Gift Certificate Purchased!",
      description: `Gift certificate code ${purchaseData?.giftCard?.code} has been sent to ${purchaseData?.giftCard?.issuedToEmail}`,
    });
  };

  // Gift Card Receipt Functions
  const handleGiftCardReceiptEmailSend = async (email: string) => {
    if (!giftCardReceiptData || !email) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'email',
        recipient: email,
        paymentDetails: {
          transactionId: giftCardReceiptData.giftCard.code,
          timestamp: new Date().toISOString(),
          amount: giftCardReceiptData.giftCard.initialAmount || giftCardReceiptData.giftCard.currentBalance,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card Purchase - Code: ${giftCardReceiptData.giftCard.code}`,
          paymentMethod: giftCardReceiptData.paymentMethod
        }
      });

      toast({
        title: "Receipt Sent!",
        description: `Receipt sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Receipt",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const handleGiftCardReceiptSMSSend = async (phone: string) => {
    if (!giftCardReceiptData || !phone) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'sms',
        recipient: phone,
        paymentDetails: {
          transactionId: giftCardReceiptData.giftCard.code,
          amount: giftCardReceiptData.giftCard.initialAmount || giftCardReceiptData.giftCard.currentBalance,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card Purchase - Code: ${giftCardReceiptData.giftCard.code}`
        }
      });

      toast({
        title: "SMS Receipt Sent!",
        description: `Receipt sent to ${phone}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send SMS",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  // Reload Receipt Functions
  const handleReloadReceiptEmailSend = async (email: string) => {
    if (!reloadReceiptData || !email) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'email',
        recipient: email,
        paymentDetails: {
          transactionId: `Reload-${reloadReceiptData.giftCard.code}`,
          timestamp: new Date().toISOString(),
          amount: reloadReceiptData.amountAdded,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card Reload - Code: ${reloadReceiptData.giftCard.code} (New Balance: $${reloadReceiptData.newBalance.toFixed(2)})`,
          paymentMethod: reloadReceiptData.paymentMethod
        }
      });

      toast({
        title: "Receipt Sent!",
        description: `Receipt sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Receipt",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const handleReloadReceiptSMSSend = async (phone: string) => {
    if (!reloadReceiptData || !phone) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'sms',
        recipient: phone,
        paymentDetails: {
          transactionId: `Reload-${reloadReceiptData.giftCard.code}`,
          amount: reloadReceiptData.amountAdded,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card Reload - Code: ${reloadReceiptData.giftCard.code} (New Balance: $${reloadReceiptData.newBalance.toFixed(2)})`
        }
      });

      toast({
        title: "SMS Receipt Sent!",
        description: `Receipt sent to ${phone}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send SMS",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  // Balance Inquiry Functions
  const handleBalanceInquirySMS = async (phone: string) => {
    if (!currentBalanceData || !phone) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'sms',
        recipient: phone,
        paymentDetails: {
          transactionId: `Balance-${balanceCheckCode}`,
          amount: currentBalanceData.balance,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card ${balanceCheckCode} Balance Inquiry`
        }
      });

      toast({
        title: "Balance SMS Sent!",
        description: `Balance information sent to ${phone}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send SMS",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  // Resend Gift Certificate State
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [selectedGiftCertificate, setSelectedGiftCertificate] = useState<any>(null);
  const [resendMethod, setResendMethod] = useState<"email" | "sms">("email");
  const [resendRecipient, setResendRecipient] = useState("");

  // Open Resend Dialog
  const handleOpenResendDialog = (card: any) => {
    setSelectedGiftCertificate(card);
    setResendRecipient(card.issuedToEmail || "");
    setResendMethod("email");
    setShowResendDialog(true);
  };

  // Process Resend Gift Certificate
  const handleResendGiftCertificate = async () => {
    if (!selectedGiftCertificate || !resendRecipient) {
      toast({
        title: "Missing Information",
        description: "Please enter recipient information",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/gift-certificates/resend", {
        giftCardId: selectedGiftCertificate.id,
        code: selectedGiftCertificate.code,
        recipientName: selectedGiftCertificate.issuedToName,
        amount: selectedGiftCertificate.initialAmount,
        deliveryMethod: resendMethod,
        recipientEmail: resendMethod === "email" ? resendRecipient : undefined,
        recipientPhone: resendMethod === "sms" ? resendRecipient : undefined
      });

      toast({
        title: "Gift Certificate Resent!",
        description: `Gift certificate has been resent via ${resendMethod === "email" ? "email" : "SMS"} to ${resendRecipient}`,
      });
      
      setShowResendDialog(false);
      setSelectedGiftCertificate(null);
      setResendRecipient("");
    } catch (error) {
      toast({
        title: "Failed to Resend",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const handleBalanceInquiryEmail = async (email: string) => {
    if (!currentBalanceData || !email) return;

    try {
      await apiRequest("POST", "/api/send-receipt", {
        type: 'email',
        recipient: email,
        paymentDetails: {
          transactionId: `Balance-${balanceCheckCode}`,
          timestamp: new Date().toISOString(),
          amount: currentBalanceData.balance,
          tipAmount: 0,
          cardLast4: '****',
          description: `Gift Card ${balanceCheckCode} Balance Inquiry${currentBalanceData.expiryDate ? ` (Expires: ${new Date(currentBalanceData.expiryDate).toLocaleDateString()})` : ''}`,
          paymentMethod: 'Balance Inquiry'
        }
      });

      toast({
        title: "Balance Email Sent!",
        description: `Balance information sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Email",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'expired':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'inactive':
      case 'used':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'expired':
        return 'Expired';
      case 'inactive':
        return 'Inactive';
      case 'used':
        return 'Fully Used';
      default:
        return status;
    }
  };

  return (
    <>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        <SidebarController />
        
        <div className="flex-1 flex flex-col">
          <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
            <div className="w-full">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Gift Certificates & Cards</h1>
                <p className="text-gray-600 dark:text-gray-400">Purchase and manage gift certificates and physical gift cards</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="w-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      Check Gift Balance
                    </CardTitle>
                    <CardDescription>
                      Enter your gift card or certificate code to check the current balance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Gift Code
                      </label>
                      <div className="relative">
                        <Input
                          placeholder="Enter gift code"
                          value={balanceCheckCode}
                          onChange={(e) => handleBalanceCheck(e.target.value)}
                          className="uppercase"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                      </div>
                    </div>

                    {balanceQuery.data && (
                      <div className="mt-6 space-y-4">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-900 dark:text-green-100">Certificate Found</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Current Balance:</span>
                              <span className="font-medium text-green-900 dark:text-green-100">
                                ${(balanceQuery.data as any).balance?.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Original Amount:</span>
                              <span className="text-gray-900 dark:text-gray-100">
                                ${(balanceQuery.data as any).initialAmount?.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Status:</span>
                              <div className="flex items-center gap-1">
                                {getStatusIcon((balanceQuery.data as any).status)}
                                <span className="text-gray-900 dark:text-gray-100">
                                  {getStatusText((balanceQuery.data as any).status)}
                                </span>
                              </div>
                            </div>
                            {(balanceQuery.data as any).expiryDate && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                                <span className="text-gray-900 dark:text-gray-100">
                                  {new Date((balanceQuery.data as any).expiryDate).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Recipient:</span>
                              <span className="text-gray-900 dark:text-gray-100">
                                {(balanceQuery.data as any).issuedToName}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => {
                            setCurrentBalanceData(balanceQuery.data);
                            setShowBalanceDialog(true);
                          }}
                          className="w-full"
                          variant="outline"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Balance Information
                        </Button>
                      </div>
                    )}

                    {balanceQuery.error && (
                      <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-sm text-red-700 dark:text-red-300">
                            Gift card/certificate not found or invalid code
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="w-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5" />
                      Purchase Gift Certificate
                    </CardTitle>
                    <CardDescription>
                      Buy a gift certificate for someone special
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-3">
                          <label className="text-sm font-medium leading-none">
                            Select Amount
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {PRESET_AMOUNTS.map((amount) => (
                              <Button
                                key={amount}
                                type="button"
                                variant={selectedAmount === amount ? "default" : "outline"}
                                className="h-12"
                                onClick={() => handleAmountSelect(amount)}
                              >
                                ${amount}
                              </Button>
                            ))}
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">
                              Or enter custom amount
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                type="number"
                                placeholder="0.00"
                                className="pl-10"
                                min="10"
                                max="1000"
                                step="0.01"
                                onChange={(e) => handleCustomAmount(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="deliveryMethod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Delivery Method</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || "email"}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select delivery method" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="email">
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-4 w-4" />
                                      Email Only
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="sms">
                                    <div className="flex items-center gap-2">
                                      <Phone className="h-4 w-4" />
                                      SMS Text Only
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="both">
                                    <div className="flex items-center gap-2">
                                      <Send className="h-4 w-4" />
                                      Both Email & SMS
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="recipientName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Recipient Name</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      placeholder="Recipient's full name"
                                      className="pl-10"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="recipientEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Recipient Email {form.watch("deliveryMethod") === "sms" && "(Optional)"}
                                </FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      type="email"
                                      placeholder="recipient@example.com"
                                      className="pl-10"
                                      required={form.watch("deliveryMethod") !== "sms"}
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="recipientPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Recipient Phone {form.watch("deliveryMethod") === "email" && "(Optional)"}
                                </FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      type="tel"
                                      placeholder="(555) 123-4567"
                                      className="pl-10"
                                      required={form.watch("deliveryMethod") !== "email"}
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div></div> {/* Empty cell for grid alignment */}
                        </div>

                        <FormField
                          control={form.control}
                          name="occasion"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Occasion</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select an occasion" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {OCCASIONS.map((occasion) => (
                                    <SelectItem key={occasion.value} value={occasion.value}>
                                      {occasion.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="purchaserName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Name</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      placeholder="Your full name"
                                      className="pl-10"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="purchaserEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Email</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      type="email"
                                      placeholder="your@example.com"
                                      className="pl-10"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="message"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Personal Message (Optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Add a personal message for the recipient..."
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isProcessing || !selectedAmount || selectedAmount < 10}
                        >
                          {isProcessing ? "Processing..." : `Purchase Gift Certificate ${selectedAmount ? `($${selectedAmount})` : ""}`}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                {/* Sell Physical Gift Card */}
                <Card className="w-full border-blue-200 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      Sell NEW Gift Card
                    </CardTitle>
                    <CardDescription>
                      Create a NEW physical gift card with a unique number. For existing cards, use "Reload Gift Card" below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...giftCardForm}>
                      <form onSubmit={giftCardForm.handleSubmit(onSubmitGiftCard)} className="space-y-4">
                        <div className="space-y-3">
                          <label className="text-sm font-medium leading-none">
                            Select Amount
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {PRESET_AMOUNTS.map((amount) => (
                              <Button
                                key={amount}
                                type="button"
                                variant={selectedCardAmount === amount ? "default" : "outline"}
                                className="h-12"
                                onClick={() => handleCardAmountSelect(amount)}
                              >
                                ${amount}
                              </Button>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">
                              Or enter custom amount
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                type="number"
                                placeholder="0.00"
                                className="pl-10"
                                min="10"
                                max="1000"
                                step="0.01"
                                onChange={(e) => handleCardCustomAmount(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <FormField
                          control={giftCardForm.control}
                          name="code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gift Card Number (Must be unique)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                  <Input
                                    placeholder="Enter NEW gift card number"
                                    className="pl-10 uppercase"
                                    value={field.value}
                                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={giftCardForm.control}
                            name="recipientName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Recipient Name</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      placeholder="Recipient's full name"
                                      className="pl-10"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={giftCardForm.control}
                            name="purchaserName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Purchaser Name</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                      placeholder="Your full name"
                                      className="pl-10"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Send Receipt Option */}
                        <FormField
                          control={giftCardForm.control}
                          name="sendReceipt"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Send receipt to recipient
                                </FormLabel>
                                <div className="text-sm text-gray-500">
                                  Email or text the gift card details to the recipient
                                </div>
                              </div>
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="h-5 w-5 rounded border-gray-300"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        {giftCardForm.watch("sendReceipt") && (
                          <>
                            <FormField
                              control={giftCardForm.control}
                              name="receiptMethod"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Receipt Delivery Method</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value || "email"}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select delivery method" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="email">
                                        <div className="flex items-center gap-2">
                                          <Mail className="h-4 w-4" />
                                          Email
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="sms">
                                        <div className="flex items-center gap-2">
                                          <Phone className="h-4 w-4" />
                                          SMS Text
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="both">
                                        <div className="flex items-center gap-2">
                                          <Send className="h-4 w-4" />
                                          Both Email & SMS
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField
                                control={giftCardForm.control}
                                name="recipientEmail"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      Recipient Email {giftCardForm.watch("receiptMethod") === "sms" && "(Optional)"}
                                    </FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                        <Input
                                          type="email"
                                          placeholder="recipient@example.com"
                                          className="pl-10"
                                          {...field}
                                        />
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={giftCardForm.control}
                                name="recipientPhone"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      Recipient Phone {giftCardForm.watch("receiptMethod") === "email" && "(Optional)"}
                                    </FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                        <Input
                                          type="tel"
                                          placeholder="(555) 123-4567"
                                          className="pl-10"
                                          {...field}
                                        />
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </>
                        )}

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isProcessing || !selectedCardAmount || selectedCardAmount < 10 || !giftCardForm.getValues("code")}
                        >
                          {isProcessing ? "Processing..." : `Sell NEW Gift Card ${selectedCardAmount ? `($${selectedCardAmount})` : ""}`}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                {/* Visual separator between new and reload */}
                <div className="w-full flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">OR</span>
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
                </div>

                {/* Reload Gift Card */}
                <Card className="w-full border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      Reload EXISTING Gift Card
                    </CardTitle>
                    <CardDescription>
                      Add funds to an EXISTING gift card (including cards with $0 balance). Use this to reload previously sold or used cards.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...giftCardReloadForm}>
                      <form onSubmit={giftCardReloadForm.handleSubmit(onSubmitReload)} className="space-y-4">
                        <FormField
                          control={giftCardReloadForm.control}
                          name="code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Existing Gift Card Number</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                  <Input
                                    placeholder="Enter EXISTING gift card number"
                                    className="pl-10 uppercase"
                                    value={field.value}
                                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="space-y-3">
                          <label className="text-sm font-medium leading-none">
                            Select Reload Amount
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {PRESET_AMOUNTS.map((amount) => (
                              <Button
                                key={amount}
                                type="button"
                                variant={selectedReloadAmount === amount ? "default" : "outline"}
                                className="h-12"
                                onClick={() => {
                                  setSelectedReloadAmount(amount);
                                  giftCardReloadForm.setValue("amount", amount);
                                }}
                              >
                                ${amount}
                              </Button>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">
                              Or Enter Custom Amount
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                type="number"
                                placeholder="Enter custom amount"
                                className="pl-10"
                                onChange={(e) => {
                                  const amount = parseFloat(e.target.value);
                                  if (!isNaN(amount)) {
                                    setSelectedReloadAmount(amount);
                                    giftCardReloadForm.setValue("amount", amount);
                                  }
                                }}
                                min="10"
                                max="1000"
                              />
                            </div>
                          </div>
                        </div>

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isProcessing || !selectedReloadAmount || selectedReloadAmount < 10 || !giftCardReloadForm.getValues("code")}
                        >
                          {isProcessing ? "Processing..." : `Reload Gift Card ${selectedReloadAmount ? `($${selectedReloadAmount})` : ""}`}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Collapsible Gift Cards Search Section */}
            <div className="mt-8">
              <Card className="w-full">
                <CardHeader 
                  className="cursor-pointer"
                  onClick={() => setShowGiftCardsSection(!showGiftCardsSection)}
                >
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      View & Search All Gift Cards
                    </div>
                    {showGiftCardsSection ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    Search and view all gift cards and certificates in the database
                  </CardDescription>
                </CardHeader>
                
                {showGiftCardsSection && (
                  <CardContent className="space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        type="text"
                        placeholder="Search by code, name, or email..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    {/* Gift Cards Table */}
                    <div className="overflow-x-auto">
                      {giftCardsQuery.isLoading ? (
                        <div className="text-center py-8">
                          <Clock className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                          <p className="text-gray-500">Loading gift cards...</p>
                        </div>
                      ) : giftCardsQuery.error ? (
                        <div className="text-center py-8">
                          <XCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                          <p className="text-red-600">Failed to load gift cards</p>
                        </div>
                      ) : filteredGiftCards.length === 0 ? (
                        <div className="text-center py-8">
                          <Gift className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-gray-500">
                            {searchTerm ? "No gift cards found matching your search" : "No gift cards found"}
                          </p>
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Code
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Recipient
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Email
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Initial Amount
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Current Balance
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Issued Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Expiry Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredGiftCards.map((card: any) => (
                              <tr key={card.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="font-mono text-sm">{card.code}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm">
                                    {card.code?.startsWith('GC') ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs">
                                        <Gift className="h-3 w-3" />
                                        Certificate
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                                        <CreditCard className="h-3 w-3" />
                                        Physical Card
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm">{card.issuedToName || '-'}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">{card.issuedToEmail || '-'}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm font-medium">${card.initialAmount || 0}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`text-sm font-bold ${
                                    card.currentBalance > 0 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-gray-400'
                                  }`}>
                                    ${card.currentBalance || 0}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {card.status === 'active' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs">
                                      <CheckCircle className="h-3 w-3" />
                                      Active
                                    </span>
                                  ) : card.status === 'expired' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
                                      <XCircle className="h-3 w-3" />
                                      Expired
                                    </span>
                                  ) : card.status === 'used' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-xs">
                                      <CheckCircle className="h-3 w-3" />
                                      Used
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-xs">
                                      {card.status}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {card.createdAt ? new Date(card.createdAt).toLocaleDateString() : '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {card.expiryDate ? new Date(card.expiryDate).toLocaleDateString() : '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {card.code?.startsWith('GC') && card.issuedToEmail && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenResendDialog(card)}
                                      className="flex items-center gap-1"
                                    >
                                      <Send className="h-3 w-3" />
                                      Resend
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Summary Stats */}
                    {!giftCardsQuery.isLoading && filteredGiftCards.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Cards</p>
                            <p className="text-2xl font-bold">{filteredGiftCards.length}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Active Cards</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {filteredGiftCards.filter((c: any) => c.status === 'active').length}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Value Issued</p>
                            <p className="text-2xl font-bold">
                              ${filteredGiftCards.reduce((sum: number, c: any) => sum + (c.initialAmount || 0), 0).toFixed(2)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Outstanding Balance</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              ${filteredGiftCards.reduce((sum: number, c: any) => sum + (c.currentBalance || 0), 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          </main>
        </div>
      </div>
      
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
            <DialogDescription>
              {pendingPurchaseData && (
                <>
                  Choose how to pay for the ${pendingPurchaseData.amount} gift certificate for {pendingPurchaseData.recipientName}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Payment Method</label>
              <Select value={paymentMethod} onValueChange={(value: "cash" | "card" | "terminal") => setPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Cash
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Credit/Debit Card
                    </div>
                  </SelectItem>
                  <SelectItem value="terminal">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Helcim Terminal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {pendingPurchaseData && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-medium">${pendingPurchaseData.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recipient:</span>
                    <span className="font-medium">{pendingPurchaseData.recipientName}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={processPayment}>
              Continue to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Payment Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cash Payment</DialogTitle>
            <DialogDescription>
              Enter the cash amount received from the customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Amount Due</label>
              <div className="text-2xl font-bold">${pendingPurchaseData?.amount.toFixed(2)}</div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Cash Received</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
              />
              {cashReceived && parseFloat(cashReceived) >= (pendingPurchaseData?.amount || 0) && (
                <p className="text-sm text-green-600 mt-1">
                  Change: ${(parseFloat(cashReceived) - (pendingPurchaseData?.amount || 0)).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCashDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCashPayment} disabled={!cashReceived || parseFloat(cashReceived) < (pendingPurchaseData?.amount || 0)}>
              Complete Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Helcim Pay.js Modal */}
      {showHelcimPayModal && pendingPurchaseData && (
        <HelcimPayJsModal
          open={showHelcimPayModal}
          onOpenChange={setShowHelcimPayModal}
          amount={pendingPurchaseData.amount}
          description={`Gift Certificate for ${pendingPurchaseData.recipientName}`}
          customerEmail={pendingPurchaseData.purchaserEmail}
          customerName={pendingPurchaseData.purchaserName}
          onSuccess={handleHelcimSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Smart Terminal Payment */}
      {showTerminalPayment && pendingPurchaseData && (
        <SmartTerminalPayment
          open={showTerminalPayment}
          onOpenChange={setShowTerminalPayment}
          amount={pendingPurchaseData.amount}
          description={`Gift Certificate for ${pendingPurchaseData.recipientName}`}
          onSuccess={handleTerminalSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Receipt Confirmation Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Gift Certificate Purchase Complete!
            </DialogTitle>
            <DialogDescription>
              Your gift certificate has been successfully purchased and emailed to the recipient.
            </DialogDescription>
          </DialogHeader>
          
          {purchaseData && (
            <div className="space-y-6">
              {/* Purchase Summary */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h3 className="font-medium text-green-900 dark:text-green-100 mb-3">Purchase Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Gift Certificate Code:</span>
                    <span className="font-mono font-medium text-green-900 dark:text-green-100">
                      {purchaseData.giftCard.code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                    <span className="font-medium text-green-900 dark:text-green-100">
                      ${purchaseData.giftCard.initialAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Recipient:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {purchaseData.giftCard.issuedToName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Sent to:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {purchaseData.giftCard.issuedToEmail}
                    </span>
                  </div>
                </div>
              </div>

              {/* Receipt Options */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Send Receipt Copy</h3>
                
                {/* Email Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      id="receipt-email"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const email = (document.getElementById('receipt-email') as HTMLInputElement)?.value;
                        if (email) {
                          handleReceiptEmailSend(email);
                          (document.getElementById('receipt-email') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>

                {/* SMS Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMS Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      id="receipt-phone"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const phone = (document.getElementById('receipt-phone') as HTMLInputElement)?.value;
                        if (phone) {
                          handleReceiptSMSSend(phone);
                          (document.getElementById('receipt-phone') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={handleCloseReceipt} className="w-full">
              <Receipt className="h-4 w-4 mr-2" />
              Complete Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift Card Payment Dialog */}
      <Dialog open={showGiftCardPaymentDialog} onOpenChange={setShowGiftCardPaymentDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
            <DialogDescription>
              {pendingGiftCardData && (
                <>
                  Choose how to pay for the ${pendingGiftCardData.amount} gift card.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Payment Method</label>
              <Select value={giftCardPaymentMethod} onValueChange={(value: "cash" | "card" | "terminal") => setGiftCardPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Cash
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Credit/Debit Card
                    </div>
                  </SelectItem>
                  <SelectItem value="terminal">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Helcim Terminal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {pendingGiftCardData && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-medium">${pendingGiftCardData.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Card Number:</span>
                    <span className="font-medium">{pendingGiftCardData.code}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGiftCardPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={processGiftCardPayment}>
              Continue to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift Card Cash Payment Dialog */}
      <Dialog open={showGiftCardCashDialog} onOpenChange={setShowGiftCardCashDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cash Payment</DialogTitle>
            <DialogDescription>
              Enter the cash amount received from the customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Amount Due</label>
              <div className="text-2xl font-bold">${pendingGiftCardData?.amount.toFixed(2)}</div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Cash Received</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={giftCardCashReceived}
                onChange={(e) => setGiftCardCashReceived(e.target.value)}
              />
              {giftCardCashReceived && parseFloat(giftCardCashReceived) >= (pendingGiftCardData?.amount || 0) && (
                <p className="text-sm text-green-600 mt-1">
                  Change: ${(parseFloat(giftCardCashReceived) - (pendingGiftCardData?.amount || 0)).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGiftCardCashDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGiftCardCashPayment} disabled={!giftCardCashReceived || parseFloat(giftCardCashReceived) < (pendingGiftCardData?.amount || 0)}>
              Complete Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift Card Helcim Pay.js Modal */}
      {showGiftCardHelcimPay && pendingGiftCardData && (
        <HelcimPayJsModal
          open={showGiftCardHelcimPay}
          onOpenChange={setShowGiftCardHelcimPay}
          amount={pendingGiftCardData.amount}
          description={`Gift Card Purchase - ${pendingGiftCardData.code}`}
          onSuccess={handleGiftCardHelcimSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Gift Card Smart Terminal Payment */}
      {showGiftCardTerminal && pendingGiftCardData && (
        <SmartTerminalPayment
          open={showGiftCardTerminal}
          onOpenChange={setShowGiftCardTerminal}
          amount={pendingGiftCardData.amount}
          description={`Gift Card Purchase - ${pendingGiftCardData.code}`}
          onSuccess={handleGiftCardTerminalSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Reload Payment Dialog */}
      <Dialog open={showReloadPaymentDialog} onOpenChange={setShowReloadPaymentDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
            <DialogDescription>
              {pendingReloadData && (
                <>
                  Choose how to pay for the reload amount of ${pendingReloadData.amount.toFixed(2)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Method</label>
              <Select value={reloadPaymentMethod} onValueChange={(value: "cash" | "card" | "terminal") => setReloadPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Cash
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Credit/Debit Card
                    </div>
                  </SelectItem>
                  <SelectItem value="terminal">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Smart Terminal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowReloadPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={processReloadPayment}>
              Continue to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reload Cash Payment Dialog */}
      <Dialog open={showReloadCashDialog} onOpenChange={setShowReloadCashDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cash Payment</DialogTitle>
            <DialogDescription>
              Reload amount: ${pendingReloadData?.amount?.toFixed(2) || '0.00'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cash Received</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="number"
                  placeholder="Enter cash amount received"
                  value={reloadCashReceived}
                  onChange={(e) => setReloadCashReceived(e.target.value)}
                  className="pl-10"
                  min={pendingReloadData?.amount || 0}
                  step="0.01"
                />
              </div>
            </div>
            {reloadCashReceived && parseFloat(reloadCashReceived) >= (pendingReloadData?.amount || 0) && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm">
                  Change: <span className="font-semibold">${(parseFloat(reloadCashReceived) - (pendingReloadData?.amount || 0)).toFixed(2)}</span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowReloadCashDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReloadCashPayment} disabled={!reloadCashReceived || parseFloat(reloadCashReceived) < (pendingReloadData?.amount || 0)}>
              Complete Reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reload Helcim Payment */}
      {showReloadHelcimPay && pendingReloadData && (
        <HelcimPayJsModal
          open={showReloadHelcimPay}
          onOpenChange={setShowReloadHelcimPay}
          amount={pendingReloadData.amount}
          description={`Gift Card Reload - ${pendingReloadData.code}`}
          onSuccess={handleReloadHelcimSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Reload Smart Terminal Payment */}
      {showReloadTerminal && pendingReloadData && (
        <SmartTerminalPayment
          open={showReloadTerminal}
          onOpenChange={setShowReloadTerminal}
          amount={pendingReloadData.amount}
          description={`Gift Card Reload - ${pendingReloadData.code}`}
          onSuccess={handleReloadTerminalSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Gift Card Purchase Receipt Dialog */}
      <Dialog open={showGiftCardReceiptDialog} onOpenChange={setShowGiftCardReceiptDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Gift Card Purchase Complete!
            </DialogTitle>
            <DialogDescription>
              Gift card has been successfully purchased.
            </DialogDescription>
          </DialogHeader>
          
          {giftCardReceiptData && (
            <div className="space-y-6">
              {/* Purchase Summary */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h3 className="font-medium text-green-900 dark:text-green-100 mb-3">Purchase Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Gift Card Code:</span>
                    <span className="font-mono font-medium text-green-900 dark:text-green-100">
                      {giftCardReceiptData.giftCard.code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                    <span className="font-medium text-green-900 dark:text-green-100">
                      ${(giftCardReceiptData.giftCard.initialAmount || giftCardReceiptData.giftCard.currentBalance || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Payment Method:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {giftCardReceiptData.paymentMethod === 'cash' ? 'Cash' : 
                       giftCardReceiptData.paymentMethod === 'card' ? 'Credit/Debit Card' : 
                       'Helcim Terminal'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Receipt Options */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Send Receipt</h3>
                
                {/* Email Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      id="gift-card-receipt-email"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const email = (document.getElementById('gift-card-receipt-email') as HTMLInputElement)?.value;
                        if (email) {
                          handleGiftCardReceiptEmailSend(email);
                          (document.getElementById('gift-card-receipt-email') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>

                {/* SMS Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMS Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      id="gift-card-receipt-phone"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const phone = (document.getElementById('gift-card-receipt-phone') as HTMLInputElement)?.value;
                        if (phone) {
                          handleGiftCardReceiptSMSSend(phone);
                          (document.getElementById('gift-card-receipt-phone') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => {
              setShowGiftCardReceiptDialog(false);
              setGiftCardReceiptData(null);
              toast({
                title: "Gift Card Purchased!",
                description: `Gift card ${giftCardReceiptData?.giftCard?.code} has been created successfully`,
              });
            }} className="w-full">
              <Receipt className="h-4 w-4 mr-2" />
              Complete Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift Card Reload Receipt Dialog */}
      <Dialog open={showReloadReceiptDialog} onOpenChange={setShowReloadReceiptDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Gift Card Reload Complete!
            </DialogTitle>
            <DialogDescription>
              Gift card has been successfully reloaded.
            </DialogDescription>
          </DialogHeader>
          
          {reloadReceiptData && (
            <div className="space-y-6">
              {/* Reload Summary */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h3 className="font-medium text-green-900 dark:text-green-100 mb-3">Reload Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Gift Card Code:</span>
                    <span className="font-mono font-medium text-green-900 dark:text-green-100">
                      {reloadReceiptData.giftCard.code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Amount Added:</span>
                    <span className="font-medium text-green-900 dark:text-green-100">
                      ${reloadReceiptData.amountAdded.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">New Balance:</span>
                    <span className="font-medium text-green-900 dark:text-green-100">
                      ${reloadReceiptData.newBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Payment Method:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {reloadReceiptData.paymentMethod === 'cash' ? 'Cash' : 
                       reloadReceiptData.paymentMethod === 'card' ? 'Credit/Debit Card' : 
                       'Helcim Terminal'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Receipt Options */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Send Receipt</h3>
                
                {/* Email Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      id="reload-receipt-email"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const email = (document.getElementById('reload-receipt-email') as HTMLInputElement)?.value;
                        if (email) {
                          handleReloadReceiptEmailSend(email);
                          (document.getElementById('reload-receipt-email') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>

                {/* SMS Receipt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMS Receipt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      id="reload-receipt-phone"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const phone = (document.getElementById('reload-receipt-phone') as HTMLInputElement)?.value;
                        if (phone) {
                          handleReloadReceiptSMSSend(phone);
                          (document.getElementById('reload-receipt-phone') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => {
              setShowReloadReceiptDialog(false);
              setReloadReceiptData(null);
              toast({
                title: "Gift Card Reloaded!",
                description: `Gift card ${reloadReceiptData?.giftCard?.code} has been reloaded successfully. New balance: $${reloadReceiptData?.newBalance?.toFixed(2)}`,
              });
            }} className="w-full">
              <Receipt className="h-4 w-4 mr-2" />
              Complete Reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Inquiry Dialog */}
      <Dialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Send Balance Information
            </DialogTitle>
            <DialogDescription>
              Send the current balance information to the customer.
            </DialogDescription>
          </DialogHeader>
          
          {currentBalanceData && (
            <div className="space-y-6">
              {/* Balance Summary */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Balance Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Gift Card Code:</span>
                    <span className="font-mono font-medium text-blue-900 dark:text-blue-100">
                      {balanceCheckCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Current Balance:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      ${currentBalanceData.balance?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {getStatusText(currentBalanceData.status)}
                    </span>
                  </div>
                  {currentBalanceData.expiryDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {new Date(currentBalanceData.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Send Options */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Send Balance Information</h3>
                
                {/* Email Balance */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Balance
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      id="balance-email"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const email = (document.getElementById('balance-email') as HTMLInputElement)?.value;
                        if (email) {
                          handleBalanceInquiryEmail(email);
                          (document.getElementById('balance-email') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>

                {/* SMS Balance */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMS Balance
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      id="balance-phone"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        const phone = (document.getElementById('balance-phone') as HTMLInputElement)?.value;
                        if (phone) {
                          handleBalanceInquirySMS(phone);
                          (document.getElementById('balance-phone') as HTMLInputElement).value = '';
                        }
                      }}
                      variant="outline"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => {
              setShowBalanceDialog(false);
              setCurrentBalanceData(null);
            }} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Gift Certificate Dialog */}
      <Dialog open={showResendDialog} onOpenChange={setShowResendDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Resend Gift Certificate
            </DialogTitle>
            <DialogDescription>
              Choose how to resend the gift certificate to the recipient
            </DialogDescription>
          </DialogHeader>
          
          {selectedGiftCertificate && (
            <div className="space-y-4">
              {/* Gift Certificate Details */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Code:</span>
                    <span className="font-mono font-medium">{selectedGiftCertificate.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                    <span className="font-medium">${selectedGiftCertificate.initialAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Recipient:</span>
                    <span className="font-medium">{selectedGiftCertificate.issuedToName || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Delivery Method Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Delivery Method</label>
                <Select value={resendMethod} onValueChange={(value: "email" | "sms") => setResendMethod(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                    </SelectItem>
                    <SelectItem value="sms">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        SMS Text Message
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recipient Input */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {resendMethod === "email" ? "Email Address" : "Phone Number"}
                </label>
                <Input
                  type={resendMethod === "email" ? "email" : "tel"}
                  placeholder={resendMethod === "email" ? "recipient@example.com" : "(123) 456-7890"}
                  value={resendRecipient}
                  onChange={(e) => setResendRecipient(e.target.value)}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowResendDialog(false);
              setSelectedGiftCertificate(null);
              setResendRecipient("");
            }}>
              Cancel
            </Button>
            <Button onClick={handleResendGiftCertificate}>
              <Send className="h-4 w-4 mr-2" />
              Resend Gift Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}