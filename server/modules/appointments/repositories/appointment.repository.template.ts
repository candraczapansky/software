import { Database } from '../../../core/database';
import { NotFoundError } from '../../../shared/middleware/error-handler.template';
import type {
  Appointment,
  AppointmentWithRelations,
  CreateAppointmentDTO,
  UpdateAppointmentDTO,
  AppointmentFilters
} from '../types/appointment.types.template';

export class AppointmentRepository {
  constructor(private db: Database) {}

  async findById(id: number): Promise<AppointmentWithRelations | null> {
    const appointment = await this.db.query(`
      SELECT 
        a.*,
        c.id as client_id,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email,
        c.phone as client_phone,
        s.id as staff_id,
        s.first_name as staff_first_name,
        s.last_name as staff_last_name,
        s.title as staff_title,
        sv.id as service_id,
        sv.name as service_name,
        sv.duration as service_duration,
        sv.price as service_price,
        sv.description as service_description,
        l.id as location_id,
        l.name as location_name
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN staff s ON a.staff_id = s.id
      LEFT JOIN services sv ON a.service_id = sv.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE a.id = $1
    `, [id]);

    if (!appointment) return null;

    // Transform raw data into AppointmentWithRelations type
    return this.mapToAppointmentWithRelations(appointment);
  }

  async create(data: CreateAppointmentDTO): Promise<Appointment> {
    const result = await this.db.query(`
      INSERT INTO appointments (
        client_id,
        staff_id,
        service_id,
        date,
        time,
        notes,
        add_on_service_ids,
        location_id,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `, [
      data.clientId,
      data.staffId,
      data.serviceId,
      data.date,
      data.time,
      data.notes,
      data.addOnServiceIds,
      data.locationId,
      'pending'
    ]);

    return result;
  }

  async update(id: number, data: UpdateAppointmentDTO): Promise<Appointment> {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    const result = await this.db.query(`
      UPDATE appointments
      SET
        staff_id = COALESCE($1, staff_id),
        service_id = COALESCE($2, service_id),
        date = COALESCE($3, date),
        time = COALESCE($4, time),
        notes = COALESCE($5, notes),
        add_on_service_ids = COALESCE($6, add_on_service_ids),
        status = COALESCE($7, status),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      data.staffId,
      data.serviceId,
      data.date,
      data.time,
      data.notes,
      data.addOnServiceIds,
      data.status,
      id
    ]);

    return result;
  }

  async delete(id: number): Promise<void> {
    const result = await this.db.query(`
      DELETE FROM appointments
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (!result) {
      throw new NotFoundError('Appointment not found');
    }
  }

  async findByFilters(filters: AppointmentFilters): Promise<AppointmentWithRelations[]> {
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (filters.startDate) {
      conditions.push(`a.date >= $${paramCount}`);
      params.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      conditions.push(`a.date <= $${paramCount}`);
      params.push(filters.endDate);
      paramCount++;
    }

    if (filters.staffId) {
      conditions.push(`a.staff_id = $${paramCount}`);
      params.push(filters.staffId);
      paramCount++;
    }

    if (filters.clientId) {
      conditions.push(`a.client_id = $${paramCount}`);
      params.push(filters.clientId);
      paramCount++;
    }

    if (filters.serviceId) {
      conditions.push(`a.service_id = $${paramCount}`);
      params.push(filters.serviceId);
      paramCount++;
    }

    if (filters.locationId) {
      conditions.push(`a.location_id = $${paramCount}`);
      params.push(filters.locationId);
      paramCount++;
    }

    if (filters.status?.length) {
      conditions.push(`a.status = ANY($${paramCount})`);
      params.push(filters.status);
      paramCount++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const appointments = await this.db.query(`
      SELECT 
        a.*,
        c.id as client_id,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email,
        c.phone as client_phone,
        s.id as staff_id,
        s.first_name as staff_first_name,
        s.last_name as staff_last_name,
        s.title as staff_title,
        sv.id as service_id,
        sv.name as service_name,
        sv.duration as service_duration,
        sv.price as service_price,
        sv.description as service_description,
        l.id as location_id,
        l.name as location_name
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN staff s ON a.staff_id = s.id
      LEFT JOIN services sv ON a.service_id = sv.id
      LEFT JOIN locations l ON a.location_id = l.id
      ${whereClause}
      ORDER BY a.date ASC, a.time ASC
    `, params);

    return appointments.map(this.mapToAppointmentWithRelations);
  }

  private mapToAppointmentWithRelations(raw: any): AppointmentWithRelations {
    return {
      id: raw.id,
      clientId: raw.client_id,
      staffId: raw.staff_id,
      serviceId: raw.service_id,
      date: raw.date,
      time: raw.time,
      duration: raw.duration,
      price: raw.price,
      status: raw.status,
      notes: raw.notes,
      addOnServiceIds: raw.add_on_service_ids,
      recurringGroupId: raw.recurring_group_id,
      locationId: raw.location_id,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      client: {
        id: raw.client_id,
        firstName: raw.client_first_name,
        lastName: raw.client_last_name,
        email: raw.client_email,
        phone: raw.client_phone
      },
      staff: {
        id: raw.staff_id,
        user: {
          id: raw.staff_id,
          firstName: raw.staff_first_name,
          lastName: raw.staff_last_name
        },
        title: raw.staff_title
      },
      service: {
        id: raw.service_id,
        name: raw.service_name,
        duration: raw.service_duration,
        price: raw.service_price,
        description: raw.service_description
      },
      location: {
        id: raw.location_id,
        name: raw.location_name
      }
    };
  }
}
