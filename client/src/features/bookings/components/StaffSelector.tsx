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
import { User } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import type { BookingFormValues, Staff } from "../types";

interface StaffSelectorProps {
  form: UseFormReturn<BookingFormValues>;
  staff: Staff[];
  isLoading?: boolean;
}

export const StaffSelector = ({
  form,
  staff,
  isLoading = false,
}: StaffSelectorProps) => {
  return (
    <FormField
      control={form.control}
      name="staffId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Staff Member</FormLabel>
          <Select
            disabled={isLoading}
            onValueChange={field.onChange}
            value={field.value}
          >
            <FormControl>
              <SelectTrigger>
                <User className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {staff?.map((member) => (
                <SelectItem
                  key={member.id}
                  value={member.id.toString()}
                >
                  <div className="flex flex-col">
                    <span>
                      {member.user.firstName} {member.user.lastName}
                    </span>
                    {member.title && (
                      <span className="text-muted-foreground text-sm">
                        {member.title}
                      </span>
                    )}
                  </div>
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
