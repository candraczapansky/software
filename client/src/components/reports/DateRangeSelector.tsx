import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface DateRangeSelectorProps {
  value: {
    timePeriod: string;
    dateRange: DateRange;
    customStartDate?: string;
    customEndDate?: string;
  };
  onChange: (value: {
    timePeriod: string;
    dateRange: DateRange;
    customStartDate?: string;
    customEndDate?: string;
  }) => void;
}

const TIME_PERIODS = [
  { value: "day", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

export const DateRangeSelector = ({ value, onChange }: DateRangeSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleTimePeriodChange = (newPeriod: string) => {
    const dateRange = getDateRange(newPeriod, value.customStartDate, value.customEndDate);
    onChange({
      timePeriod: newPeriod,
      dateRange,
      customStartDate: value.customStartDate,
      customEndDate: value.customEndDate,
    });
  };

  const handleCustomDateChange = (startDate?: string, endDate?: string) => {
    const newStartDate = startDate ?? value.customStartDate;
    const newEndDate = endDate ?? value.customEndDate;
    const dateRange = getDateRange("custom", newStartDate, newEndDate);
    onChange({
      timePeriod: "custom",
      dateRange,
      customStartDate: newStartDate,
      customEndDate: newEndDate,
    });
  };

  // Helper function to calculate date range
  const getDateRange = (timePeriod: string, customStartDate?: string, customEndDate?: string) => {
    if (timePeriod === "custom" && customStartDate && customEndDate) {
      const [sy, sm, sd] = customStartDate.split('-').map(Number);
      const [ey, em, ed] = customEndDate.split('-').map(Number);
      const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
      const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);
      return { startDate, endDate };
    }
    
    const now = new Date();
    const startDate = new Date();
    let endDateOverride: Date | null = null;
    
    switch (timePeriod) {
      case "day":
        startDate.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        startDate.setHours(0, 0, 0, 0);
        break;
      case "yesterday": {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        startDate.setFullYear(y.getFullYear(), y.getMonth(), y.getDate());
        startDate.setHours(0, 0, 0, 0);
        endDateOverride = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        break;
      }
      case "week":
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        now.setHours(23, 59, 59, 999);
        break;
      case "month":
        startDate.setFullYear(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }
    
    return { startDate, endDate: endDateOverride ?? now };
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full md:w-[300px]">
          <Calendar className="mr-2 h-4 w-4" />
          {TIME_PERIODS.find(p => p.value === value.timePeriod)?.label || "Select Date Range"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-4" align="start">
        <div className="space-y-4">
          <Select
            value={value.timePeriod}
            onValueChange={handleTimePeriodChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select time period" />
            </SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {value.timePeriod === "custom" && (
            <div className="space-y-2">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={value.customStartDate}
                  onChange={(e) => handleCustomDateChange(e.target.value, value.customEndDate)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={value.customEndDate}
                  onChange={(e) => handleCustomDateChange(value.customStartDate, e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
