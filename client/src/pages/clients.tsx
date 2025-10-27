import { useState, useEffect, useRef } from "react";
// import Header from "@/components/layout/header"; // Header rendered by MainLayout
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLocation } from "wouter";
// Defer loading of heavy CSV parser to avoid blocking page load


import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  FormDescription,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NoteInput } from "@/components/ui/note-input";

import { PlusCircle, Search, Edit, Trash2, MoreHorizontal, Calendar, ArrowLeft, CreditCard, ChevronDown, ChevronRight, Download, Upload, FileText, Users } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getInitials, getFullName } from "@/lib/utils";

import ClientAppointmentHistory from "@/components/client/client-appointment-history";
import ClientFormSubmissions from "@/components/client/client-form-submissions";
import ClientMemberships from "@/components/client/client-memberships";
import ClientPhotoGallery from "@/components/client/client-photo-gallery";
import ClientAddNote from "@/components/client/client-add-note";
import ClientAddPhoto from "@/components/client/client-add-photo";
import ClientCommunication from "@/components/client/client-communication";
import ClientSearchFilters from "@/components/client/client-search-filters";
import ClientNoteHistory from "@/components/client/client-note-history";
// Square payment configuration


import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { SaveCardModal } from "@/components/payment/save-card-modal";
type Client = {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;

  emailAccountManagement?: boolean;
  emailAppointmentReminders?: boolean;
  emailPromotions?: boolean;
  smsAccountManagement?: boolean;
  smsAppointmentReminders?: boolean;
  smsPromotions?: boolean;
  role: string;
  createdAt?: string;
};

const clientFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  emailAccountManagement: z.boolean().default(true),
  emailAppointmentReminders: z.boolean().default(true),
  emailPromotions: z.boolean().default(true),
  smsAccountManagement: z.boolean().default(true),
  smsAppointmentReminders: z.boolean().default(true),
  smsPromotions: z.boolean().default(true),
});

type ClientFormValues = z.infer<typeof clientFormSchema>;

