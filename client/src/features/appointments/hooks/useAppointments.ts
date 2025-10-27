import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { AppointmentFilters, AppointmentFormValues } from '../types';
import type { GetAppointmentsResponse, CreateAppointmentResponse, UpdateAppointmentResponse } from '../types/api';

export function useAppointments(filters: AppointmentFilters) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<GetAppointmentsResponse>({
    queryKey: ['appointments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate.toISOString());
      if (filters.endDate) params.set('endDate', filters.endDate.toISOString());
      if (filters.staffId) params.set('staffId', String(filters.staffId));
      if (filters.clientId) params.set('clientId', String(filters.clientId));
      if (filters.serviceId) params.set('serviceId', String(filters.serviceId));
      if (filters.locationId) params.set('locationId', String(filters.locationId));
      if (filters.status?.length) params.set('status', filters.status.join(','));

      return apiRequest(`/api/appointments?${params.toString()}`);
    },
  });

  const createMutation = useMutation<CreateAppointmentResponse, Error, AppointmentFormValues>({
    mutationFn: (data) => apiRequest('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'Appointment Created',
        description: 'The appointment has been created successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create appointment',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation<UpdateAppointmentResponse, Error, { id: number; data: Partial<AppointmentFormValues> }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'Appointment Updated',
        description: 'The appointment has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update appointment',
        variant: 'destructive',
      });
    },
  });

  const cancelMutation = useMutation<void, Error, number>({
    mutationFn: (id) => apiRequest(`/api/appointments/${id}/cancel`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'Appointment Cancelled',
        description: 'The appointment has been cancelled successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel appointment',
        variant: 'destructive',
      });
    },
  });

  return {
    appointments: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
    createAppointment: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateAppointment: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    cancelAppointment: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
  };
}
