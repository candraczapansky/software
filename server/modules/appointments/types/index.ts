import type { DateRange } from '../../../shared/types';

export interface Appointment {
  id: number;
  clientId: number;
  staffId: number;
  serviceId: number;
  date: Date;
  time: string;
  duration: number;
  price: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  notes?: string;
  addOnServiceIds?: number[];
  recurringGroupId?: number;
  locationId: number;
  createdAt: Date;
  updatedAt: Date;
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

export interface AppointmentFilters extends DateRange {
  staffId?: number;
  clientId?: number;
  serviceId?: number;
  locationId?: number;
  status?: string[];
}

export interface TimeSlot {
  time: string;
  available: boolean;
  staffId: number;
}

export interface DailyAvailability {
  date: string;
  slots: TimeSlot[];
}

export interface AvailabilityRequest extends DateRange {
  staffId: number;
  serviceId: number;
  locationId: number;
}

export interface RecurringAppointmentConfig {
  frequency: 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  count: number;
  endDate?: Date;
}

export interface AppointmentNotification {
  type: 'confirmation' | 'reminder' | 'cancellation' | 'modification';
  appointment: AppointmentWithRelations;
  recipient: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  template: string;
  data: Record<string, any>;
}