const ClientsPage = () => {
  console.log('DEBUG: clients.tsx loaded');
  useDocumentTitle("Clients | Glo Head Spa");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false);
  const [addPhotoDialogOpen, setAddPhotoDialogOpen] = useState(false);
  const [clientPhotosRefreshKey, setClientPhotosRefreshKey] = useState<number>(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [clientDetail, setClientDetail] = useState<Client | null>(null);
  const [showAllClients, setShowAllClients] = useState(false);  // Start with limited clients for performance
  const [showSaveCardEdit, setShowSaveCardEdit] = useState(false);

  const [location] = useLocation();
  
  // CSV Import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Enhanced search and filter state
  const [filters, setFilters] = useState({
    status: 'all',
    communicationPreferences: [] as string[],
    appointmentStatus: 'all',
    spendingRange: 'all',
    lastVisit: 'all',
  });

  
  // Create a file input element programmatically as a fallback
  const createFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,application/vnd.ms-excel,text/plain';
    input.style.display = 'none';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0] || null;
      processSelectedFile(file);
    };
    return input;
  };

  useEffect(() => {
    const checkSidebarState = () => {
      const globalSidebarState = (window as any).sidebarIsOpen;
      if (globalSidebarState !== undefined) {
        setSidebarOpen(globalSidebarState);
      }
    };

    const interval = setInterval(checkSidebarState, 100);
    return () => clearInterval(interval);
  }, []);

  // Handle quick action navigation
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    if (searchParams.get('new') === 'true') {
      setIsAddDialogOpen(true);
      // Clean up URL without triggering navigation
      window.history.replaceState({}, '', '/clients');
    }
  }, [location]);

  const shouldSearch = debouncedQuery.length >= 2 && !showAllClients;
  const { data: clientsData, isLoading } = useQuery({
    queryKey: ['/api/users', 'search', debouncedQuery],
    queryFn: async () => {
      console.log('Fetching client search...', debouncedQuery);
      const response = await apiRequest("GET", `/api/users?search=${encodeURIComponent(debouncedQuery)}`);
      const data = await response.json();
      console.log('Client search fetched:', { count: data.length, sample: data.slice(0, 3) });
      return data;
    },
    enabled: shouldSearch,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    gcTime: 0
  });
  // Load all clients when not searching - with limit for performance
  const { data: allClientsData, isLoading: isLoadingAll } = useQuery({
    queryKey: ['/api/users?role=client', refreshTrigger, showAllClients],
    queryFn: async () => {
      const url = showAllClients 
        ? "/api/users?role=client"  // Load all when explicitly requested
        : "/api/users?role=client&limit=50";  // Load only 50 initially for performance
      const response = await apiRequest("GET", url);
      const data = await response.json();
      return data;
    },
    enabled: !shouldSearch,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    gcTime: 0
  });
  const clients = (shouldSearch ? (clientsData ?? []) : (allClientsData ?? []));
  const isLoadingCombined = shouldSearch ? isLoading : isLoadingAll;

  const addForm = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
      emailAccountManagement: true,
      emailAppointmentReminders: true,
      emailPromotions: true,
      smsAccountManagement: true,
      smsAppointmentReminders: true,
      smsPromotions: true,
    },
  });

  const editForm = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
      emailAccountManagement: true,
      emailAppointmentReminders: true,
      emailPromotions: true,
      smsAccountManagement: true,
      smsAppointmentReminders: true,
      smsPromotions: true,
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: ClientFormValues) => {
      return apiRequest("POST", "/api/clients", data);
    },
    onSuccess: async (response) => {
      const newClient = await response.json();
      // Invalidate all user-related queries with aggressive cache clearing
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users?role=client'] });
      queryClient.removeQueries({ queryKey: ['/api/users?role=client'] });
      // Force refetch client data for appointment forms
      queryClient.refetchQueries({ queryKey: ['/api/users?role=client'] });
      
      toast({
        title: "Success",
        description: "Client created successfully",
      });
      addForm.reset();
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create client: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ClientFormValues> }) => {
      console.log('updateClientMutation.mutationFn called with:', { id, data });
      console.log('Data being sent to backend:', JSON.stringify(data, null, 2));
      
      const response = await apiRequest("PUT", `/api/users/${id}`, data);
      console.log('updateClientMutation response status:', response.status);
      console.log('updateClientMutation response headers:', response.headers);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('updateClientMutation error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const responseData = await response.json();
      console.log('updateClientMutation response data:', responseData);
      console.log('Backend returned user data:', JSON.stringify(responseData, null, 2));
      return responseData;
    },
    onSuccess: (updatedClient) => {
      console.log('updateClientMutation onSuccess called with:', updatedClient);
      
      // Update the local clients array directly
      queryClient.setQueryData(['/api/users?role=client', refreshTrigger], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((client: any) => 
          client.id === updatedClient.id ? updatedClient : client
        );
      });
      
      toast({
        title: "Success",
        description: "Client updated successfully",
      });
      editForm.reset();
      setIsEditDialogOpen(false);
      setSelectedClient(null);
    },
    onError: (error) => {
      console.error('updateClientMutation onError called with:', error);
      
      // Show user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes("already in use by another user")) {
        errorMessage = "This email address is already in use by another client. Please use a different email address.";
      } else if (error.message.includes("Failed to update client")) {
        errorMessage = "Failed to update client. Please try again.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      // Invalidate and refetch to get updated list
      queryClient.invalidateQueries({ queryKey: ['/api/users?role=client', refreshTrigger] });
      // Also refresh any user search/list caches so deleted clients disappear immediately
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'search'] });
      queryClient.refetchQueries({ queryKey: ['/api/users'] });
      queryClient.refetchQueries({ queryKey: ['/api/users?role=client', refreshTrigger] });
      
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setSelectedClient(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete client: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const importClientsMutation = useMutation({
    mutationFn: async (clients: any[]) => {
      console.log('Sending import request with', clients.length, 'clients');
      setImportProgress({ current: 0, total: clients.length });
      return apiRequest("POST", "/api/clients/import", { clients });
    },
    onSuccess: async (response) => {
      console.log('Import response received:', response);
      const results = await response.json();
      console.log('Import results:', results);
      setIsImporting(false);
      setImportProgress(null);
      
      // Log any errors for debugging
      if (results.errors && results.errors.length > 0) {
        console.log('Import errors:', results.errors);
      }
      
      setImportResults(results);
      
      // Clear search query to show all clients including newly imported ones
      setSearchQuery('');
      
      // More aggressive cache invalidation to ensure fresh data
      console.log('Invalidating cache and refetching...');
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users?role=client'] });
      queryClient.removeQueries({ queryKey: ['/api/users?role=client'] });
      queryClient.removeQueries({ queryKey: ['/api/users'] });
      
      // Force refetch with fresh data
      await queryClient.refetchQueries({ queryKey: ['/api/users?role=client'] });
      
      // Clear all queries and force a complete refresh
      queryClient.clear();
      
      // Additional cache clearing for good measure
      setTimeout(() => {
        console.log('Forcing additional cache refresh...');
        queryClient.invalidateQueries({ queryKey: ['/api/users?role=client'] });
        queryClient.refetchQueries({ queryKey: ['/api/users?role=client'] });
      }, 1000);
      
      // Create a more detailed success message
      let description = `Imported ${results.imported} clients, skipped ${results.skipped}.`;
      
      if (results.imported > 0) {
        description += ` Search cleared to show all clients.`;
        if (results.skipped > 0) {
          description += ` Note: Some duplicates were modified to avoid conflicts.`;
        }
      }
      
      toast({
        title: "Import Complete",
        description: description,
      });
      
      // Show detailed results in console for debugging
      if (results.imported > 0) {
        console.log('✅ Imported clients should now be visible in the list.');
        console.log('💡 Try searching by: "Test", "User", or "test.user" to find them.');
        
        // Trigger a refresh of the client list
        setRefreshTrigger(prev => prev + 1);
        console.log('🔄 Triggered client list refresh');
        
        // Aggressively invalidate and refetch client data
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/users?role=client'] });
        queryClient.removeQueries({ queryKey: ['/api/users?role=client'] });
        queryClient.refetchQueries({ queryKey: ['/api/users?role=client'] });
        console.log('🔄 Aggressively invalidated and refetched client queries');
      }
    },
    onError: (error) => {
      console.error('Import mutation error:', error);
      setIsImporting(false);
      setImportProgress(null);
      toast({
        title: "Import Failed",
        description: `Failed to import clients: ${error.message || 'Unknown error occurred'}`,
        variant: "destructive",
      });
    }
  });

  const handleAddClient = async (values: ClientFormValues) => {
    createClientMutation.mutate(values);
  };

  const handleEditClient = (values: ClientFormValues) => {
    console.log('=== handleEditClient called ===');
    console.log('handleEditClient called with values:', values);
    console.log('selectedClient:', selectedClient);
    console.log('Form validation errors:', editForm.formState.errors);
    console.log('Form is valid:', editForm.formState.isValid);
    console.log('Form is dirty:', editForm.formState.isDirty);
    
    if (selectedClient) {
      // Convert to backend field names
      const backendData = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        address: values.address,
        city: values.city,
        state: values.state,
        zipCode: values.zipCode,
        notes: values.notes,

        emailAccountManagement: values.emailAccountManagement,
        emailAppointmentReminders: values.emailAppointmentReminders,
        emailPromotions: values.emailPromotions,
        smsAccountManagement: values.smsAccountManagement,
        smsAppointmentReminders: values.smsAppointmentReminders,
        smsPromotions: values.smsPromotions,
      };
      
      // Remove undefined values to avoid sending them to backend
      Object.keys(backendData).forEach(key => {
        if (backendData[key as keyof typeof backendData] === undefined) {
          delete backendData[key as keyof typeof backendData];
        }
      });
      
      console.log('Calling updateClientMutation with:', {
        id: selectedClient.id,
        data: backendData
      });
      console.log('Phone number being sent:', backendData.phone);
      console.log('Phone number type:', typeof backendData.phone);
      console.log('Phone number length:', backendData.phone?.length);
      console.log('Is placeholder phone:', backendData.phone?.startsWith('555-000-'));
      console.log('Original client phone:', selectedClient?.phone);
      console.log('New phone number:', backendData.phone);
      console.log('Phone number changed:', selectedClient?.phone !== backendData.phone);
      console.log('Trying to update phone from:', selectedClient?.phone, 'to:', backendData.phone);
      
      // Log the exact data being sent
      const mutationData = {
        id: selectedClient.id,
        data: backendData
      };
      console.log('Mutation data:', JSON.stringify(mutationData, null, 2));
      
      updateClientMutation.mutate(mutationData);
    } else {
      console.error('No selectedClient found');
    }
  };

  const handleDeleteClient = () => {
    if (selectedClient) {
      deleteClientMutation.mutate(selectedClient.id);
    }
  };

  const openEditDialog = (client: Client) => {
    console.log('=== OPEN EDIT DIALOG CALLED ===');
    console.log('Opening edit dialog for client:', client);
    
    // Get the latest client data from the cache
    const latestClientData = queryClient.getQueryData(['/api/users?role=client', refreshTrigger]) as Client[];
    const latestClient = latestClientData?.find(c => c.id === client.id) || client;
    
    console.log('Using latest client data:', latestClient);
    console.log('Phone number being loaded into form:', latestClient.phone);
    setSelectedClient(latestClient);
    editForm.reset({
      email: latestClient.email,
      firstName: latestClient.firstName || "",
      lastName: latestClient.lastName || "",
      phone: latestClient.phone || "",
      address: latestClient.address || "",
      city: latestClient.city || "",
      state: latestClient.state || "",
      zipCode: latestClient.zipCode || "",
      notes: latestClient.notes || "",

      emailAccountManagement: latestClient.emailAccountManagement ?? true,
      emailAppointmentReminders: latestClient.emailAppointmentReminders ?? true,
      emailPromotions: latestClient.emailPromotions ?? false,
      smsAccountManagement: latestClient.smsAccountManagement ?? false,
      smsAppointmentReminders: latestClient.smsAppointmentReminders ?? true,
      smsPromotions: latestClient.smsPromotions ?? false,
    });
    setIsEditDialogOpen(true);
    console.log('Edit dialog should now be open');
  };

  const openDeleteDialog = (client: Client) => {
    setSelectedClient(client);
    setIsDeleteDialogOpen(true);
  };

  const handleViewClient = (client: Client) => {
    setClientDetail(client);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setClientDetail(null);
    // Clean up URL to remove client ID
    window.history.replaceState({}, '', '/clients');
  };



  // CSV Import handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File | null) => {
    if (file) {
      // Check if it's a CSV file by extension or MIME type
      const isCSV = file.name.toLowerCase().endsWith('.csv') || 
                   file.type === 'text/csv' || 
                   file.type === 'application/vnd.ms-excel' ||
                   file.type === 'text/plain' ||
                   file.type === 'application/csv';
      
      if (isCSV) {
        setImportFile(file);
        setImportResults(null);
        toast({
          title: "File selected",
          description: `${file.name} has been selected for import.`,
        });
      } else {
        toast({
          title: "Invalid file type",
          description: `File type "${file.type}" is not supported. Please select a CSV file.`,
          variant: "destructive",
        });
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      processSelectedFile(file);
    }
  };

  const handleImportCSV = async () => {
    if (!importFile) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    const Papa = (await import('papaparse')).default;
    
        // First try with headers
    Papa.parse(importFile as any, {
      header: true, // Parse with headers to detect column names
      skipEmptyLines: true,
      complete: (results) => {
        console.log('CSV parse results:', results);
        console.log('Total rows parsed:', results.data.length);
        console.log('CSV headers:', results.meta.fields);
        
        if (results.data.length === 0) {
          setIsImporting(false);
          toast({
            title: "No data found",
            description: "The CSV file appears to be empty.",
            variant: "destructive",
          });
          return;
        }
        
        // Log the first few rows to debug
        console.log('First 3 rows:', results.data.slice(0, 3));
        console.log('Raw CSV data sample:', results.data.slice(0, 3).map((row: any) => Object.keys(row)));
        console.log('Available fields in first row:', results.data.length > 0 ? Object.keys(results.data[0] as any) : []);
        console.log('Data structure analysis:');
        results.data.slice(0, 3).forEach((row: any, index: number) => {
          console.log(`Row ${index} type:`, typeof row, 'isArray:', Array.isArray(row), 'keys:', Object.keys(row));
        });
        
        // Transform the parsed data into client objects
        const validClients = results.data
          .map((row: any, index: number) => {
            // Handle different possible column names with more flexible matching
            // Based on the console logs, the actual headers are: ['Last name', 'First name', 'Email', 'Mobile phone']
            const firstName = String(row['First name'] || row['firstName'] || row['First Name'] || row['first_name'] || row['First'] || row['firstname'] || row['FirstName'] || '').trim();
            const lastName = String(row['Last name'] || row['lastName'] || row['Last Name'] || row['last_name'] || row['Last'] || row['lastname'] || row['LastName'] || '').trim();
            const email = String(row['Email'] || row['email'] || '').trim();
            const phone = String(row['Mobile phone'] || row['phone'] || row['Phone'] || row['phone'] || row['Phone Number'] || row['phonenumber'] || row['PhoneNumber'] || '').trim();
            
            console.log(`Row ${index + 1}: ${firstName} ${lastName}, ${email}, ${phone}`);
            
            return {
              firstName,
              lastName,
              email,
              phone
            };
          })
          .filter(client => {
            // Basic validation - require at least firstName OR lastName
            const hasName = client.firstName || client.lastName;
            const isValid = hasName;
            if (!isValid) {
              console.log(`Skipping invalid row: firstName="${client.firstName}", lastName="${client.lastName}", email="${client.email}"`);
            }
            return isValid;
          });
        
        // If no valid clients found, try alternative parsing
        if (validClients.length === 0 && results.data.length > 0) {
          console.log('No valid clients found with standard parsing, trying alternative method...');
          
          // Check if the headers look like data (not column names)
          const headers = results.meta.fields;
          const firstRow = results.data[0];
          
          console.log('Headers look like data:', headers);
          console.log('First row:', firstRow);
          
          // If headers look like data (not typical column names), treat them as data
          if (headers && headers.length >= 4 && 
              !headers.some((header: string) => 
                header.toLowerCase().includes('first') || 
                header.toLowerCase().includes('last') || 
                header.toLowerCase().includes('name') || 
                header.toLowerCase().includes('email') || 
                header.toLowerCase().includes('phone') ||
                header.toLowerCase().includes('mobile')
              )) {
            console.log('Headers appear to be data, treating as data rows...');
            
            // Include the header row as data and parse all rows
            const allRows = [headers, ...results.data];
            console.log('All rows to process:', allRows.length);
            console.log('Sample rows:', allRows.slice(0, 3));
            
            const alternativeClients = allRows
              .map((row: any, index: number) => {
                console.log(`Processing row ${index}:`, row);
                
                // Handle both array and object formats
                let firstName, lastName, email, phone;
                
                if (Array.isArray(row)) {
                  // Row is an array - based on the headers ['Last name', 'First name', 'Email', 'Mobile phone']
                  // The order should be: [lastName, firstName, email, phone]
                  lastName = String(row[0] || '').trim();
                  firstName = String(row[1] || '').trim();
                  email = String(row[2] || '').trim();
                  phone = String(row[3] || '').trim();
                } else if (typeof row === 'object' && row !== null) {
                  // Row is an object with field names as keys
                  const keys = Object.keys(row);
                  if (keys.length >= 4) {
                    // Try to map based on the actual headers: ['Last name', 'First name', 'Email', 'Mobile phone']
                    firstName = String(row['First name'] || row['firstName'] || row['First Name'] || '').trim();
                    lastName = String(row['Last name'] || row['lastName'] || row['Last Name'] || '').trim();
                    email = String(row['Email'] || row['email'] || '').trim();
                    phone = String(row['Mobile phone'] || row['phone'] || row['Phone'] || '').trim();
                  } else {
                    return null;
                  }
                } else {
                  return null;
                }
                
                console.log(`Row ${index} parsed:`, { firstName, lastName, email, phone });
                
                return {
                  firstName,
                  lastName,
                  email,
                  phone
                };
              })
              .filter((client): client is { firstName: string; lastName: string; email: string; phone: string } => 
                client !== null && Boolean(client.firstName || client.lastName));
            
            if (alternativeClients.length > 0) {
              console.log(`Found ${alternativeClients.length} clients with alternative parsing`);
              validClients.push(...alternativeClients);
            }
          } else {
            // Try parsing without headers if the first row looks like data
            const alternativeClients = results.data
              .map((row: any, index: number) => {
                // If the row has numeric keys, it might be parsed without headers
                const keys = Object.keys(row);
                if (keys.length >= 4 && keys.every((key: string) => !isNaN(Number(key)))) {
                  // This looks like data parsed without headers
                  // Based on the headers ['Last name', 'First name', 'Email', 'Mobile phone']
                  // The order should be: [lastName, firstName, email, phone]
                  const values = Object.values(row);
                  return {
                    firstName: String(values[1] || '').trim(),
                    lastName: String(values[0] || '').trim(),
                    email: String(values[2] || '').trim(),
                    phone: String(values[3] || '').trim()
                  };
                }
                return null;
              })
              .filter((client): client is { firstName: string; lastName: string; email: string; phone: string } => 
                client !== null && Boolean(client.firstName || client.lastName));
            
            if (alternativeClients.length > 0) {
              console.log(`Found ${alternativeClients.length} clients with alternative parsing`);
              validClients.push(...alternativeClients);
            }
          }
        }
        
        console.log(`Valid clients to import: ${validClients.length}`);
        console.log('Sample clients:', validClients.slice(0, 3));
        
        // Check if we have any valid clients to import
        if (validClients.length === 0) {
          setIsImporting(false);
          toast({
            title: "No valid data found",
            description: "No valid client data found in the CSV file. Please check the file format and try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Show progress for large imports
        if (validClients.length > 1000) {
          toast({
            title: "Large import detected",
            description: `Importing ${validClients.length} clients. This may take several minutes. Please be patient...`,
          });
        } else if (validClients.length > 100) {
          toast({
            title: "Large import detected",
            description: `Importing ${validClients.length} clients. This may take a few moments...`,
          });
        }
        
        // Import the clients
        console.log('Sending import request with', validClients.length, 'clients');
        console.log('Sample client data being sent:', validClients.slice(0, 3).map(client => ({
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phone: client.phone,
          phoneType: typeof client.phone,
          phoneLength: client.phone?.length
        })));
        importClientsMutation.mutate(validClients);
      },
      error: (error: any) => {
        console.error('CSV parse error:', error);
        // Try parsing without headers as fallback
        console.log('Trying fallback parsing without headers...');
        Papa.parse(importFile as any, {
          header: false, // Parse without headers
          skipEmptyLines: true,
          complete: (fallbackResults) => {
            console.log('Fallback parse results:', fallbackResults);
            
            if (fallbackResults.data.length === 0) {
              setIsImporting(false);
              toast({
                title: "CSV Parse Error",
                description: `Failed to parse CSV file: ${error.message}`,
                variant: "destructive",
              });
              return;
            }
            
            // Skip the first row if it looks like headers
            const dataRows = fallbackResults.data.slice(1);
            const validClients = dataRows
              .map((row: any, index: number) => {
                if (Array.isArray(row) && row.length >= 4) {
                  // Based on the headers ['Last name', 'First name', 'Email', 'Mobile phone']
                  // The order should be: [lastName, firstName, email, phone]
                  return {
                    firstName: String(row[1] || '').trim(),
                    lastName: String(row[0] || '').trim(),
                    email: String(row[2] || '').trim(),
                    phone: String(row[3] || '').trim()
                  };
                }
                return null;
              })
              .filter((client): client is { firstName: string; lastName: string; email: string; phone: string } => 
                client !== null && Boolean(client.firstName || client.lastName));
            
            if (validClients.length > 0) {
              console.log(`Found ${validClients.length} clients with fallback parsing`);
              importClientsMutation.mutate(validClients);
            } else {
              setIsImporting(false);
              toast({
                title: "CSV Parse Error",
                description: `Failed to parse CSV file: ${error.message}`,
                variant: "destructive",
              });
            }
          },
          error: (fallbackError) => {
            console.error('Fallback parse error:', fallbackError);
            setIsImporting(false);
            toast({
              title: "CSV Parse Error",
              description: `Failed to parse CSV file: ${error.message}`,
              variant: "destructive",
            });
          }
        });
      }
    });
  };

  const resetImportDialog = () => {
    setImportFile(null);
    setImportResults(null);
    setImportProgress(null);
    setIsImportDialogOpen(false);
  };

  const downloadSampleCSV = async () => {
    const sampleData = [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '(555) 123-4567'
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '(555) 987-6543'
      },
      {
        firstName: 'Mike',
        lastName: 'Johnson',
        email: '',
        phone: '(555) 111-2222'
      },
      {
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob.wilson@example.com',
        phone: ''
      },
      {
        firstName: 'Alice',
        lastName: '',
        email: '',
        phone: ''
      }
    ];

    const Papa = (await import('papaparse')).default;
    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'client_import_sample.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportClients = () => {
    if (!clients || clients.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no clients to export.",
        variant: "destructive",
      });
      return;
    }

    // Define CSV headers
    const headers = [
      'ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Username',
      'Address', 'City', 'State', 'ZIP Code', 'Join Date',
      'Email Account Management', 'Email Appointment Reminders', 'Email Promotions',
      'SMS Account Management', 'SMS Appointment Reminders', 'SMS Promotions'
    ];

    // Convert clients data to CSV format
    const csvData = (clients as any[]).map((client: any) => [
      client.id,
      client.firstName || '',
      client.lastName || '',
      client.email,
      client.phone || '',
      client.username,
      client.address || '',
      client.city || '',
      client.state || '',
      client.zipCode || '',
      client.createdAt ? new Date(client.createdAt).toLocaleDateString() : '',
      client.emailAccountManagement ? 'Yes' : 'No',
      client.emailAppointmentReminders ? 'Yes' : 'No',
      client.emailPromotions ? 'Yes' : 'No',
      client.smsAccountManagement ? 'Yes' : 'No',
      client.smsAppointmentReminders ? 'Yes' : 'No',
      client.smsPromotions ? 'Yes' : 'No'
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...csvData.map((row: any) => row.map((field: any) => `"${field}"`).join(','))
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export successful",
      description: `Exported ${clients.length} clients to CSV file.`,
    });
  };

  // Enhanced filtering logic (client-side filter on search results)
  const filteredClients = clients?.filter((client: Client) => {
    // Basic search filter
    const q = searchQuery.toLowerCase();
    // Guard against missing username/email to avoid runtime errors
    const usernameLc = (client.username || "").toLowerCase();
    const emailLc = (client.email || "").toLowerCase();
    const matchesSearch = !q ||
      usernameLc.includes(q) ||
      emailLc.includes(q) ||
      (client.firstName && client.firstName.toLowerCase().includes(q)) ||
      (client.lastName && client.lastName.toLowerCase().includes(q)) ||
      (client.phone && client.phone.includes(searchQuery));

    if (!matchesSearch) return false;

    // Apply additional filters if they're set
    if (filters.status !== 'all') {
      // This would need to be implemented with actual client status logic
      // For now, we'll just pass through
    }

    if (filters.communicationPreferences.length > 0) {
      // This would need to be implemented with actual communication preferences logic
      // For now, we'll just pass through
    }

    return true;
  });

  // Debug logging for client list
  console.log('Client list debug:', {
    totalClients: clients?.length || 0,
    searchQuery,
    filteredClientsCount: filteredClients?.length || 0,
    recentClients: clients?.slice(-3).map((c: Client) => ({ firstName: c.firstName, lastName: c.lastName, email: c.email })),
    isLoading,
    hasData: !!clients,
    searchQueryLength: searchQuery.length
  });

  // Debug: Check for imported clients specifically
  if (searchQuery && searchQuery.length > 0) {
    const searchLower = searchQuery.toLowerCase();
    const matchingClients = clients?.filter((client: Client) => {
      return (
        (client.firstName && client.firstName.toLowerCase().includes(searchLower)) ||
        (client.lastName && client.lastName.toLowerCase().includes(searchLower)) ||
        (client.email && client.email.toLowerCase().includes(searchLower)) ||
        (client.username && client.username.toLowerCase().includes(searchLower))
      );
    });
    
    // Also try splitting the search query to check individual words
    const searchWords = searchQuery.toLowerCase().split(' ').filter(word => word.length > 0);
    const wordMatchingClients = clients?.filter((client: Client) => {
      return searchWords.some(word => 
        (client.firstName && client.firstName.toLowerCase().includes(word)) ||
        (client.lastName && client.lastName.toLowerCase().includes(word)) ||
        (client.email && client.email.toLowerCase().includes(word)) ||
        (client.username && client.username.toLowerCase().includes(word))
      );
    });
    
    console.log('Search debug:', {
      searchQuery,
      searchWords,
      matchingClients: matchingClients?.length || 0,
      wordMatchingClients: wordMatchingClients?.length || 0,
      sampleMatches: matchingClients?.slice(0, 3).map((c: Client) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        username: c.username
      }))
    });
  }

  // Additional debug for filtered clients
  if (filteredClients && filteredClients.length > 0) {
    console.log('Filtered clients sample:', filteredClients.slice(0, 3).map((c: Client) => ({ 
      firstName: c.firstName, 
      lastName: c.lastName, 
      email: c.email 
    })));
  }

  // Debug: Show recent clients to see if imported ones are there
  if (clients && clients.length > 0) {
    const recentClients = clients.slice(-5); // Last 5 clients
    console.log('Recent clients (last 5):', recentClients.map((c: Client) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      phoneType: typeof c.phone,
      phoneLength: c.phone?.length,
      username: c.username,
      createdAt: c.createdAt
    })));
    
    // Also check for any clients with "Davis" in the name
    const davisClients = clients.filter((c: Client) => 
      (c.firstName && c.firstName.toLowerCase().includes('davis')) ||
      (c.lastName && c.lastName.toLowerCase().includes('davis'))
    );
    console.log('Davis clients found:', davisClients.length);
    if (davisClients.length > 0) {
      console.log('Sample Davis clients:', davisClients.slice(0, 3).map((c: Client) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        phoneType: typeof c.phone,
        phoneLength: c.phone?.length
      })));
      
      // Check if any Davis clients have phone numbers
      const davisClientsWithPhones = davisClients.filter((c: Client) => c.phone && c.phone.trim() !== '');
      console.log('Davis clients with phones:', davisClientsWithPhones.length);
      if (davisClientsWithPhones.length > 0) {
        console.log('Sample Davis clients with phones:', davisClientsWithPhones.slice(0, 3).map((c: Client) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          phoneType: typeof c.phone,
          phoneLength: c.phone?.length
        })));
      }
    }
  }

  // Extract client ID from URL if navigating from appointment details
  const urlClientId = location.includes('/clients/') ? 
    parseInt(location.split('/clients/')[1]?.split('?')[0]) : null;
  console.log('DEBUG: location:', location, 'urlClientId:', urlClientId);

  // Fetch client details if client ID is in URL
  const { data: urlClientData } = useQuery({
    queryKey: ['/api/users', urlClientId],
    queryFn: async () => {
      if (!urlClientId) return null;
      const response = await apiRequest("GET", `/api/users/${urlClientId}`);
      if (!response.ok) {
        throw new Error('Client not found');
      }
      return response.json();
    },
    enabled: !!urlClientId,
  });

  // Set client detail when URL client data is available
  useEffect(() => {
    if (urlClientData && urlClientId) {
      setClientDetail(urlClientData);
      setViewMode('detail');
    }
  }, [urlClientData, urlClientId]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300">
        
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 md:p-6">
          <div className="max-w-7xl mx-auto px-2 sm:px-0">
            {viewMode === 'list' ? (
              <>
                {/* Mobile-Optimized Page Header */}
                <div className="space-y-4 mb-6">
                  {/* Title Section */}
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Manage your salon clients
                    </p>
                  </div>
                  
                  {/* Enhanced Search & Filters */}
                  <ClientSearchFilters
                    searchQuery={searchQuery}
                    onSearchChange={(v: string) => { 
                      setSearchQuery(v);
                      // Don't reset showAllClients on search - let user control it
                    }}
                    filters={filters}
                    onFiltersChange={setFilters}
                    onClearFilters={() => setFilters({
                      status: 'all',
                      communicationPreferences: [],
                      appointmentStatus: 'all',
                      spendingRange: 'all',
                      lastVisit: 'all',
                    })}
                  />
                  
                  {/* Action Buttons - Mobile First Design */}
                  <div className="space-y-3">
                    {/* Primary action - full width on mobile */}
                    <Button 
                      onClick={() => setIsAddDialogOpen(true)}
                      className="w-full h-12 sm:h-10 text-base sm:text-sm font-medium sm:w-auto"
                      size="default"
                    >
                      <PlusCircle className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                      Add New Client
                    </Button>
                    
                    {/* Secondary actions - side by side on mobile */}
                    <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-2 sm:justify-start">
                      <Button
                        variant="default"
                        onClick={async () => { 
                          setViewMode('list'); 
                          setClientDetail(null); 
                          setShowAllClients(true);
                          setSearchQuery("");
                          // ensure all-clients query runs and table refreshes
                          await queryClient.invalidateQueries({ queryKey: ['/api/users?role=client'] });
                          await queryClient.refetchQueries({ queryKey: ['/api/users?role=client'] });
                        }}
                        className="h-12 sm:h-10 text-base sm:text-sm sm:w-auto"
                        size="default"
                        type="button"
                        title="Show all clients"
                      >
                        <Users className="h-5 w-5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        <span>View All</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleExportClients}
                        className="h-12 sm:h-10 text-base sm:text-sm sm:w-auto"
                        size="default"
                      >
                        <Download className="h-5 w-5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        <span className="hidden xs:inline">Export</span>
                        <span className="xs:hidden">Export</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsImportDialogOpen(true)}
                        className="h-12 sm:h-10 text-base sm:text-sm sm:w-auto"
                        size="default"
                      >
                        <Upload className="h-5 w-5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        <span className="hidden xs:inline">Import</span>
                        <span className="xs:hidden">Import</span>
                      </Button>

                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Client Detail Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      onClick={handleBackToList}
                      className="flex items-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Clients
                    </Button>
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {getFullName(clientDetail?.firstName, clientDetail?.lastName, clientDetail?.username) || 'Client Profile'}
                      </h1>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Client Profile & Payment Methods
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => clientDetail && openEditDialog(clientDetail)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Client
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        // Navigate to forms page with client context
                        window.location.href = '/forms';
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Send Form
                    </Button>
                  </div>
                </div>
              </>
            )}
            
            {viewMode === 'list' ? (
              <Card>
              <CardHeader className="px-4 sm:px-6 py-4">
                <CardTitle className="text-lg sm:text-xl">All Clients</CardTitle>
                <CardDescription>
                  View and manage all your salon clients
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {isLoadingCombined ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : (!shouldSearch && !showAllClients) ? (
                  showAllClients ? (
                    <></>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {(() => {
                        console.log('Rendering initial state (no search)');
                        return null;
                      })()}
                      Type at least 2 characters to search clients.
                    </div>
                  )
                ) : filteredClients?.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {(() => {
                      console.log('Rendering empty search results state');
                      return null;
                    })()}
                    No clients found. Try a different search term.
                  </div>
                ) : (
                  <>
                    {/* Debug info */}
                    {(() => {
                      console.log('Rendering client list:', {
                        isLoading,
                        filteredClientsLength: filteredClients?.length,
                        searchQuery,
                        hasClients: !!filteredClients
                      });
                      return null;
                    })()}
                    
                    {/* Mobile Card Layout - Hidden on Desktop */}
                    <div className="block sm:hidden space-y-3" key={`mobile-${searchQuery}`}>
                      {filteredClients?.map((client: Client) => (
                        <Card key={client.id} className="p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-base text-gray-900 dark:text-gray-100 truncate">
                                  {getFullName(client.firstName, client.lastName, (client as any).username)}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  <PermissionGuard permission="view_client_contact_info" fallback={<span className="italic text-gray-400">Hidden</span>}>
                                    {client.email}
                                  </PermissionGuard>
                                </div>
                                {client.phone && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    <PermissionGuard permission="view_client_contact_info" fallback={<span className="italic text-gray-400">Hidden</span>}>
                                      {client.phone}
                                    </PermissionGuard>
                                  </div>
                                )}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="default"
                                  className="h-10 w-10 p-0 flex-shrink-0 ml-2"
                                >
                                  <MoreHorizontal className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => handleViewClient(client)} className="py-3">
                                  <CreditCard className="h-4 w-4 mr-3" /> 
                                  <span>View Details & Cards</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewClient(client)} className="py-3">
                                  <Calendar className="h-4 w-4 mr-3" /> 
                                  <span>Appointments</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(client)} className="py-3">
                                  <Edit className="h-4 w-4 mr-3" /> 
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => openDeleteDialog(client)}
                                  className="text-red-600 focus:text-red-600 py-3"
                                >
                                  <Trash2 className="h-4 w-4 mr-3" /> 
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop Table Layout - Hidden on Mobile */}
                    <div className="hidden sm:block" key={`desktop-${searchQuery}`}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClients?.map((client: Client) => (
                            <TableRow key={client.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {getFullName(client.firstName, client.lastName, (client as any).username)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <PermissionGuard permission="view_client_contact_info" fallback="-">
                                  {client.email}
                                </PermissionGuard>
                              </TableCell>
                              <TableCell>
                                <PermissionGuard permission="view_client_contact_info" fallback="-">
                                  {client.phone || "-"}
                                </PermissionGuard>
                                {/* Debug: {JSON.stringify({phone: client.phone, type: typeof client.phone})} */}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="default"
                                      className="min-h-[44px] min-w-[44px] p-2"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleViewClient(client)}>
                                      <CreditCard className="h-4 w-4 mr-2" /> View Details & Cards
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleViewClient(client)}>
                                      <Calendar className="h-4 w-4 mr-2" /> Appointments
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(client)}>
                                      <Edit className="h-4 w-4 mr-2" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => openDeleteDialog(client)}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Show All Clients Button - only show when limited */}
                    {!shouldSearch && !showAllClients && allClientsData?.length === 50 && (
                      <div className="mt-6 text-center py-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          Showing 50 clients for faster loading
                        </p>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowAllClients(true)}
                          className="flex items-center gap-2 mx-auto"
                        >
                          <Users className="h-4 w-4" />
                          Load All Clients
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            ) : (
              // Client Detail View with Payment Methods
              <div className="space-y-6">
                {/* Back Button */}
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    onClick={handleBackToList}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Clients
                  </Button>
                </div>
                {/* Client Information Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <div>
                        <h3 className="text-xl font-semibold">
                          {getFullName(clientDetail?.firstName, clientDetail?.lastName, clientDetail?.username) || 'Client'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Client since {new Date(clientDetail?.createdAt || Date.now()).toLocaleDateString()}
                        </p>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Contact Information */}
                      <div>
                        <h4 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Contact Information</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Email:</span>
                            <span className="ml-2">
                              <PermissionGuard permission="view_client_contact_info" fallback={<span className="italic text-gray-400">Hidden</span>}>
                                {clientDetail?.email}
                              </PermissionGuard>
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Phone:</span>
                            <span className="ml-2">
                              <PermissionGuard permission="view_client_contact_info" fallback={<span className="italic text-gray-400">Hidden</span>}>
                                {clientDetail?.phone || "Not provided"}
                              </PermissionGuard>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Address Information */}
                      <div>
                        <h4 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Address</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Street:</span>
                            <span className="ml-2">{clientDetail?.address || "Not provided"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">City:</span>
                            <span className="ml-2">{clientDetail?.city || "Not provided"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">State:</span>
                            <span className="ml-2">{clientDetail?.state || "Not provided"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">ZIP Code:</span>
                            <span className="ml-2">{clientDetail?.zipCode || "Not provided"}</span>
                          </div>
                          {clientDetail?.notes && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Notes:</span>
                              <div className="ml-2 mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                                {clientDetail.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Communication Preferences */}
                      <div>
                        <h4 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Communication Preferences</h4>
                        <div className="space-y-3 text-sm">
                          <div>
                            <h5 className="font-medium text-xs text-gray-700 dark:text-gray-300 mb-2">Email Notifications</h5>
                            <div className="space-y-1 pl-2">
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Account Management:</span>
                                <span className={`ml-2 ${clientDetail?.emailAccountManagement ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.emailAccountManagement ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Appointment Reminders:</span>
                                <span className={`ml-2 ${clientDetail?.emailAppointmentReminders ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.emailAppointmentReminders ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Promotions:</span>
                                <span className={`ml-2 ${clientDetail?.emailPromotions ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.emailPromotions ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-xs text-gray-700 dark:text-gray-300 mb-2">SMS Notifications</h5>
                            <div className="space-y-1 pl-2">
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Account Management:</span>
                                <span className={`ml-2 ${clientDetail?.smsAccountManagement ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.smsAccountManagement ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Appointment Reminders:</span>
                                <span className={`ml-2 ${clientDetail?.smsAppointmentReminders ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.smsAppointmentReminders ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-gray-500 dark:text-gray-400">Promotions:</span>
                                <span className={`ml-2 ${clientDetail?.smsPromotions ? 'text-green-600' : 'text-red-600'}`}>
                                  {clientDetail?.smsPromotions ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Client Memberships */}
                {clientDetail && (
                  <ClientMemberships 
                    clientId={clientDetail.id} 
                    clientName={getFullName(clientDetail.firstName, clientDetail.lastName, clientDetail.username) || 'Client'}
                  />
                )}

                {/* Client Communication */}
                {clientDetail && (
                  <ClientCommunication 
                    clientId={clientDetail.id}
                    clientName={getFullName(clientDetail.firstName, clientDetail.lastName, clientDetail.username) || 'Client'}
                    clientEmail={clientDetail.email}
                    clientPhone={clientDetail.phone}
                  />
                )}

                {/* Payment Methods */}
                {clientDetail && (
                  <ClientPaymentMethods 
                    clientId={clientDetail.id} 
                    clientName={getFullName(clientDetail.firstName, clientDetail.lastName, clientDetail.username) || 'Client'}
                  />
                )}

                {/* Appointment History */}
                {clientDetail && (
                  <div className="mt-4">
                    <ClientAppointmentHistory clientId={clientDetail.id} />
                  </div>
                )}

                {/* Form Submissions */}
                {clientDetail && (
                  <ClientFormSubmissions 
                    clientId={clientDetail.id} 
                    clientName={getFullName(clientDetail.firstName, clientDetail.lastName, clientDetail.username) || clientDetail.username}
                  />
                )}

                {/* Client Photos */}
                {clientDetail && (
                  <ClientPhotoGallery 
                    clientId={clientDetail.id}
                    clientName={getFullName(clientDetail.firstName, clientDetail.lastName, clientDetail.username) || 'Client'}
                    refreshKey={clientPhotosRefreshKey}
                  />
                )}

                {/* Actions: Add Note / Add Photo */}
                {clientDetail && (
                  <div className="flex items-center gap-2 mt-4">
                    <Button variant="outline" onClick={() => setAddNoteDialogOpen(true)}>
                      <FileText className="h-4 w-4 mr-2" /> Add Note
                    </Button>
                    <Button variant="outline" onClick={() => setAddPhotoDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" /> Add Photo
                    </Button>
                  </div>
                )}

                {/* Notes History */}
                {clientDetail && (
                  <ClientNoteHistory 
                    clientId={clientDetail.id} 
                    clientName={`${clientDetail.firstName || ''} ${clientDetail.lastName || ''}`.trim() || 'Client'}
                  />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
      
      {/* Add Client Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client by filling out the form below.
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAddClient)} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={addForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <input
                          type="text" 
                          placeholder="Enter email address" 
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                          style={{
                            borderColor: 'hsl(var(--border))',
                            boxShadow: 'none'
                          }}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={addForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(123) 456-7890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Address Section */}
              <div className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main Street" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={addForm.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="New York" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={addForm.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="NY" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={addForm.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="10001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              {/* Notes Section */}
              <div className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <NoteInput
                          value={field.value || ""}
                          onChange={field.onChange}
                          placeholder="Add notes about this client..."
                          category="client"
                          showTemplateSelector={true}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              

              
              {/* Communication Preferences Section */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Communication Preferences</h4>
                
                <div className="space-y-3">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Email Notifications</div>
                  <div className="grid grid-cols-1 gap-3 pl-4">
                    <FormField
                      control={addForm.control}
                      name="emailAccountManagement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Account Management
                            </FormLabel>
                            <FormDescription className="text-xs">Receipts, billing updates, booking confirmations, account changes</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="emailAppointmentReminders"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Appointment Reminders
                            </FormLabel>
                            <FormDescription className="text-xs">Booking confirmations and reminder notifications for appointments</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="emailPromotions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Promotions & Marketing
                            </FormLabel>
                            <FormDescription className="text-xs">Special offers, new services, and promotional content</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">SMS Notifications</div>
                  <div className="grid grid-cols-1 gap-3 pl-4">
                    <FormField
                      control={addForm.control}
                      name="smsAccountManagement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Account Management
                            </FormLabel>
                            <FormDescription className="text-xs">Receipts, billing updates, booking confirmations, account changes</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="smsAppointmentReminders"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Appointment Reminders
                            </FormLabel>
                            <FormDescription className="text-xs">Booking confirmations and reminder notifications for appointments</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="smsPromotions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none flex-1">
                            <FormLabel className="text-sm cursor-pointer" onClick={() => field.onChange(!field.value)}>
                              Promotions & Marketing
                            </FormLabel>
                            <FormDescription className="text-xs">Special offers and promotional texts</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              

              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createClientMutation.isPending}>
                  {createClientMutation.isPending ? "Creating..." : "Create Client"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={addNoteDialogOpen} onOpenChange={setAddNoteDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Create a note on this client profile.</DialogDescription>
          </DialogHeader>
          {clientDetail && (
            <ClientAddNote
              clientId={clientDetail.id}
              onCreated={async () => {
                setAddNoteDialogOpen(false);
                try {
                  await queryClient.invalidateQueries({ queryKey: [`/api/note-history/client/${clientDetail.id}`] });
                } catch {}
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Photo Dialog */}
      <Dialog open={addPhotoDialogOpen} onOpenChange={setAddPhotoDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Photo</DialogTitle>
            <DialogDescription>Attach a photo to one of the client's appointments.</DialogDescription>
          </DialogHeader>
          {clientDetail && (
            <ClientAddPhoto
              clientId={clientDetail.id}
              onUploaded={async () => {
                setAddPhotoDialogOpen(false);
                try {
                  await queryClient.invalidateQueries({ queryKey: ["/api/appointments/client", clientDetail.id] });
                  await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
                } catch {}
                setClientPhotosRefreshKey((v) => v + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Edit Client Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update the client's information below.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditClient)} className="space-y-4 pb-4">
              {/* Debug form submission */}
              <div className="hidden">
                <button 
                  type="button" 
                  onClick={() => {
                    console.log('=== MANUAL FORM SUBMISSION TEST ===');
                    const values = editForm.getValues();
                    console.log('Form values before submission:', values);
                    handleEditClient(values);
                  }}
                >
                  Manual Submit Test
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(555) 123-4567" 
                          {...field}
                          onChange={(e) => {
                            console.log('Phone field changed:', e.target.value);
                            field.onChange(e);
                          }}
                          onBlur={() => {
                            console.log('Phone field blur, current value:', field.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={editForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={editForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="State" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zip Code</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <NoteInput
                          value={field.value || ""}
                          onChange={field.onChange}
                          placeholder="Add notes about this client..."
                          category="client"
                          showTemplateSelector={true}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>



              {/* Communication Preferences Section */}
              <div className="space-y-4 border-t pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Communication Preferences</h4>
                
                <div className="space-y-3">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Email Notifications</div>
                  <div className="grid grid-cols-1 gap-3 pl-4">
                    <FormField
                      control={editForm.control}
                      name="emailAccountManagement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Account Management</FormLabel>
                            <FormDescription className="text-xs">Receipts, billing updates, booking confirmations, account changes</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="emailAppointmentReminders"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Appointment Reminders</FormLabel>
                            <FormDescription className="text-xs">Booking confirmations and reminder notifications for appointments</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="emailPromotions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Promotions & Marketing</FormLabel>
                            <FormDescription className="text-xs">Special offers, new services, and promotional content</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">SMS Notifications</div>
                  <div className="grid grid-cols-1 gap-3 pl-4">
                    <FormField
                      control={editForm.control}
                      name="smsAccountManagement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Account Management</FormLabel>
                            <FormDescription className="text-xs">Receipts, billing updates, booking confirmations, account changes</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="smsAppointmentReminders"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Appointment Reminders</FormLabel>
                            <FormDescription className="text-xs">Booking confirmations and reminder notifications for appointments</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="smsPromotions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Promotions & Marketing</FormLabel>
                            <FormDescription className="text-xs">Special offers and promotional texts</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateClientMutation.isPending}>
                  {updateClientMutation.isPending ? "Updating..." : "Update Client"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    console.log('=== MANUAL SUBMIT TEST ===');
                    const values = editForm.getValues();
                    console.log('Form values:', values);
                    console.log('Form is valid:', editForm.formState.isValid);
                    console.log('Form errors:', editForm.formState.errors);
                    handleEditClient(values);
                  }}
                >
                  Test Submit
                </Button>
                {selectedClient && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSaveCardEdit(true)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Add Card
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {showSaveCardEdit && selectedClient && (
        <SaveCardModal
          open={showSaveCardEdit}
          onOpenChange={(open) => setShowSaveCardEdit(open)}
          clientId={selectedClient.id}
          customerEmail={selectedClient.email}
          customerName={`${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim() || selectedClient.username}
          onSaved={() => {
            setShowSaveCardEdit(false);
            try { queryClient.invalidateQueries({ queryKey: ['/api/saved-payment-methods'] }); } catch {}
            toast({ title: 'Card Saved', description: 'Payment method added to profile.' });
          }}
        />
      )}

      {/* Delete Client Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client{' '}
              <span className="font-semibold">
                {selectedClient && getFullName(selectedClient.firstName, selectedClient.lastName, (selectedClient as any).username)}
              </span>{' '}
              and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteClient} 
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteClientMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import Clients from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import multiple clients at once. Download the sample file to see the format. 
              <br />
              <span className="text-green-600 font-medium">✓ Required columns: First Name, Last Name (Email and Phone are optional)</span>
              <br />
              <span className="text-blue-600 font-medium">📋 Supported column names: firstName/First Name/first_name, lastName/Last Name/last_name, email/Email, phone/Phone/Phone Number</span>
              <br />
              <span className="text-green-600 font-medium">✓ Large imports supported: Up to 25,000 clients per import</span>
              <br />
              <span className="text-blue-600 font-medium">💡 Duplicate emails/phones will be modified to avoid conflicts. Search by first name or "test.user" to find imported clients.</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Sample CSV Download */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-blue-900">Sample CSV Template</h4>
                  <p className="text-sm text-blue-700 mt-1">Download to see the required format and column headers</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadSampleCSV}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Sample
                </Button>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select CSV File</label>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => {
                  const input = createFileInput();
                  document.body.appendChild(input);
                  input.click();
                  setTimeout(() => {
                    if (document.body.contains(input)) {
                      document.body.removeChild(input);
                    }
                  }, 1000);
                }}
              >
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-gray-400" />
                  {importFile ? (
                    <div>
                      <p className="text-sm font-medium text-green-600">{importFile.name}</p>
                      <p className="text-xs text-gray-500">File selected successfully</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">Click to select CSV file</p>
                      <p className="text-xs text-gray-500">Or drag and drop your file here</p>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = createFileInput();
                      document.body.appendChild(input);
                      input.click();
                      setTimeout(() => {
                        if (document.body.contains(input)) {
                          document.body.removeChild(input);
                        }
                      }, 1000);
                    }}
                    className="mt-2"
                  >
                    {importFile ? 'Change File' : 'Choose File'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Import Progress */}
            {importProgress && isImporting && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Import Progress</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing clients...</span>
                    <span className="font-medium">{importProgress.current} / {importProgress.total}</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min((importProgress.current / importProgress.total) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-blue-700">
                    {importProgress.total > 1000 
                      ? "Large import in progress. This may take several minutes..."
                      : "Import in progress..."}
                  </p>
                </div>
              </div>
            )}

            {/* Import Results */}
            {importResults && (
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h4 className="font-medium mb-2">Import Results</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Successfully imported:</span>
                    <span className="font-medium text-green-600">{importResults.imported} clients</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Skipped (duplicates/errors):</span>
                    <span className="font-medium text-orange-600">{importResults.skipped} clients</span>
                  </div>
                  {importResults.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="font-medium text-red-600 mb-1">Errors:</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {importResults.errors.map((error, index) => (
                          <p key={index} className="text-xs text-red-600">{error}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={resetImportDialog}>
              {importResults ? 'Close' : 'Cancel'}
            </Button>
            {!importResults && (
              <Button 
                onClick={handleImportCSV} 
                disabled={!importFile || isImporting}
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Clients
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsPage;

// Payment methods management for a specific client (save/list/set default/delete)
function ClientPaymentMethods({ clientId, clientName }: { clientId: number; clientName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSaveCard, setShowSaveCard] = useState(false);

  // Fetch saved payment methods for the client
  const { data: savedPaymentMethods, isLoading: isLoadingCards } = useQuery({
    queryKey: ['/api/saved-payment-methods', clientId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/saved-payment-methods?clientId=${clientId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  // Listen for helcimCardSaved event to refresh the list
  useEffect(() => {
    const handleCardSaved = (event: CustomEvent) => {
      console.log('[ClientPaymentMethods] Received helcimCardSaved event:', event.detail);
      // Refresh the cards list
      queryClient.invalidateQueries({ queryKey: ['/api/saved-payment-methods', clientId] });
      toast({ 
        title: 'Card saved successfully', 
        description: 'Payment method has been added to the profile.' 
      });
    };

    window.addEventListener('helcimCardSaved', handleCardSaved as any);
    
    return () => {
      window.removeEventListener('helcimCardSaved', handleCardSaved as any);
    };
  }, [clientId, queryClient, toast]);

  // Fetch client details for email/name to pass into SaveCardModal
  const { data: clientData } = useQuery({
    queryKey: ['/api/users', clientId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/users/${clientId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientId,
  });

  const refetchCards = () => queryClient.invalidateQueries({ queryKey: ['/api/saved-payment-methods'] });

  const handleSetDefault = async (paymentMethodId: number) => {
    try {
      const res = await apiRequest('PUT', `/api/saved-payment-methods/${paymentMethodId}/default`, {});
      if (!res.ok) throw new Error('Failed to set default card');
      await refetchCards();
      toast({ title: 'Default updated', description: 'Card set as default.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update default card', variant: 'destructive' });
    }
  };

  const handleDelete = async (paymentMethodId: number) => {
    try {
      const res = await apiRequest('DELETE', `/api/saved-payment-methods/${paymentMethodId}`);
      if (!res.ok) throw new Error('Failed to delete card');
      await refetchCards();
      toast({ title: 'Removed', description: 'Card removed from profile.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to remove card', variant: 'destructive' });
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payment Methods</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowSaveCard(true)}>
          <CreditCard className="h-4 w-4 mr-2" />
          Add Card
        </Button>
      </CardHeader>
      <CardContent>
        {isLoadingCards ? (
          <div className="flex items-center justify-center py-4 text-sm text-gray-600">
            Loading saved cards...
          </div>
        ) : savedPaymentMethods && savedPaymentMethods.length > 0 ? (
          <div className="space-y-2">
            {savedPaymentMethods.map((pm: any) => (
              <div key={pm.id} className="flex items-center justify-between border rounded-md p-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4" />
                  <div className="text-sm">
                    <div className="font-medium">
                      {pm.cardBrand} •••• {pm.cardLast4}
                      {pm.isDefault && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Default</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Exp: {pm.cardExpMonth}/{pm.cardExpYear}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!pm.isDefault && (
                    <Button variant="outline" size="sm" onClick={() => handleSetDefault(pm.id)}>Make Default</Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleDelete(pm.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            No saved cards yet. Click "Add Card" to securely save a card for {clientName}.
          </div>
        )}
      </CardContent>

      {showSaveCard && clientData && (
        <SaveCardModal
          open={showSaveCard}
          onOpenChange={(open) => {
            setShowSaveCard(open);
            if (!open) {
              // Ensure iframe is cleaned up and refresh list
              refetchCards();
            }
          }}
          clientId={clientId}
          customerEmail={clientData.email}
          customerName={`${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || clientName}
          onSaved={() => {
            setShowSaveCard(false);
            refetchCards();
            toast({ title: 'Card saved', description: 'Payment method added to profile.' });
          }}
        />
      )}
    </Card>
  );
}
