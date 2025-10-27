import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const useAppointmentDetails = (appointmentId: number | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: appointment,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => apiRequest(`/api/appointments/${appointmentId}`),
    enabled: !!appointmentId,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/appointments/${appointmentId}/cancel`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      toast({
        title: "Appointment cancelled",
        description: "The appointment has been cancelled successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to cancel appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/appointments/${appointmentId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      toast({
        title: "Appointment updated",
        description: "The appointment has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    appointment,
    isLoading,
    error,
    cancelAppointment: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
    updateAppointment: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
};
