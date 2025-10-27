import type { ApiResponse, PaginatedResponse, DateRangeParams } from '@/core/api/types';
import type { Appointment, AppointmentWithRelations } from './index';

// Request Types
export interface CreateAppointmentRequest {
  staffId: number;
  serviceId: number;
  clientId: number;
  date: string;
  time: string;
  notes?: string;
  addOnServiceIds?: number[];
  locationId: number;
  isRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurringCount?: number;
}

export interface UpdateAppointmentRequest {
  staffId?: number;
  serviceId?: number;
  date?: string;
  time?: string;
  notes?: string;
  addOnServiceIds?: number[];
  locationId?: number;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
}

export interface AppointmentFiltersRequest extends DateRangeParams {
  staffId?: number;
  clientId?: number;
  serviceId?: number;
  locationId?: number;
  status?: string[];
}

// Response Types
export type CreateAppointmentResponse = ApiResponse<AppointmentWithRelations>;
export type UpdateAppointmentResponse = ApiResponse<AppointmentWithRelations>;
export type GetAppointmentResponse = ApiResponse<AppointmentWithRelations>;
export type GetAppointmentsResponse = ApiResponse<PaginatedResponse<AppointmentWithRelations>>;

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  staffId: number;
}

export interface DailyAvailability {
  date: string;
  slots: AvailabilitySlot[];
}

export interface GetAvailabilityRequest extends DateRangeParams {
  staffId: number;
  serviceId: number;
  locationId: number;
}

export type GetAvailabilityResponse = ApiResponse<DailyAvailability[]>;

// Webhook Response Types
export interface AppointmentWebhookResponse {
  type: 'appointment.created' | 'appointment.updated' | 'appointment.cancelled';
  appointmentId: number;
  timestamp: string;
  data: AppointmentWithRelations;
}
