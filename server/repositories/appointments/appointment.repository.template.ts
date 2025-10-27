import { eq, and, or, gte, lte, desc } from 'drizzle-orm';
import { Database } from '../../db';
import {
  appointments,
  appointmentHistory,
  appointmentPhotos,
  cancelledAppointments,
  clients,
  staff,
  services,
  locations
} from '../../schema';
import type {
  Appointment,
  AppointmentWithRelations,
  AppointmentHistory,
  AppointmentPhoto,
  CancelledAppointment,
  InsertAppointment,
  InsertAppointmentHistory,
  InsertAppointmentPhoto,
  InsertCancelledAppointment,
  AppointmentFilters,
  IAppointmentRepository
} from './models/types';

export class AppointmentRepository implements IAppointmentRepository {
  constructor(private db: Database) {}

  async create(data: InsertAppointment): Promise<Appointment> {
    const [appointment] = await this.db
      .insert(appointments)
      .values(data)
      .returning();
    
    return appointment;
  }

  async findById(id: number): Promise<AppointmentWithRelations | null> {
    const [result] = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(locations, eq(appointments.locationId, locations.id));

    if (!result) return null;

    // Get related data
    const [history, photos, addOns] = await Promise.all([
      this.getHistory(id),
      this.getPhotos(id),
      this.getAddOns(id)
    ]);

    return {
      ...result.appointments,
      client: result.clients,
      staff: result.staff,
      service: result.services,
      location: result.locations,
      history,
      photos,
      addOnServices: addOns
    };
  }

  async update(id: number, data: Partial<InsertAppointment>): Promise<Appointment> {
    const [updated] = await this.db
      .update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();

    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(appointments)
      .where(eq(appointments.id, id));
  }

  async findByFilters(filters: AppointmentFilters): Promise<AppointmentWithRelations[]> {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(appointments.date, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(appointments.date, filters.endDate));
    }

    if (filters.staffId) {
      conditions.push(eq(appointments.staffId, filters.staffId));
    }

    if (filters.clientId) {
      conditions.push(eq(appointments.clientId, filters.clientId));
    }

    if (filters.serviceId) {
      conditions.push(eq(appointments.serviceId, filters.serviceId));
    }

    if (filters.locationId) {
      conditions.push(eq(appointments.locationId, filters.locationId));
    }

    if (filters.status?.length) {
      conditions.push(or(...filters.status.map(status => eq(appointments.status, status))));
    }

    const results = await this.db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(locations, eq(appointments.locationId, locations.id))
      .orderBy(desc(appointments.date));

    // Map results to AppointmentWithRelations
    return Promise.all(
      results.map(async (result) => ({
        ...result.appointments,
        client: result.clients,
        staff: result.staff,
        service: result.services,
        location: result.locations,
        history: await this.getHistory(result.appointments.id),
        photos: await this.getPhotos(result.appointments.id),
        addOnServices: await this.getAddOns(result.appointments.id)
      }))
    );
  }

  async findUpcoming(clientId: number): Promise<AppointmentWithRelations[]> {
    return this.findByFilters({
      clientId,
      startDate: new Date(),
      status: ['pending', 'confirmed']
    });
  }

  async findPast(clientId: number): Promise<AppointmentWithRelations[]> {
    return this.findByFilters({
      clientId,
      endDate: new Date(),
      status: ['completed', 'cancelled', 'no-show']
    });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<AppointmentWithRelations[]> {
    return this.findByFilters({ startDate, endDate });
  }

  async findByStaff(staffId: number): Promise<AppointmentWithRelations[]> {
    return this.findByFilters({ staffId });
  }

  async addHistory(data: InsertAppointmentHistory): Promise<AppointmentHistory> {
    const [history] = await this.db
      .insert(appointmentHistory)
      .values(data)
      .returning();

    return history;
  }

  async getHistory(appointmentId: number): Promise<AppointmentHistory[]> {
    return this.db
      .select()
      .from(appointmentHistory)
      .where(eq(appointmentHistory.appointmentId, appointmentId))
      .orderBy(desc(appointmentHistory.createdAt));
  }

  async addPhoto(data: InsertAppointmentPhoto): Promise<AppointmentPhoto> {
    const [photo] = await this.db
      .insert(appointmentPhotos)
      .values(data)
      .returning();

    return photo;
  }

  async getPhotos(appointmentId: number): Promise<AppointmentPhoto[]> {
    return this.db
      .select()
      .from(appointmentPhotos)
      .where(eq(appointmentPhotos.appointmentId, appointmentId))
      .orderBy(desc(appointmentPhotos.createdAt));
  }

  async deletePhoto(photoId: number): Promise<void> {
    await this.db
      .delete(appointmentPhotos)
      .where(eq(appointmentPhotos.id, photoId));
  }

  async cancel(appointmentId: number, reason: string): Promise<CancelledAppointment> {
    // Update appointment status
    await this.update(appointmentId, { status: 'cancelled' });

    // Create cancellation record
    const [cancellation] = await this.db
      .insert(cancelledAppointments)
      .values({
        appointmentId,
        reason,
        cancelledAt: new Date()
      })
      .returning();

    return cancellation;
  }

  async getCancellation(appointmentId: number): Promise<CancelledAppointment | null> {
    const [cancellation] = await this.db
      .select()
      .from(cancelledAppointments)
      .where(eq(cancelledAppointments.appointmentId, appointmentId));

    return cancellation || null;
  }

  async getAddOns(appointmentId: number): Promise<number[]> {
    const appointment = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    return appointment[0]?.addOnServiceIds || [];
  }

  async setAddOns(appointmentId: number, addOnIds: number[]): Promise<void> {
    await this.db
      .update(appointments)
      .set({ addOnServiceIds: addOnIds })
      .where(eq(appointments.id, appointmentId));
  }

  async addAddOn(appointmentId: number, addOnId: number): Promise<void> {
    const currentAddOns = await this.getAddOns(appointmentId);
    if (!currentAddOns.includes(addOnId)) {
      await this.setAddOns(appointmentId, [...currentAddOns, addOnId]);
    }
  }

  async removeAddOn(appointmentId: number, addOnId: number): Promise<void> {
    const currentAddOns = await this.getAddOns(appointmentId);
    await this.setAddOns(
      appointmentId,
      currentAddOns.filter(id => id !== addOnId)
    );
  }
}
