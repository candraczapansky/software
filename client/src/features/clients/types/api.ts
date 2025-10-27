import type { ApiResponse, PaginatedResponse, PaginationParams, SortParams } from '@/core/api/types';
import type { Client, ClientNote, ClientPhoto, ClientFormSubmission } from './index';

// Request Types
export interface CreateClientRequest {
  email: string;
  firstName: string;
  lastName: string;
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
}

export interface UpdateClientRequest {
  email?: string;
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
}

export interface ClientSearchParams extends PaginationParams, SortParams {
  search?: string;
  locationId?: number;
}

export interface AddClientNoteRequest {
  note: string;
  clientId: number;
}

export interface AddClientPhotoRequest {
  photo: File;
  caption?: string;
  clientId: number;
}

// Response Types
export type CreateClientResponse = ApiResponse<Client>;
export type UpdateClientResponse = ApiResponse<Client>;
export type GetClientResponse = ApiResponse<Client>;
export type GetClientsResponse = ApiResponse<PaginatedResponse<Client>>;

export interface GetClientNotesResponse extends ApiResponse<PaginatedResponse<ClientNote>> {}
export interface GetClientPhotosResponse extends ApiResponse<PaginatedResponse<ClientPhoto>> {}
export interface GetClientFormSubmissionsResponse extends ApiResponse<PaginatedResponse<ClientFormSubmission>> {}

export interface ClientStats {
  totalAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalSpent: number;
  lastVisit?: string;
  nextAppointment?: string;
  preferredServices: Array<{
    serviceId: number;
    serviceName: string;
    count: number;
  }>;
  preferredStaff: Array<{
    staffId: number;
    staffName: string;
    count: number;
  }>;
}

export type GetClientStatsResponse = ApiResponse<ClientStats>;
