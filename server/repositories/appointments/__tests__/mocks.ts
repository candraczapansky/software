import type {
  InsertAppointment,
  InsertAppointmentHistory,
  InsertAppointmentPhoto,
  InsertCancelledAppointment
} from '../models/types';

export const mockAppointment = (overrides: Partial<InsertAppointment> = {}): InsertAppointment => ({
  clientId: 1,
  staffId: 1,
  serviceId: 1,
  locationId: 1,
  date: new Date('2025-10-25'),
  time: '10:00',
  duration: 60,
  price: 100,
  status: 'pending',
  notes: 'Test appointment',
  addOnServiceIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockAppointmentHistory = (
  appointmentId: number,
  overrides: Partial<InsertAppointmentHistory> = {}
): InsertAppointmentHistory => ({
  appointmentId,
  action: 'created',
  details: 'Appointment created',
  performedBy: 1,
  createdAt: new Date(),
  ...overrides
});

export const mockAppointmentPhoto = (
  appointmentId: number,
  overrides: Partial<InsertAppointmentPhoto> = {}
): InsertAppointmentPhoto => ({
  appointmentId,
  url: 'https://example.com/photo.jpg',
  caption: 'Test photo',
  createdAt: new Date(),
  ...overrides
});

export const mockCancelledAppointment = (
  appointmentId: number,
  overrides: Partial<InsertCancelledAppointment> = {}
): InsertCancelledAppointment => ({
  appointmentId,
  reason: 'Client requested',
  cancelledAt: new Date(),
  ...overrides
});
