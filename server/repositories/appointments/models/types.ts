import { InferModel } from 'drizzle-orm';
import { appointments, appointmentHistory, appointmentPhotos, cancelledAppointments } from '../../../schema';

// Base types from schema
export type Appointment = InferModel<typeof appointments>;
export type AppointmentHistory = InferModel<typeof appointmentHistory>;
export type AppointmentPhoto = InferModel<typeof appointmentPhotos>;
export type CancelledAppointment = InferModel<typeof cancelledAppointments>;

// Insert types
export type InsertAppointment = InferModel<typeof appointments, 'insert'>;
export type InsertAppointmentHistory = InferModel<typeof appointmentHistory, 'insert'>;
export type InsertAppointmentPhoto = InferModel<typeof appointmentPhotos, 'insert'>;
export type InsertCancelledAppointment = InferModel<typeof cancelledAppointments, 'insert'>;

// Query filters
export interface AppointmentFilters {
  startDate?: Date;
  endDate?: Date;
  staffId?: number;
  clientId?: number;
  serviceId?: number;
  locationId?: number;
  status?: string[];
}

// Extended types with relations
export interface AppointmentWithRelations extends Appointment {
  client?: {
    id: number;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
  staff?: {
    id: number;
    firstName?: string;
    lastName?: string;
    title?: string;
  };
  service?: {
    id: number;
    name: string;
    duration: number;
    price: number;
  };
  location?: {
    id: number;
    name: string;
  };
  addOnServices?: Array<{
    id: number;
    name: string;
    price: number;
  }>;
  history?: AppointmentHistory[];
  photos?: AppointmentPhoto[];
}

// Repository interface
export interface IAppointmentRepository {
  // Basic CRUD
  create(data: InsertAppointment): Promise<Appointment>;
  findById(id: number): Promise<AppointmentWithRelations | null>;
  update(id: number, data: Partial<InsertAppointment>): Promise<Appointment>;
  delete(id: number): Promise<void>;
  
  // Queries
  findByFilters(filters: AppointmentFilters): Promise<AppointmentWithRelations[]>;
  findUpcoming(clientId: number): Promise<AppointmentWithRelations[]>;
  findPast(clientId: number): Promise<AppointmentWithRelations[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<AppointmentWithRelations[]>;
  findByStaff(staffId: number): Promise<AppointmentWithRelations[]>;
  
  // History
  addHistory(data: InsertAppointmentHistory): Promise<AppointmentHistory>;
  getHistory(appointmentId: number): Promise<AppointmentHistory[]>;
  
  // Photos
  addPhoto(data: InsertAppointmentPhoto): Promise<AppointmentPhoto>;
  getPhotos(appointmentId: number): Promise<AppointmentPhoto[]>;
  deletePhoto(photoId: number): Promise<void>;
  
  // Cancellations
  cancel(appointmentId: number, reason: string): Promise<CancelledAppointment>;
  getCancellation(appointmentId: number): Promise<CancelledAppointment | null>;
  
  // Add-ons
  getAddOns(appointmentId: number): Promise<number[]>;
  setAddOns(appointmentId: number, addOnIds: number[]): Promise<void>;
  addAddOn(appointmentId: number, addOnId: number): Promise<void>;
  removeAddOn(appointmentId: number, addOnId: number): Promise<void>;
}
