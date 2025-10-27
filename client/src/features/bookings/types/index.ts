import { z } from "zod";

export interface Service {
  id: number;
  name: string;
  description: string;
  duration: number;
  price: number;
  categoryId: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface Staff {
  id: number;
  user: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
  title: string;
  services: number[]; // Array of service IDs they can perform
}

export interface TimeSlot {
  time: string;
  available: boolean;
  staffId: number;
}

export interface AvailabilityResponse {
  date: string;
  slots: TimeSlot[];
}

export const bookingSchema = z.object({
  locationId: z.string().min(1, "Please select a location"),
  serviceId: z.string().min(1, "Please select a service"),
  staffId: z.string().min(1, "Please select a staff member"),
  date: z.date({
    required_error: "Please select a date",
  }),
  time: z.string().min(1, "Please select a time"),
  notes: z.string().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address").min(1, "Email is required"),
  phone: z.string().min(1, "Phone number is required"),
  addOnServiceIds: z.array(z.string()).optional(),
  // Recurring appointment fields
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(["weekly", "biweekly", "triweekly", "monthly"]).optional(),
  recurringCount: z.number().min(2).max(52).optional(),
  recurringEndDate: z.date().optional(),
});

export type BookingFormValues = z.infer<typeof bookingSchema>;

export interface BookingFilters {
  locationId?: string;
  serviceId?: string;
  staffId?: string;
  date?: Date;
  startTime?: string;
  endTime?: string;
}
