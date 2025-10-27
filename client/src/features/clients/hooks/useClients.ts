import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ClientFilters, ClientFormValues } from '../types';
import type {
  GetClientsResponse,
  CreateClientResponse,
  UpdateClientResponse,
  ClientSearchParams,
} from '../types/api';

export function useClients(filters: ClientFilters) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<GetClientsResponse>({
    queryKey: ['clients', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.perPage) params.set('perPage', String(filters.perPage));

      return apiRequest(`/api/clients?${params.toString()}`);
    },
  });

  const createMutation = useMutation<CreateClientResponse, Error, ClientFormValues>({
    mutationFn: (data) => apiRequest('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: 'Client Created',
        description: 'The client has been created successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create client',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation<UpdateClientResponse, Error, { id: number; data: Partial<ClientFormValues> }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: 'Client Updated',
        description: 'The client has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (id) => apiRequest(`/api/clients/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: 'Client Deleted',
        description: 'The client has been deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete client',
        variant: 'destructive',
      });
    },
  });

  return {
    clients: query.data?.data,
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    createClient: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateClient: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteClient: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
