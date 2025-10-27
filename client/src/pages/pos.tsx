import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// Helcim payment processing

import { SidebarController } from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import CheckoutWithTerminal from "@/components/payment/checkout-with-terminal";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import TipSelection from "@/components/appointments/tip-selection";
import { 
  Plus, 
  Minus, 
  Search, 
  ShoppingCart, 
  CreditCard, 
  Trash2,
  Receipt,
  User,
  Mail,
  MessageCircle,
  Check,
  X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import HelcimPayJsModal from "@/components/payment/helcim-payjs-modal";
import SmartTerminalPayment from "@/components/payment/smart-terminal-payment";




type Service = {
  id: number;
  name: string;
  description: string;
  duration: number;
  price: number;
  categoryId: number;
  color: string;
};

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  brand?: string;
  stockQuantity: number;
  imageUrl?: string;
};

type Client = {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

type CartItem = {
  item: Service | Product;
  type: 'service' | 'product';
  quantity: number;
  total: number;
};

type Transaction = {
  id: string;
  clientId?: number;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  timestamp: Date;
};

export default function PointOfSale() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [cashReceived, setCashReceived] = useState<string>("");

  const [activeTab, setActiveTab] = useState<'services' | 'products'>('services');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [tipAmount, setTipAmount] = useState(0);
  const [showHelcimModal, setShowHelcimModal] = useState(false);
  const [showTerminalDialog, setShowTerminalDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    sku: "",
    price: 0,
    costPrice: 0,
    category: "",
    brand: "",
    stockQuantity: 0,
    minStockLevel: 5,
    isActive: true,
    isTaxable: true
  });
  const { toast } = useToast();

  useDocumentTitle("Point of Sale");
  // Open terminal dialog when terminal is selected; close when not selected
  useEffect(() => {
    if (paymentMethod === "terminal") {
      setShowTerminalDialog(true);
    } else {
      setShowTerminalDialog(false);
    }
  }, [paymentMethod]);

  const queryClient = useQueryClient();

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      return await apiRequest("POST", "/api/products", productData);
    },
    onSuccess: () => {
      toast({
        title: "Product created",
        description: "Product has been added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsAddProductOpen(false);
      resetProductForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const resetProductForm = () => {
    setNewProduct({
      name: "",
      description: "",
      sku: "",
      price: 0,
      costPrice: 0,
      category: "",
      brand: "",
      stockQuantity: 0,
      minStockLevel: 5,
      isActive: true,
      isTaxable: true
    });
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields per backend schema
    if (!newProduct.name || newProduct.price <= 0 || !newProduct.category || newProduct.category.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Please provide Name, Category, and a valid Price",
        variant: "destructive",
      });
      return;
    }
    // Clean payload: remove optional fields if empty to avoid DB unique conflicts (e.g., empty SKU)
    const payload: any = {
      ...newProduct,
      name: newProduct.name.trim(),
      category: newProduct.category.trim(),
    };

    if (!newProduct.description || newProduct.description.trim() === "") {
      delete payload.description;
    } else {
      payload.description = newProduct.description.trim();
    }

    if (!newProduct.sku || newProduct.sku.trim() === "") {
      delete payload.sku;
    } else {
      payload.sku = newProduct.sku.trim();
    }

    if (!newProduct.brand || newProduct.brand.trim() === "") {
      delete payload.brand;
    } else {
      payload.brand = newProduct.brand.trim();
    }

    // Pre-validate SKU uniqueness client-side to provide a friendly error
    if (payload.sku && Array.isArray(products)) {
      const skuExists = (products as any[]).some((p: any) => (p.sku || '').toLowerCase() === payload.sku.toLowerCase());
      if (skuExists) {
        toast({
          title: "Duplicate SKU",
          description: "That SKU already exists. Please use a different SKU or leave it blank.",
          variant: "destructive",
        });
        return;
      }
    }

    createProductMutation.mutate(payload);
  };



  // Tax rate (8.5%)
  const TAX_RATE = 0.085;

  // Fetch services
  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const response = await fetch('/api/services');
      if (!response.ok) throw new Error('Failed to fetch services');
      return response.json();
    },
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache data (gcTime replaces cacheTime)
  });

  // Fetch service categories
  const { data: categories } = useQuery({
    queryKey: ["/api/service-categories"],
    queryFn: async () => {
      const response = await fetch('/api/service-categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  // Fetch products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    }
  });

  // Build product category list from existing products
  const productCategories: string[] = Array.from(
    new Set(((products as any[]) || []).map((p: any) => (p.category || '').trim()).filter((c: string) => c))
  ).sort();

  // Local additions for categories within POS dialog
  const [posExtraCategories, setPosExtraCategories] = useState<string[]>([]);
  const allProductCategories: string[] = Array.from(new Set([...(productCategories as string[]), ...posExtraCategories]));
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryNamePOS, setNewCategoryNamePOS] = useState("");

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch clients');
      return response.json();
    }
  });

  const clientList = (clients as any[])?.filter((user: any) => user.role === 'client') || [];

  // Send receipt email mutation
  const sendReceiptEmailMutation = useMutation({
    mutationFn: async ({ email, receiptData }: { email: string; receiptData: any }) => {
      const response = await apiRequest("POST", "/api/send-receipt-email", {
        email,
        receiptData
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Receipt sent",
        description: "Email receipt sent successfully",
      });
      setManualEmail("");
    },
    onError: (error: any) => {
      toast({
        title: "Email failed",
        description: error.message || "Failed to send email receipt",
        variant: "destructive",
      });
    },
  });

  // Send receipt SMS mutation
  const sendReceiptSMSMutation = useMutation({
    mutationFn: async ({ phone, receiptData }: { phone: string; receiptData: any }) => {
      const response = await apiRequest("POST", "/api/send-receipt-sms", {
        phone,
        receiptData
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Receipt sent",
        description: "SMS receipt sent successfully",
      });
      setManualPhone("");
    },
    onError: (error: any) => {
      toast({
        title: "SMS failed",
        description: error.message || "Failed to send SMS receipt",
        variant: "destructive",
      });
    },
  });

  // Process transaction mutation
  const processTransactionMutation = useMutation({
    mutationFn: async (transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
      console.log('Processing POS transaction:', transaction);
      const response = await apiRequest("POST", "/api/transactions", transaction);
      const result = await response.json();
      console.log('POS transaction response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('POS transaction completed successfully:', data);
      
      // Store transaction details for receipt
      setLastTransaction({
        ...data,
        client: selectedClient,
        items: cart,
        subtotal: getSubtotal(),
        tax: getTax(),
        tipAmount: tipAmount,
        total: getGrandTotal(),
        paymentMethod,
        timestamp: new Date()
      });
      
      toast({
        title: "Transaction completed",
        description: "Sale processed successfully",
      });
      clearCart();
      setIsCheckoutOpen(false);
      setCashReceived("");
      setSelectedClient(null);
      setManualEmail("");
      setManualPhone("");
      setTipAmount(0);
      setShowReceiptDialog(true);
    },
    onError: (error) => {
      console.error('POS transaction error:', error);
      toast({
        title: "Transaction failed",
        description: error.message || "Unable to process sale",
        variant: "destructive",
      });
    },
  });

  // Helcim popup payment handlers
  const handlePaymentSuccess = (result: any) => {
    toast({
      title: "Payment Successful",
      description: `Payment processed successfully`,
    });
    // Clear cart and reset state
    clearCart();
    setSelectedClient(null);
    setManualEmail("");
    setManualPhone("");
    setTipAmount(0);
    setShowReceiptDialog(true);
  };

  const handleHelcimSuccess = async (paymentId: string) => {
    try {
      console.log('✅ Helcim popup payment successful:', paymentId);
      
      // Create transaction with card payment
      const transaction = {
        clientId: selectedClient?.id,
        items: cart,
        subtotal: getSubtotal(),
        tax: getTax(),
        tipAmount: tipAmount,
        total: getGrandTotal(),
        paymentMethod: "card",
      };
      
      // Process the transaction with card payment
      const response = await apiRequest("POST", "/api/transactions", {
        ...transaction,
        paymentId,
        helcimPaymentId: paymentId
      });
      const result = await response.json();
      
      // Store transaction details for receipt
      setLastTransaction({
        ...result,
        client: selectedClient,
        items: cart,
        subtotal: getSubtotal(),
        tax: getTax(),
        tipAmount: tipAmount,
        total: getGrandTotal(),
        paymentMethod: "card",
        timestamp: new Date(),
        paymentId
      });
      
      toast({
        title: "Payment Successful",
        description: `Card payment of $${getGrandTotal().toFixed(2)} processed successfully`,
      });
      
      clearCart();
      setIsCheckoutOpen(false);
      setShowHelcimModal(false);
      setCashReceived("");
      setSelectedClient(null);
      setManualEmail("");
      setManualPhone("");
      setTipAmount(0);
      setShowReceiptDialog(true);
      
    } catch (error: any) {
      console.error('❌ Error processing Helcim payment:', error);
      toast({
        title: "Payment Error",
        description: "Payment succeeded but transaction recording failed. Please check transactions.",
        variant: "destructive",
      });
      setShowHelcimModal(false);
    }
  };

  const handleHelcimError = (error: string) => {
    console.error('❌ Helcim popup payment failed:', error);
    toast({
      title: "Payment Failed",
      description: error,
      variant: "destructive",
    });
    setShowHelcimModal(false);
  };

  // Smart Terminal payment handlers
  const handleTerminalSuccess = async (result: any) => {
    try {
      console.log('✅ Smart Terminal payment successful:', result);
      
      // The service cost (subtotal) is what we know from the cart - it should NEVER change
      const originalSubtotal = getSubtotal();
      
      // The total amount is what Helcim actually charged
      const terminalTotalAmount = result.amount || getGrandTotal();
      
      // The tip is the difference between what was charged and the subtotal + tax
      // If Helcim provides the tip amount, use it; otherwise calculate it
      const terminalTipAmount = result.tipAmount !== undefined ? 
                                result.tipAmount : 
                                Math.max(0, terminalTotalAmount - originalSubtotal - getTax());
      
      console.log('💰 Terminal amounts:', {
        baseAmount: originalSubtotal,
        tipAmount: terminalTipAmount,
        totalAmount: terminalTotalAmount,
        originalResult: result
      });
      
      // Create transaction with terminal payment
      const transaction = {
        clientId: selectedClient?.id,
        items: cart,
        subtotal: originalSubtotal,  // ALWAYS use the original subtotal
        tax: getTax(),
        tipAmount: terminalTipAmount,
        total: terminalTotalAmount,
        paymentMethod: "terminal",
      };
      
      // Use the complete-pos endpoint to save payment with tip
      try {
        const completeResponse = await fetch('/api/terminal/complete-pos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transactionId: result.transactionId,
            cardLast4: result.cardLast4 || result.last4,
            totalAmount: terminalTotalAmount,
            tipAmount: terminalTipAmount,
            baseAmount: originalSubtotal
          }),
        });

        const completeResult = await completeResponse.json();
        
        if (completeResult.success) {
          console.log('✅ Terminal payment completed and saved to reports');
          
          // Use the payment result from complete-pos
          const transactionResult = {
            success: true,
            transactionId: result.transactionId,
            payment: completeResult.payment,
            total: terminalTotalAmount
          };
          
          // Store transaction details for receipt
          setLastTransaction({
            ...transactionResult,
            client: selectedClient,
            items: cart,
            subtotal: originalSubtotal,
            tax: getTax(),
            tipAmount: terminalTipAmount,
            total: terminalTotalAmount,
            paymentMethod: "terminal",
            timestamp: new Date(),
            paymentId: result.transactionId,
            cardLast4: result.cardLast4
          });
          
          toast({
            title: "Payment Successful",
            description: `Terminal payment of $${terminalTotalAmount.toFixed(2)} completed${terminalTipAmount > 0 ? ` (includes $${terminalTipAmount.toFixed(2)} tip)` : ''}. Card ending in ${result.cardLast4 || '****'}`,
          });
          
          clearCart();
          setIsCheckoutOpen(false);
          setCashReceived("");
          setSelectedClient(null);
          setManualEmail("");
          setManualPhone("");
          setTipAmount(0);
          setShowReceiptDialog(true);
        } else {
          throw new Error(completeResult.error || 'Failed to sync payment with calendar');
        }
      } catch (error: any) {
        console.error('Error completing terminal payment, trying alternate method:', error);
        
        // Fallback: Still process the transaction using the transactions endpoint
        const response = await apiRequest("POST", "/api/transactions", {
          ...transaction,
          paymentId: result.transactionId,
          helcimTransactionId: result.transactionId,
          cardLast4: result.cardLast4,
          tipAmount: terminalTipAmount, // Make sure tip is passed
          total: terminalTotalAmount,    // Make sure total includes tip
          terminalPaymentMethod: result.paymentMethod
        });
        const transactionResult = await response.json();
        
        // Store transaction details for receipt
        setLastTransaction({
          ...transactionResult,
          client: selectedClient,
          items: cart,
          subtotal: originalSubtotal,
          tax: getTax(),
          tipAmount: terminalTipAmount,
          total: terminalTotalAmount,
          paymentMethod: "terminal",
          timestamp: new Date(),
          paymentId: result.transactionId,
          cardLast4: result.cardLast4
        });
        
        toast({
          title: "Payment Successful",
          description: `Terminal payment of $${terminalTotalAmount.toFixed(2)} completed${terminalTipAmount > 0 ? ` (includes $${terminalTipAmount.toFixed(2)} tip)` : ''}. Card ending in ${result.cardLast4 || '****'}`,
        });
        
        clearCart();
        setIsCheckoutOpen(false);
        setCashReceived("");
        setSelectedClient(null);
        setManualEmail("");
        setManualPhone("");
        setTipAmount(0);
        setShowReceiptDialog(true);
      }
      
    } catch (error: any) {
      console.error('❌ Error processing terminal payment:', error);
      toast({
        title: "Payment Error",
        description: "Payment succeeded but transaction recording failed. Please check transactions.",
        variant: "destructive",
      });
    }
  };

  const handleTerminalError = (error: string) => {
    console.error('❌ Smart Terminal payment failed:', error);
    toast({
      title: "Terminal Payment Failed",
      description: error,
      variant: "destructive",
    });
  };

  const addServiceToCart = (service: Service) => {
    setCart(prev => {
      const existingItem = prev.find(item => item.type === 'service' && item.item.id === service.id);
      if (existingItem) {
        return prev.map(item =>
          item.type === 'service' && item.item.id === service.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * service.price }
            : item
        );
      } else {
        return [...prev, { item: service, type: 'service', quantity: 1, total: service.price }];
      }
    });
  };

  const addProductToCart = (product: Product) => {
    setCart(prev => {
      const existingItem = prev.find(item => item.type === 'product' && item.item.id === product.id);
      if (existingItem) {
        return prev.map(item =>
          item.type === 'product' && item.item.id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * product.price }
            : item
        );
      } else {
        return [...prev, { item: product, type: 'product', quantity: 1, total: product.price }];
      }
    });
  };

  const updateCartQuantity = (itemId: number, type: 'service' | 'product', newQuantity: number) => {
    if (newQuantity === 0) {
      removeFromCart(itemId, type);
      return;
    }
    
    setCart(prev =>
      prev.map(item =>
        item.item.id === itemId && item.type === type
          ? { ...item, quantity: newQuantity, total: newQuantity * item.item.price }
          : item
      )
    );
  };

  const removeFromCart = (itemId: number, type: 'service' | 'product') => {
    setCart(prev => prev.filter(item => !(item.item.id === itemId && item.type === type)));
  };

  const clearCart = () => {
    setCart([]);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.total, 0);
  };

  const getSubtotal = () => getCartTotal();
  const getTax = () => getSubtotal() * TAX_RATE;
  const getGrandTotal = () => getSubtotal() + getTax() + tipAmount;

  const getChange = () => {
    if (paymentMethod === "cash" && cashReceived) {
      return parseFloat(cashReceived) - getGrandTotal();
    }
    return 0;
  };

  const processTransaction = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty cart",
        description: "Please add items to cart before checkout",
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === "cash") {
      const cash = parseFloat(cashReceived);
      if (!cash || cash < getGrandTotal()) {
        toast({
          title: "Insufficient payment",
          description: "Cash amount must be greater than or equal to total",
          variant: "destructive",
        });
        return;
      }
    }

    const transaction = {
      clientId: selectedClient?.id,
      items: cart,
      subtotal: getSubtotal(),
      tax: getTax(),
      tipAmount: tipAmount,
      total: getGrandTotal(),
      paymentMethod,
    };

    processTransactionMutation.mutate(transaction);
  };

  // Helper function to get category name by ID
  const getCategoryName = (categoryId: number) => {
    const category = (categories as any[])?.find((cat: any) => cat.id === categoryId);
    return category ? category.name : 'General';
  };

  const filteredServices = (services as any[])?.filter((service: any) =>
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredProducts = (products as any[])?.filter((product: any) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.brand && product.brand.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block">
        <SidebarController isOpen={true} isMobile={false} />
      </div>
      
      <div className="flex-1 flex flex-col transition-all duration-300">
        
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 md:p-4 lg:p-6">
          <div className="w-full max-w-7xl mx-auto">
            <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 lg:gap-6 min-h-0">
              
              {/* Services Selection Panel */}
              <div className="flex-1 flex flex-col min-w-0 xl:min-w-[60%] order-2 xl:order-1">
                <div className="mb-3 sm:mb-4 lg:mb-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 sm:mb-4 gap-2 sm:gap-3">
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100">Point of Sale</h1>
                    <div className="flex items-center gap-2">
                      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-1 sm:flex-none">
                        <Button
                          size="sm"
                          variant={activeTab === 'services' ? 'default' : 'ghost'}
                          onClick={() => setActiveTab('services')}
                          className="flex-1 sm:flex-none px-3 sm:px-4 text-xs sm:text-sm"
                        >
                          Services
                        </Button>
                        <Button
                          size="sm"
                          variant={activeTab === 'products' ? 'default' : 'ghost'}
                          onClick={() => setActiveTab('products')}
                          className="flex-1 sm:flex-none px-3 sm:px-4 text-xs sm:text-sm"
                        >
                          Products
                        </Button>
                      </div>
                      
                      {/* Add Product Button - Mobile Only */}
                      {activeTab === 'products' && (
                        <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              size="default" 
                              variant="default" 
                              className="lg:hidden flex-shrink-0 min-w-[44px] min-h-[44px] px-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md flex items-center justify-center"
                            >
                              <span className="hidden min-[380px]:inline text-sm font-medium">Add</span>
                              <span className="min-[380px]:hidden text-lg">+</span>
                            </Button>
                          </DialogTrigger>
                          <DialogTrigger asChild>
                            <Button
                              size="default"
                              variant="default"
                              className="hidden lg:inline-flex flex-shrink-0 h-11 px-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md items-center gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              Add Product
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto p-4">
                            <DialogHeader>
                              <DialogTitle>Add New Product</DialogTitle>
                              <DialogDescription>
                                Create a new product for your inventory
                              </DialogDescription>
                            </DialogHeader>
                            
                            <form onSubmit={handleCreateProduct} className="space-y-4">
                              <div className="grid grid-cols-1 gap-4">
                                <div>
                                  <Label htmlFor="name">Product Name *</Label>
                                  <Input
                                    id="name"
                                    value={newProduct.name}
                                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                                    placeholder="Enter product name"
                                    className="min-h-[44px]"
                                    required
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="description">Description</Label>
                                  <Textarea
                                    id="description"
                                    value={newProduct.description}
                                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                                    placeholder="Product description"
                                    rows={2}
                                    className="min-h-[44px]"
                                  />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="price">Price *</Label>
                                    <Input
                                      id="price"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={newProduct.price}
                                      onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})}
                                      placeholder="0.00"
                                      required
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="costPrice">Cost Price</Label>
                                    <Input
                                      id="costPrice"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={newProduct.costPrice}
                                      onChange={(e) => setNewProduct({...newProduct, costPrice: parseFloat(e.target.value) || 0})}
                                      placeholder="0.00"
                                    />
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="category">Category</Label>
                                    <Select
                                      value={newProduct.category}
                                      onValueChange={(value) => setNewProduct({ ...newProduct, category: value })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a category" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {allProductCategories.length > 0 ? (
                                          allProductCategories.map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                              {cat}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No categories yet</div>
                                        )}
                                        <div className="px-2 py-1.5">
                                          <Button
                                            type="button"
                                            className="w-full"
                                            variant="outline"
                                            onClick={(e) => { e.preventDefault(); setIsAddingCategory(true); }}
                                          >
                                            + Add Category
                                          </Button>
                                        </div>
                                      </SelectContent>
                                    </Select>
                                    {isAddingCategory && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Input
                                          value={newCategoryNamePOS}
                                          onChange={(e) => setNewCategoryNamePOS(e.target.value)}
                                          placeholder="New category name"
                                          className="min-h-[40px]"
                                        />
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            const name = newCategoryNamePOS.trim();
                                            if (!name) return;
                                            const exists = allProductCategories.some((c) => c.toLowerCase() === name.toLowerCase());
                                            if (!exists) setPosExtraCategories((prev) => [...prev, name]);
                                            setNewCategoryNamePOS("");
                                            setIsAddingCategory(false);
                                            setNewProduct({ ...newProduct, category: name });
                                          }}
                                        >
                                          Save
                                        </Button>
                                        <Button type="button" variant="ghost" onClick={() => setIsAddingCategory(false)}>Cancel</Button>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="brand">Brand</Label>
                                    <Input
                                      id="brand"
                                      value={newProduct.brand}
                                      onChange={(e) => setNewProduct({...newProduct, brand: e.target.value})}
                                      placeholder="Brand name"
                                    />
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="stockQuantity">Stock Quantity</Label>
                                    <Input
                                      id="stockQuantity"
                                      type="number"
                                      min="0"
                                      value={newProduct.stockQuantity}
                                      onChange={(e) => setNewProduct({...newProduct, stockQuantity: parseInt(e.target.value) || 0})}
                                      placeholder="0"
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="minStockLevel">Min Stock Level</Label>
                                    <Input
                                      id="minStockLevel"
                                      type="number"
                                      min="0"
                                      value={newProduct.minStockLevel}
                                      onChange={(e) => setNewProduct({...newProduct, minStockLevel: parseInt(e.target.value) || 0})}
                                      placeholder="5"
                                    />
                                  </div>
                                </div>
                                
                                <div>
                                  <Label htmlFor="sku">SKU</Label>
                                  <Input
                                    id="sku"
                                    value={newProduct.sku}
                                    onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                                    placeholder="Product SKU"
                                  />
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id="isActive"
                                      checked={newProduct.isActive}
                                      onCheckedChange={(checked) => setNewProduct({...newProduct, isActive: checked})}
                                    />
                                    <Label htmlFor="isActive">Active Product</Label>
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id="isTaxable"
                                      checked={newProduct.isTaxable}
                                      onCheckedChange={(checked) => setNewProduct({...newProduct, isTaxable: checked})}
                                    />
                                    <Label htmlFor="isTaxable">Taxable</Label>
                                  </div>
                                </div>
                              </div>
                              
                              <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setIsAddProductOpen(false)}
                                  className="w-full sm:w-auto min-h-[44px]"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={createProductMutation.isPending}
                                  className="w-full sm:w-auto min-h-[44px]"
                                >
                                  {createProductMutation.isPending ? "Creating..." : "Create Product"}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                      <Input
                        type="search"
                        placeholder={`Search ${activeTab}...`}
                        className="pl-8 text-sm min-h-[44px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    {/* Alternative Add Product Button for smaller screens */}
                    {activeTab === 'products' && (
                      <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            size="default" 
                            className="min-[380px]:hidden min-w-[44px] min-h-[44px] px-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg rounded-full"
                          >
                            <Plus className="h-6 w-6" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto p-4">
                          <DialogHeader>
                            <DialogTitle>Add New Product</DialogTitle>
                            <DialogDescription>
                              Create a new product for your inventory
                            </DialogDescription>
                          </DialogHeader>
                          
                          <form onSubmit={handleCreateProduct} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                              <div>
                                <Label htmlFor="name-alt">Product Name *</Label>
                                <Input
                                  id="name-alt"
                                  value={newProduct.name}
                                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                                  placeholder="Enter product name"
                                  className="min-h-[44px]"
                                  required
                                />
                              </div>
                              
                              <div>
                                <Label htmlFor="description-alt">Description</Label>
                                <Textarea
                                  id="description-alt"
                                  value={newProduct.description}
                                  onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                                  placeholder="Product description"
                                  rows={2}
                                  className="min-h-[44px]"
                                />
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor="price-alt">Price *</Label>
                                  <Input
                                    id="price-alt"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newProduct.price}
                                    onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})}
                                    placeholder="0.00"
                                    className="min-h-[44px]"
                                    required
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="costPrice-alt">Cost Price</Label>
                                  <Input
                                    id="costPrice-alt"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newProduct.costPrice}
                                    onChange={(e) => setNewProduct({...newProduct, costPrice: parseFloat(e.target.value) || 0})}
                                    placeholder="0.00"
                                    className="min-h-[44px]"
                                  />
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor="category-alt">Category</Label>
                                  <Select
                                    value={newProduct.category}
                                    onValueChange={(value) => setNewProduct({ ...newProduct, category: value })}
                                  >
                                    <SelectTrigger className="min-h-[44px]">
                                      <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allProductCategories.length > 0 ? (
                                        allProductCategories.map((cat) => (
                                          <SelectItem key={cat} value={cat}>
                                            {cat}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No categories yet</div>
                                      )}
                                      <div className="px-2 py-1.5">
                                        <Button
                                          type="button"
                                          className="w-full"
                                          variant="outline"
                                          onClick={(e) => { e.preventDefault(); setIsAddingCategory(true); }}
                                        >
                                          + Add Category
                                        </Button>
                                      </div>
                                    </SelectContent>
                                  </Select>
                                  {isAddingCategory && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <Input
                                        value={newCategoryNamePOS}
                                        onChange={(e) => setNewCategoryNamePOS(e.target.value)}
                                        placeholder="New category name"
                                        className="min-h-[40px]"
                                      />
                                      <Button
                                        type="button"
                                        onClick={() => {
                                          const name = newCategoryNamePOS.trim();
                                          if (!name) return;
                                          const exists = allProductCategories.some((c) => c.toLowerCase() === name.toLowerCase());
                                          if (!exists) setPosExtraCategories((prev) => [...prev, name]);
                                          setNewCategoryNamePOS("");
                                          setIsAddingCategory(false);
                                          setNewProduct({ ...newProduct, category: name });
                                        }}
                                      >
                                        Save
                                      </Button>
                                      <Button type="button" variant="ghost" onClick={() => setIsAddingCategory(false)}>Cancel</Button>
                                    </div>
                                  )}
                                </div>
                                
                                <div>
                                  <Label htmlFor="brand-alt">Brand</Label>
                                  <Input
                                    id="brand-alt"
                                    value={newProduct.brand}
                                    onChange={(e) => setNewProduct({...newProduct, brand: e.target.value})}
                                    placeholder="Brand name"
                                    className="min-h-[44px]"
                                  />
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor="stockQuantity-alt">Stock Quantity</Label>
                                  <Input
                                    id="stockQuantity-alt"
                                    type="number"
                                    min="0"
                                    value={newProduct.stockQuantity}
                                    onChange={(e) => setNewProduct({...newProduct, stockQuantity: parseInt(e.target.value) || 0})}
                                    placeholder="0"
                                    className="min-h-[44px]"
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="minStockLevel-alt">Min Stock Level</Label>
                                  <Input
                                    id="minStockLevel-alt"
                                    type="number"
                                    min="0"
                                    value={newProduct.minStockLevel}
                                    onChange={(e) => setNewProduct({...newProduct, minStockLevel: parseInt(e.target.value) || 0})}
                                    placeholder="5"
                                    className="min-h-[44px]"
                                  />
                                </div>
                              </div>
                              
                              <div>
                                <Label htmlFor="sku-alt">SKU</Label>
                                <Input
                                  id="sku-alt"
                                  value={newProduct.sku}
                                  onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                                  placeholder="Product SKU"
                                  className="min-h-[44px]"
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Switch
                                    id="isActive-alt"
                                    checked={newProduct.isActive}
                                    onCheckedChange={(checked) => setNewProduct({...newProduct, isActive: checked})}
                                  />
                                  <Label htmlFor="isActive-alt">Active Product</Label>
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                  <Switch
                                    id="isTaxable-alt"
                                    checked={newProduct.isTaxable}
                                    onCheckedChange={(checked) => setNewProduct({...newProduct, isTaxable: checked})}
                                  />
                                  <Label htmlFor="isTaxable-alt">Taxable</Label>
                                </div>
                              </div>
                            </div>
                            
                            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsAddProductOpen(false)}
                                className="w-full sm:w-auto min-h-[44px]"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createProductMutation.isPending}
                                className="w-full sm:w-auto min-h-[44px]"
                              >
                                {createProductMutation.isPending ? "Creating..." : "Create Product"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>

                {/* Services/Products Grid */}
                <div className="flex-1 min-h-0">
                  {activeTab === 'services' ? (
                    servicesLoading ? (
                      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <Card key={i} className="animate-pulse">
                            <CardContent className="p-3 sm:p-4">
                              <div className="h-4 bg-gray-200 rounded mb-2"></div>
                              <div className="h-3 bg-gray-200 rounded mb-4"></div>
                              <div className="h-6 bg-gray-200 rounded"></div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                        {filteredServices.map((service: Service) => (
                          <Card key={service.id} className="cursor-pointer hover:shadow-md transition-shadow min-w-[260px]">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-base sm:text-lg">{service.name}</h3>
                                <Badge variant="secondary" className="text-xs">{getCategoryName(service.categoryId)}</Badge>
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                                {service.description}
                              </p>
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-base sm:text-lg font-bold text-primary">
                                    ${service.price.toFixed(2)}
                                  </span>
                                  <span className="text-xs sm:text-sm text-gray-500 ml-2">
                                    {service.duration}min
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => addServiceToCart(service)}
                                  className="flex items-center gap-1 text-xs sm:text-sm"
                                >
                                  <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                                  Add
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )
                  ) : (
                    productsLoading ? (
                      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <Card key={i} className="animate-pulse">
                            <CardContent className="p-3 sm:p-4">
                              <div className="h-4 bg-gray-200 rounded mb-2"></div>
                              <div className="h-3 bg-gray-200 rounded mb-4"></div>
                              <div className="h-6 bg-gray-200 rounded"></div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                        {filteredProducts.map((product: Product) => (
                          <Card key={product.id} className="cursor-pointer hover:shadow-md transition-shadow min-w-[260px]">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-base sm:text-lg">{product.name}</h3>
                                <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                                {product.description}
                              </p>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-base sm:text-lg font-bold text-primary">
                                  ${product.price.toFixed(2)}
                                </span>
                                <div className="text-right">
                                  <div className="text-xs text-gray-500">Stock: {product.stockQuantity}</div>
                                  {product.brand && (
                                    <div className="text-xs text-gray-400">{product.brand}</div>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => addProductToCart(product)}
                                className="flex items-center gap-1 w-full text-xs sm:text-sm"
                                disabled={product.stockQuantity <= 0}
                              >
                                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                                {product.stockQuantity <= 0 ? 'Out of Stock' : 'Add to Cart'}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Cart Panel */}
              <div className="w-full xl:w-80 2xl:w-96 flex flex-col xl:min-w-[320px] order-1 xl:order-2">
                <Card className="flex-1 flex flex-col h-full xl:max-h-[calc(100vh-8rem)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" />
                      Cart ({cart.length} items)
                    </CardTitle>
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col">
                    {/* Client Selection */}
                    <div className="mb-4">
                      <label className="text-sm font-medium mb-2 block">Customer (Optional)</label>
                      <Select value={selectedClient?.id?.toString() || "walk-in"} onValueChange={(value) => {
                        if (value === "walk-in") {
                          setSelectedClient(null);
                        } else {
                          const client = clientList.find((c: Client) => c.id.toString() === value);
                          setSelectedClient(client || null);
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                          {clientList.map((client: Client) => (
                            <SelectItem key={client.id} value={client.id.toString()}>
                              {client.firstName && client.lastName 
                                ? `${client.firstName} ${client.lastName}` 
                                : client.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="mb-4" />

                    {/* Cart Items */}
                    <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 mb-4 max-h-[40vh] xl:max-h-none">
                      {cart.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>Cart is empty</p>
                          <p className="text-sm">Add services or products to get started</p>
                        </div>
                      ) : (
                        cart.map((item) => (
                          <div key={`${item.type}-${item.item.id}`} className="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">{item.item.name}</h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400">${item.item.price.toFixed(2)} each</p>
                                {item.type === 'service' && (
                                  <p className="text-xs text-gray-500">{(item.item as Service).duration}min</p>
                                )}
                                {item.type === 'product' && (
                                  <p className="text-xs text-gray-500">Stock: {(item.item as Product).stockQuantity}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-sm">${item.total.toFixed(2)}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCartQuantity(item.item.id, item.type, item.quantity - 1)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCartQuantity(item.item.id, item.type, item.quantity + 1)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => removeFromCart(item.item.id, item.type)}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Cart Summary */}
                    {cart.length > 0 && (
                      <>
                        <Separator className="mb-4" />
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm sm:text-base">
                            <span>Subtotal:</span>
                            <span>${getSubtotal().toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs sm:text-sm text-gray-600">
                            <span>Tax ({(TAX_RATE * 100).toFixed(1)}%):</span>
                            <span>${getTax().toFixed(2)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-bold text-base sm:text-lg">
                            <span>Total:</span>
                            <span>${getGrandTotal().toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {/* Terminal quick access omitted to reduce complexity during HelcimPay.js rollout */}
                          <Button
                            className="w-full"
                            onClick={() => setIsCheckoutOpen(true)}
                            disabled={cart.length === 0}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Checkout
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={clearCart}
                          >
                            Clear Cart
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Complete the transaction for ${getGrandTotal().toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedClient && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="font-medium">
                    {selectedClient.firstName && selectedClient.lastName 
                      ? `${selectedClient.firstName} ${selectedClient.lastName}` 
                      : selectedClient.username}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Payment Method</label>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                >
                  Cash
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                >
                  Card
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "terminal" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("terminal")}
                >
                  Terminal
                </Button>
              </div>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Credit/Debit Card</SelectItem>
                  <SelectItem value="terminal">Helcim Terminal</SelectItem>
                  <SelectItem value="gift_card">Gift Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "cash" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Cash Received</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
                {cashReceived && parseFloat(cashReceived) >= getGrandTotal() && (
                  <p className="text-sm text-green-600 mt-1">
                    Change: ${getChange().toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {paymentMethod === "card" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Card Payment</label>
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Process a secure card payment using Helcim's payment gateway.
                  </p>
                  <Button 
                    onClick={() => setShowHelcimModal(true)}
                    className="w-full"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay ${getGrandTotal().toFixed(2)} with Card
                  </Button>
                </div>
              </div>
            )}

            {paymentMethod === "terminal" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Smart Terminal Payment</label>
                <SmartTerminalPayment
                  open={showTerminalDialog}
                  onOpenChange={(open) => {
                    setShowTerminalDialog(open);
                    if (!open) {
                      // If user closes the terminal dialog, keep checkout dialog usable
                      setPaymentMethod("card");
                    }
                  }}
                  amount={getGrandTotal()}
                  description={`POS Sale - ${cart.length} item${cart.length > 1 ? 's' : ''}`}
                  onSuccess={handleTerminalSuccess}
                  onError={handleTerminalError}
                />
              </div>
            )}

            {/* Tip Selection */}
            <div className="space-y-3">
              <h4 className="text-md font-medium">Add Tip</h4>
              <TipSelection 
                serviceAmount={getSubtotal() + getTax()}
                onTipChange={setTipAmount}
                selectedTip={tipAmount}
              />
            </div>

            {/* Payment Summary */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${getSubtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax ({(TAX_RATE * 100).toFixed(1)}%):</span>
                <span>${getTax().toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tip:</span>
                  <span>${tipAmount.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total:</span>
                <span>${getGrandTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>
              Cancel
            </Button>
            {(paymentMethod === "cash" || paymentMethod === "gift_card") && (
              <Button 
                onClick={processTransaction}
                disabled={processTransactionMutation.isPending}
              >
                {processTransactionMutation.isPending ? (
                  "Processing..."
                ) : (
                  <>
                    <Receipt className="h-4 w-4 mr-2" />
                    Complete Sale
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Confirmation Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Payment Successful
            </DialogTitle>
            <DialogDescription>
              Would you like to send a receipt to the customer?
            </DialogDescription>
          </DialogHeader>

          {lastTransaction && (
            <div className="space-y-4">
              {/* Transaction Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Transaction ID:</span>
                  <span className="font-mono text-xs">{lastTransaction.transactionId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Amount:</span>
                  <span className="font-semibold">${lastTransaction.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Payment Method:</span>
                  <span className="capitalize">{lastTransaction.paymentMethod}</span>
                </div>
                {lastTransaction.client && (
                  <div className="flex justify-between text-sm">
                    <span>Customer:</span>
                    <span>{lastTransaction.client.firstName} {lastTransaction.client.lastName}</span>
                  </div>
                )}
              </div>

              {/* Receipt Options */}
              <div className="space-y-4">
                <p className="text-sm font-medium">Send receipt via:</p>
                
                {/* Existing Customer Contact Info */}
                {lastTransaction.client?.email && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      sendReceiptEmailMutation.mutate({
                        email: lastTransaction.client.email,
                        receiptData: lastTransaction
                      });
                    }}
                    disabled={sendReceiptEmailMutation.isPending}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {sendReceiptEmailMutation.isPending ? "Sending..." : `Email to ${lastTransaction.client.email}`}
                  </Button>
                )}

                {lastTransaction.client?.phone && lastTransaction.client.phone.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      sendReceiptSMSMutation.mutate({
                        phone: lastTransaction.client.phone,
                        receiptData: lastTransaction
                      });
                    }}
                    disabled={sendReceiptSMSMutation.isPending}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {sendReceiptSMSMutation.isPending ? "Sending..." : `SMS to ${lastTransaction.client.phone}`}
                  </Button>
                )}

                {/* Manual Input Section */}
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Or enter contact information:</p>
                  
                  {/* Manual Email Input */}
                  <div className="space-y-2">
                    <Label htmlFor="manual-email" className="text-sm">Email Address</Label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-email"
                        type="email"
                        placeholder="customer@email.com"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (manualEmail.trim()) {
                            sendReceiptEmailMutation.mutate({
                              email: manualEmail.trim(),
                              receiptData: lastTransaction
                            });
                          }
                        }}
                        disabled={!manualEmail.trim() || sendReceiptEmailMutation.isPending}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        {sendReceiptEmailMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>

                  {/* Manual Phone Input */}
                  <div className="space-y-2">
                    <Label htmlFor="manual-phone" className="text-sm">Phone Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (manualPhone.trim()) {
                            sendReceiptSMSMutation.mutate({
                              phone: manualPhone.trim(),
                              receiptData: lastTransaction
                            });
                          }
                        }}
                        disabled={!manualPhone.trim() || sendReceiptSMSMutation.isPending}
                      >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        {sendReceiptSMSMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReceiptDialog(false)}
            >
              <X className="h-4 w-4 mr-2" />
              Skip Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Helcim Pay.js Modal */}
      <HelcimPayJsModal
        open={showHelcimModal}
        onOpenChange={setShowHelcimModal}
        amount={getGrandTotal()}
        description="POS transaction payment"
        customerEmail={selectedClient?.email || undefined}
        customerName={selectedClient?.firstName && selectedClient?.lastName ? `${selectedClient.firstName} ${selectedClient.lastName}` : selectedClient?.username}
        onSuccess={(data: any) => {
          const paymentId = data?.payment?.id || data?.payment?.paymentId || data?.payment?.transactionId || data?.id || data?.transactionId;
          if (!paymentId) {
            return handleHelcimError('Missing payment ID from Helcim response');
          }
          handleHelcimSuccess(String(paymentId));
        }}
        onError={handleHelcimError}
      />

    </div>
  );
}