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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scissors } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import type { BookingFormValues, Service, Category } from "../types";
import { formatDuration, formatPrice } from "@/lib/utils";

interface ServiceSelectorProps {
  form: UseFormReturn<BookingFormValues>;
  services: Service[];
  categories: Category[];
  isLoading?: boolean;
}

export const ServiceSelector = ({
  form,
  services,
  categories,
  isLoading = false,
}: ServiceSelectorProps) => {
  // Group services by category
  const servicesByCategory = services?.reduce((acc, service) => {
    const categoryId = service.categoryId;
    if (!acc[categoryId]) {
      acc[categoryId] = [];
    }
    acc[categoryId].push(service);
    return acc;
  }, {} as Record<number, Service[]>);

  return (
    <FormField
      control={form.control}
      name="serviceId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Service</FormLabel>
          <Select
            disabled={isLoading}
            onValueChange={field.onChange}
            value={field.value}
          >
            <FormControl>
              <SelectTrigger>
                <Scissors className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {categories?.map((category) => (
                <SelectGroup key={category.id}>
                  <SelectLabel>{category.name}</SelectLabel>
                  {servicesByCategory[category.id]?.map((service) => (
                    <SelectItem
                      key={service.id}
                      value={service.id.toString()}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{service.name}</span>
                        <span className="text-muted-foreground text-sm">
                          {formatDuration(service.duration)} • {formatPrice(service.price)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
