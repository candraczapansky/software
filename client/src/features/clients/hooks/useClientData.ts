import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, ClientFilters, ClientFormValues, ClientSearchResult } from "../types";

export const useClientData = (filters: ClientFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: searchResult,
    isLoading,
    error,
  } = useQuery<ClientSearchResult>({
    queryKey: ["clients", filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(filters.search && { search: filters.search }),
        ...(filters.sortBy && { sortBy: filters.sortBy }),
        ...(filters.sortOrder && { sortOrder: filters.sortOrder }),
        page: (filters.page || 1).toString(),
        perPage: (filters.perPage || 10).toString(),
      });

      return apiRequest(`/api/clients?${params.toString()}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormValues) => {
      return apiRequest("/api/clients", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({
        title: "Client created",
        description: "The client has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create client. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ClientFormValues> }) => {
      return apiRequest(`/api/clients/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({
        title: "Client updated",
        description: "The client has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update client. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/clients/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({
        title: "Client deleted",
        description: "The client has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete client. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    clients: searchResult?.clients || [],
    total: searchResult?.total || 0,
    isLoading,
    error,
    createClient: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateClient: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteClient: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
};
