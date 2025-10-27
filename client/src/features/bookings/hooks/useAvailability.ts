import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { addDays } from "date-fns";

interface AvailabilityParams {
  staffId?: string;
  serviceId?: string;
  locationId?: string;
  date?: Date;
}

export const useAvailability = ({ staffId, serviceId, locationId, date }: AvailabilityParams) => {
  const endDate = date ? addDays(date, 7) : undefined;

  const enabled = Boolean(staffId && serviceId && locationId && date);

  const { data: availableSlots, isLoading } = useQuery({
    queryKey: ["availability", staffId, serviceId, locationId, date?.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        staffId: staffId!,
        serviceId: serviceId!,
        locationId: locationId!,
        startDate: date!.toISOString(),
        endDate: endDate!.toISOString(),
      });

      return apiRequest(`/api/appointments/availability?${params.toString()}`);
    },
    enabled,
  });

  return {
    availableSlots: enabled ? availableSlots : [],
    isLoading: enabled && isLoading,
  };
};
