import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import type { BookingFormValues } from "../types";

interface LocationSelectorProps {
  form: UseFormReturn<BookingFormValues>;
  locations: Array<{ id: number; name: string }>;
  isLoading?: boolean;
}

export const LocationSelector = ({
  form,
  locations,
  isLoading = false,
}: LocationSelectorProps) => {
  return (
    <FormField
      control={form.control}
      name="locationId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Location</FormLabel>
          <Select
            disabled={isLoading}
            onValueChange={field.onChange}
            value={field.value}
          >
            <FormControl>
              <SelectTrigger>
                <MapPin className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {locations?.map((location) => (
                <SelectItem
                  key={location.id}
                  value={location.id.toString()}
                >
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
