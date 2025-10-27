import type {
  InsertUser,
  InsertClientMembership,
  InsertClientNote,
  InsertClientPhoto
} from '../models/types';

export const mockClient = (overrides: Partial<InsertUser> = {}): InsertUser => ({
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: '123-456-7890',
  role: 'client',
  locationId: 1,
  emailAppointmentReminders: true,
  emailPromotions: true,
  smsAppointmentReminders: true,
  smsPromotions: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockClientMembership = (
  clientId: number,
  overrides: Partial<InsertClientMembership> = {}
): InsertClientMembership => ({
  clientId,
  membershipId: 1,
  startDate: new Date(),
  status: 'active',
  createdAt: new Date(),
  ...overrides
});

export const mockClientNote = (
  clientId: number,
  overrides: Partial<InsertClientNote> = {}
): InsertClientNote => ({
  clientId,
  note: 'Test note',
  createdBy: 1,
  createdAt: new Date(),
  ...overrides
});

export const mockClientPhoto = (
  clientId: number,
  overrides: Partial<InsertClientPhoto> = {}
): InsertClientPhoto => ({
  clientId,
  url: 'https://example.com/photo.jpg',
  caption: 'Test photo',
  createdAt: new Date(),
  ...overrides
});
