import { InferModel } from 'drizzle-orm';
import { users, clientMemberships, clientNotes, clientPhotos } from '../../../schema';

// Base types from schema
export type User = InferModel<typeof users>;
export type ClientMembership = InferModel<typeof clientMemberships>;
export type ClientNote = InferModel<typeof clientNotes>;
export type ClientPhoto = InferModel<typeof clientPhotos>;

// Insert types
export type InsertUser = InferModel<typeof users, 'insert'>;
export type InsertClientMembership = InferModel<typeof clientMemberships, 'insert'>;
export type InsertClientNote = InferModel<typeof clientNotes, 'insert'>;
export type InsertClientPhoto = InferModel<typeof clientPhotos, 'insert'>;

// Query filters
export interface ClientFilters {
  search?: string;
  locationId?: number;
  hasMembership?: boolean;
  hasAppointments?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

// Extended types with relations
export interface ClientWithRelations extends User {
  memberships?: Array<{
    id: number;
    membershipId: number;
    startDate: Date;
    endDate?: Date;
    status: string;
    membership: {
      id: number;
      name: string;
      description?: string;
      price: number;
    };
  }>;
  notes?: Array<{
    id: number;
    note: string;
    createdAt: Date;
    createdBy: {
      id: number;
      firstName?: string;
      lastName?: string;
    };
  }>;
  photos?: Array<{
    id: number;
    url: string;
    caption?: string;
    createdAt: Date;
  }>;
  appointments?: Array<{
    id: number;
    date: Date;
    time: string;
    status: string;
    service: {
      id: number;
      name: string;
    };
    staff: {
      id: number;
      firstName?: string;
      lastName?: string;
    };
  }>;
  preferences?: {
    emailAppointmentReminders: boolean;
    emailPromotions: boolean;
    smsAppointmentReminders: boolean;
    smsPromotions: boolean;
  };
}

// Repository interface
export interface IClientRepository {
  // Basic CRUD
  create(data: InsertUser): Promise<User>;
  findById(id: number): Promise<ClientWithRelations | null>;
  update(id: number, data: Partial<InsertUser>): Promise<User>;
  delete(id: number): Promise<void>;
  
  // Queries
  findByFilters(filters: ClientFilters): Promise<ClientWithRelations[]>;
  findByEmail(email: string): Promise<ClientWithRelations | null>;
  findByPhone(phone: string): Promise<ClientWithRelations | null>;
  search(query: string): Promise<ClientWithRelations[]>;
  
  // Memberships
  addMembership(data: InsertClientMembership): Promise<ClientMembership>;
  getMemberships(clientId: number): Promise<ClientMembership[]>;
  cancelMembership(membershipId: number): Promise<void>;
  
  // Notes
  addNote(data: InsertClientNote): Promise<ClientNote>;
  getNotes(clientId: number): Promise<ClientNote[]>;
  deleteNote(noteId: number): Promise<void>;
  
  // Photos
  addPhoto(data: InsertClientPhoto): Promise<ClientPhoto>;
  getPhotos(clientId: number): Promise<ClientPhoto[]>;
  deletePhoto(photoId: number): Promise<void>;
  
  // Preferences
  updatePreferences(clientId: number, preferences: ClientWithRelations['preferences']): Promise<void>;
  getPreferences(clientId: number): Promise<ClientWithRelations['preferences']>;
}
