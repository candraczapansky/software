import type { PaginationOptions, SortOptions } from '../../../shared/types';

export interface Client {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientNote {
  id: number;
  clientId: number;
  note: string;
  createdAt: Date;
  createdBy: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
}

export interface ClientPhoto {
  id: number;
  clientId: number;
  url: string;
  caption?: string;
  createdAt: Date;
}

export interface ClientFormSubmission {
  id: number;
  clientId: number;
  formId: number;
  formName: string;
  submittedAt: Date;
  responses: Record<string, any>;
}

export interface ClientSearchOptions extends PaginationOptions, SortOptions {
  search?: string;
  locationId?: number;
}

export interface ClientStats {
  totalAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalSpent: number;
  lastVisit?: Date;
  nextAppointment?: Date;
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

export interface ClientNotification {
  type: 'email' | 'sms';
  client: Client;
  template: string;
  data: Record<string, any>;
}

export interface ClientMergeRequest {
  primaryClientId: number;
  secondaryClientId: number;
  mergeFields: {
    [key: string]: 'primary' | 'secondary';
  };
}
