import { z } from "zod";

// Client form schema
export const clientFormSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  firstName: z.string().min(1, { message: "First name is required" }).optional().or(z.literal('')),
  lastName: z.string().min(1, { message: "Last name is required" }).optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zipCode: z.string().optional().or(z.literal(''))
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

// Service form schema
export const serviceFormSchema = z.object({
  name: z.string().min(1, { message: "Service name is required" }),
  description: z.string().optional().or(z.literal('')),
  duration: z.number().min(1, { message: "Duration must be at least 1 minute" }),
  price: z.number().min(0, { message: "Price must be 0 or greater" }),
  color: z.string().optional().or(z.literal('')),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const getAppointmentStatus = (appointment: any) => {
  if (!appointment) return "unknown";
  
  if (appointment.cancelledAt) return "cancelled";
  if (appointment.completedAt) return "completed";
  if (appointment.noShow) return "no-show";
  
  const now = new Date();
  const appointmentDate = new Date(appointment.date);
  
  if (appointmentDate < now) return "past";
  return "upcoming";
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "no-show":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "past":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  }
};

export const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return "CheckCircle";
    case "cancelled":
      return "XCircle";
    case "no-show":
      return "AlertCircle";
    case "past":
      return "Clock";
    default:
      return "Calendar";
  }
};
