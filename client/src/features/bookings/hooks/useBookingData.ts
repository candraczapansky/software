import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Service, Category, Staff } from "../types";

export const useBookingData = (locationId?: string) => {
  const { data: services, isLoading: isLoadingServices } = useQuery<Service[]>({
    queryKey: ["services", locationId],
    queryFn: () => apiRequest("/api/services"),
    enabled: true,
  });

  const { data: categories, isLoading: isLoadingCategories } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => apiRequest("/api/services/categories"),
    enabled: true,
  });

  const { data: staff, isLoading: isLoadingStaff } = useQuery<Staff[]>({
    queryKey: ["staff", locationId],
    queryFn: () => apiRequest(`/api/staff${locationId ? `?locationId=${locationId}` : ""}`),
    enabled: true,
  });

  const { data: locations, isLoading: isLoadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiRequest("/api/locations"),
    enabled: true,
  });

  const isLoading = isLoadingServices || isLoadingCategories || isLoadingStaff || isLoadingLocations;

  return {
    services,
    categories,
    staff,
    locations,
    isLoading,
  };
};
