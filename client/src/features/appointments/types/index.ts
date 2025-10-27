import { z } from "zod";

export interface Appointment {
  id: number;
  clientId: number;
  staffId: number;
  serviceId: number;
  date: string;
  time: string;
  duration: number;
  price: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  notes?: string;
  addOnServiceIds?: number[];
  recurringGroupId?: number;
  locationId: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentWithRelations extends Appointment {
  client: {
    id: number;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
  staff: {
    id: number;
    user: {
      id: number;
      firstName?: string;
      lastName?: string;
    };
    title?: string;
  };
  service: {
    id: number;
    name: string;
    duration: number;
    price: number;
    description?: string;
  };
  location: {
    id: number;
    name: string;
  };
}

export const appointmentFormSchema = z.object({
  staffId: z.string().min(1, "Staff member is required"),
  serviceId: z.string().min(1, "Service is required"),
  clientId: z.string().min(1, "Client is required"),
  date: z.date({
    required_error: "Date is required",
  }),
  time: z.string().min(1, "Time is required"),
  notes: z.string().optional(),
  addOnServiceIds: z.array(z.string()).optional(),
  locationId: z.string().min(1, "Location is required"),
  // Recurring appointment fields
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(["weekly", "biweekly", "triweekly", "monthly"]).optional(),
  recurringCount: z.number().min(2).max(52).optional(),
});

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

export interface AppointmentFilters {
  startDate?: Date;
  endDate?: Date;
  staffId?: number;
  clientId?: number;
  serviceId?: number;
  locationId?: number;
  status?: string[];
}
