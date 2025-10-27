import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface ReportFilters {
  dateRange: DateRange;
  staffId?: string;
  locationId?: string;
}

export const useReportData = (reportType: string, filters: ReportFilters) => {
  const { startDate, endDate } = filters.dateRange;

  return useQuery({
    queryKey: ["reports", reportType, startDate.toISOString(), endDate.toISOString(), filters.staffId, filters.locationId],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ...(filters.staffId && { staffId: filters.staffId }),
        ...(filters.locationId && { locationId: filters.locationId }),
      });

      return apiRequest(`/api/reports/${reportType}?${params.toString()}`);
    },
  });
};
