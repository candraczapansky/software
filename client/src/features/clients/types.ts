import { z } from "zod";

export type Client = {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;
  emailAccountManagement?: boolean;
  emailAppointmentReminders?: boolean;
  emailPromotions?: boolean;
  smsAppointmentReminders?: boolean;
  smsPromotions?: boolean;
};

export const clientFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  emailAccountManagement: z.boolean().optional(),
  emailAppointmentReminders: z.boolean().optional(),
  emailPromotions: z.boolean().optional(),
  smsAppointmentReminders: z.boolean().optional(),
  smsPromotions: z.boolean().optional(),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

export interface ClientFilters {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export interface ClientSearchResult {
  clients: Client[];
  total: number;
  page: number;
  perPage: number;
}
