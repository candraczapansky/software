import { z } from 'zod';

export interface Appointment {
  id: number;
  clientId: number;
  staffId: number;
  serviceId: number;
  date: Date;
  time: string;
  duration: number;
  price: number;
  status: AppointmentStatus;
  notes?: string;
  addOnServiceIds?: number[];
  recurringGroupId?: number;
  locationId: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';

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

// Request/Response DTOs
export interface CreateAppointmentDTO {
  clientId: number;
  staffId: number;
  serviceId: number;
  date: string;
  time: string;
  notes?: string;
  addOnServiceIds?: number[];
  locationId: number;
  isRecurring?: boolean;
  recurringConfig?: {
    frequency: 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    count: number;
  };
}

export interface UpdateAppointmentDTO {
  staffId?: number;
  serviceId?: number;
  date?: string;
  time?: string;
  notes?: string;
  addOnServiceIds?: number[];
  status?: AppointmentStatus;
}

export interface AppointmentFilters {
  startDate?: Date;
  endDate?: Date;
  staffId?: number;
  clientId?: number;
  serviceId?: number;
  locationId?: number;
  status?: AppointmentStatus[];
}

// Validation Schemas
export const createAppointmentSchema = z.object({
  clientId: z.number().positive(),
  staffId: z.number().positive(),
  serviceId: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
  addOnServiceIds: z.array(z.number()).optional(),
  locationId: z.number().positive(),
  isRecurring: z.boolean().optional(),
  recurringConfig: z.object({
    frequency: z.enum(['weekly', 'biweekly', 'triweekly', 'monthly']),
    count: z.number().min(2).max(52)
  }).optional()
});

export const updateAppointmentSchema = z.object({
  staffId: z.number().positive().optional(),
  serviceId: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
  addOnServiceIds: z.array(z.number()).optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no-show']).optional()
});
