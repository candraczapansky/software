import { eq, and, or, like, desc, sql } from 'drizzle-orm';
import { Database } from '../../db';
import {
  users,
  clientMemberships,
  clientNotes,
  clientPhotos,
  memberships,
  appointments,
  services,
  staff
} from '../../schema';
import type {
  User,
  ClientMembership,
  ClientNote,
  ClientPhoto,
  ClientWithRelations,
  InsertUser,
  InsertClientMembership,
  InsertClientNote,
  InsertClientPhoto,
  ClientFilters,
  IClientRepository
} from './models/types';

export class ClientRepository implements IClientRepository {
  constructor(private db: Database) {}

  async create(data: InsertUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values(data)
      .returning();
    
    return user;
  }

  async findById(id: number): Promise<ClientWithRelations | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) return null;

    // Get related data
    const [memberships, notes, photos, appointments] = await Promise.all([
      this.getMemberships(id),
      this.getNotes(id),
      this.getPhotos(id),
      this.getAppointments(id)
    ]);

    return {
      ...user,
      memberships,
      notes,
      photos,
      appointments,
      preferences: await this.getPreferences(id)
    };
  }

  async update(id: number, data: Partial<InsertUser>): Promise<User> {
    const [updated] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(users)
      .where(eq(users.id, id));
  }

  async findByFilters(filters: ClientFilters): Promise<ClientWithRelations[]> {
    const conditions = [];

    if (filters.search) {
      conditions.push(
        or(
          like(users.firstName, `%${filters.search}%`),
          like(users.lastName, `%${filters.search}%`),
          like(users.email, `%${filters.search}%`),
          like(users.phone, `%${filters.search}%`)
        )
      );
    }

    if (filters.locationId) {
      conditions.push(eq(users.locationId, filters.locationId));
    }

    if (filters.createdAfter) {
      conditions.push(sql`${users.createdAt} >= ${filters.createdAfter}`);
    }

    if (filters.createdBefore) {
      conditions.push(sql`${users.createdAt} <= ${filters.createdBefore}`);
    }

    const results = await this.db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt));

    // Map results to ClientWithRelations
    return Promise.all(
      results.map(async (user) => ({
        ...user,
        memberships: await this.getMemberships(user.id),
        notes: await this.getNotes(user.id),
        photos: await this.getPhotos(user.id),
        appointments: await this.getAppointments(user.id),
        preferences: await this.getPreferences(user.id)
      }))
    );
  }

  async findByEmail(email: string): Promise<ClientWithRelations | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return null;

    return this.findById(user.id);
  }

  async findByPhone(phone: string): Promise<ClientWithRelations | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) return null;

    return this.findById(user.id);
  }

  async search(query: string): Promise<ClientWithRelations[]> {
    return this.findByFilters({ search: query });
  }

  async addMembership(data: InsertClientMembership): Promise<ClientMembership> {
    const [membership] = await this.db
      .insert(clientMemberships)
      .values(data)
      .returning();

    return membership;
  }

  async getMemberships(clientId: number): Promise<ClientMembership[]> {
    return this.db
      .select()
      .from(clientMemberships)
      .where(eq(clientMemberships.clientId, clientId))
      .leftJoin(memberships, eq(clientMemberships.membershipId, memberships.id))
      .orderBy(desc(clientMemberships.startDate));
  }

  async cancelMembership(membershipId: number): Promise<void> {
    await this.db
      .update(clientMemberships)
      .set({
        status: 'cancelled',
        endDate: new Date()
      })
      .where(eq(clientMemberships.id, membershipId));
  }

  async addNote(data: InsertClientNote): Promise<ClientNote> {
    const [note] = await this.db
      .insert(clientNotes)
      .values(data)
      .returning();

    return note;
  }

  async getNotes(clientId: number): Promise<ClientNote[]> {
    return this.db
      .select()
      .from(clientNotes)
      .where(eq(clientNotes.clientId, clientId))
      .orderBy(desc(clientNotes.createdAt));
  }

  async deleteNote(noteId: number): Promise<void> {
    await this.db
      .delete(clientNotes)
      .where(eq(clientNotes.id, noteId));
  }

  async addPhoto(data: InsertClientPhoto): Promise<ClientPhoto> {
    const [photo] = await this.db
      .insert(clientPhotos)
      .values(data)
      .returning();

    return photo;
  }

  async getPhotos(clientId: number): Promise<ClientPhoto[]> {
    return this.db
      .select()
      .from(clientPhotos)
      .where(eq(clientPhotos.clientId, clientId))
      .orderBy(desc(clientPhotos.createdAt));
  }

  async deletePhoto(photoId: number): Promise<void> {
    await this.db
      .delete(clientPhotos)
      .where(eq(clientPhotos.id, photoId));
  }

  private async getAppointments(clientId: number) {
    return this.db
      .select()
      .from(appointments)
      .where(eq(appointments.clientId, clientId))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .orderBy(desc(appointments.date));
  }

  async updatePreferences(
    clientId: number,
    preferences: ClientWithRelations['preferences']
  ): Promise<void> {
    await this.db
      .update(users)
      .set({
        emailAppointmentReminders: preferences.emailAppointmentReminders,
        emailPromotions: preferences.emailPromotions,
        smsAppointmentReminders: preferences.smsAppointmentReminders,
        smsPromotions: preferences.smsPromotions
      })
      .where(eq(users.id, clientId));
  }

  async getPreferences(clientId: number): Promise<ClientWithRelations['preferences']> {
    const [user] = await this.db
      .select({
        emailAppointmentReminders: users.emailAppointmentReminders,
        emailPromotions: users.emailPromotions,
        smsAppointmentReminders: users.smsAppointmentReminders,
        smsPromotions: users.smsPromotions
      })
      .from(users)
      .where(eq(users.id, clientId))
      .limit(1);

    return user || {
      emailAppointmentReminders: false,
      emailPromotions: false,
      smsAppointmentReminders: false,
      smsPromotions: false
    };
  }
}
