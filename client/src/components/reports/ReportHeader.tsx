import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { DateRangeSelector } from "./DateRangeSelector";

interface ReportHeaderProps {
  title: string;
  description: string;
  onBack: () => void;
  onRefresh: () => void;
  dateRange: {
    timePeriod: string;
    dateRange: {
      startDate: Date;
      endDate: Date;
    };
    customStartDate?: string;
    customEndDate?: string;
  };
  onDateRangeChange: (value: {
    timePeriod: string;
    dateRange: {
      startDate: Date;
      endDate: Date;
    };
    customStartDate?: string;
    customEndDate?: string;
  }) => void;
  isLoading?: boolean;
}

export const ReportHeader = ({
  title,
  description,
  onBack,
  onRefresh,
  dateRange,
  onDateRangeChange,
  isLoading = false,
}: ReportHeaderProps) => {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-9 w-9"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <DateRangeSelector
          value={dateRange}
          onChange={onDateRangeChange}
        />
      </div>
    </div>
  );
};
