import { eq, and, or, like, between, desc, sql } from 'drizzle-orm';
import { Database } from '../../db';
import {
  staff,
  staffServices,
  staffSchedules,
  timeClockEntries,
  payrollHistory,
  services,
  locations,
  appointments,
  users
} from '../../schema';
import type {
  Staff,
  StaffService,
  StaffSchedule,
  TimeClockEntry,
  PayrollHistory,
  StaffWithRelations,
  StaffScheduleWithRelations,
  TimeClockEntryWithRelations,
  PayrollHistoryWithRelations,
  InsertStaff,
  InsertStaffSchedule,
  InsertTimeClockEntry,
  InsertPayrollHistory,
  StaffFilters,
  ScheduleFilters,
  PayrollFilters,
  IStaffRepository
} from './models/types';

export class StaffRepository implements IStaffRepository {
  constructor(private db: Database) {}

  async create(data: InsertStaff): Promise<Staff> {
    const [staffMember] = await this.db
      .insert(staff)
      .values(data)
      .returning();
    
    return staffMember;
  }

  async findById(id: number): Promise<StaffWithRelations | null> {
    const [result] = await this.db
      .select()
      .from(staff)
      .where(eq(staff.id, id))
      .leftJoin(users, eq(staff.userId, users.id))
      .limit(1);

    if (!result) return null;

    // Get related data
    const [services, schedule, locations, appointments] = await Promise.all([
      this.getAssignedServices(id),
      this.getSchedule(id, {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }),
      this.getAssignedLocations(id),
      this.getUpcomingAppointments(id)
    ]);

    return {
      ...result.staff,
      user: result.users,
      services,
      schedule,
      locations,
      appointments
    };
  }

  async update(id: number, data: Partial<InsertStaff>): Promise<Staff> {
    const [updated] = await this.db
      .update(staff)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(staff.id, id))
      .returning();

    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(staff)
      .where(eq(staff.id, id));
  }

  async findByFilters(filters: StaffFilters): Promise<StaffWithRelations[]> {
    const conditions = [];

    if (filters.locationId) {
      conditions.push(eq(staff.locationId, filters.locationId));
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(staff.isActive, filters.isActive));
    }

    if (filters.role) {
      conditions.push(eq(staff.role, filters.role));
    }

    if (filters.search) {
      conditions.push(
        or(
          like(users.firstName, `%${filters.search}%`),
          like(users.lastName, `%${filters.search}%`),
          like(users.email, `%${filters.search}%`)
        )
      );
    }

    const results = await this.db
      .select()
      .from(staff)
      .where(and(...conditions))
      .leftJoin(users, eq(staff.userId, users.id))
      .orderBy(users.firstName, users.lastName);

    // Map results to StaffWithRelations
    return Promise.all(
      results.map(async (result) => ({
        ...result.staff,
        user: result.users,
        services: await this.getAssignedServices(result.staff.id),
        schedule: await this.getSchedule(result.staff.id, {
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }),
        locations: await this.getAssignedLocations(result.staff.id),
        appointments: await this.getUpcomingAppointments(result.staff.id)
      }))
    );
  }

  async findByLocation(locationId: number): Promise<StaffWithRelations[]> {
    return this.findByFilters({ locationId });
  }

  async findByService(serviceId: number): Promise<StaffWithRelations[]> {
    const staffIds = await this.db
      .select()
      .from(staffServices)
      .where(eq(staffServices.serviceId, serviceId));

    return Promise.all(
      staffIds.map(({ staffId }) => this.findById(staffId))
    ).then(results => results.filter(Boolean) as StaffWithRelations[]);
  }

  async search(query: string): Promise<StaffWithRelations[]> {
    return this.findByFilters({ search: query });
  }

  async assignService(staffId: number, serviceId: number): Promise<void> {
    await this.db
      .insert(staffServices)
      .values({ staffId, serviceId })
      .onConflictDoNothing();
  }

  async unassignService(staffId: number, serviceId: number): Promise<void> {
    await this.db
      .delete(staffServices)
      .where(
        and(
          eq(staffServices.staffId, staffId),
          eq(staffServices.serviceId, serviceId)
        )
      );
  }

  async getAssignedServices(staffId: number): Promise<any[]> {
    return this.db
      .select({
        id: services.id,
        name: services.name,
        duration: services.duration,
        price: services.price
      })
      .from(staffServices)
      .where(eq(staffServices.staffId, staffId))
      .leftJoin(services, eq(staffServices.serviceId, services.id));
  }

  async createSchedule(data: InsertStaffSchedule): Promise<StaffSchedule> {
    const [schedule] = await this.db
      .insert(staffSchedules)
      .values(data)
      .returning();

    return schedule;
  }

  async updateSchedule(id: number, data: Partial<InsertStaffSchedule>): Promise<StaffSchedule> {
    const [updated] = await this.db
      .update(staffSchedules)
      .set(data)
      .where(eq(staffSchedules.id, id))
      .returning();

    return updated;
  }

  async deleteSchedule(id: number): Promise<void> {
    await this.db
      .delete(staffSchedules)
      .where(eq(staffSchedules.id, id));
  }

  async getSchedule(
    staffId: number,
    filters: ScheduleFilters
  ): Promise<StaffScheduleWithRelations[]> {
    const conditions = [eq(staffSchedules.staffId, staffId)];

    if (filters.locationId) {
      conditions.push(eq(staffSchedules.locationId, filters.locationId));
    }

    return this.db
      .select()
      .from(staffSchedules)
      .where(and(...conditions))
      .leftJoin(staff, eq(staffSchedules.staffId, staff.id))
      .leftJoin(locations, eq(staffSchedules.locationId, locations.id))
      .orderBy(staffSchedules.dayOfWeek, staffSchedules.startTime);
  }

  async clockIn(data: InsertTimeClockEntry): Promise<TimeClockEntry> {
    const [entry] = await this.db
      .insert(timeClockEntries)
      .values({ ...data, clockInTime: new Date() })
      .returning();

    return entry;
  }

  async clockOut(entryId: number): Promise<TimeClockEntry> {
    const [entry] = await this.db
      .update(timeClockEntries)
      .set({ clockOutTime: new Date() })
      .where(eq(timeClockEntries.id, entryId))
      .returning();

    return entry;
  }

  async getTimeClockEntries(
    staffId: number,
    startDate: Date,
    endDate: Date
  ): Promise<TimeClockEntryWithRelations[]> {
    return this.db
      .select()
      .from(timeClockEntries)
      .where(
        and(
          eq(timeClockEntries.staffId, staffId),
          between(timeClockEntries.clockInTime, startDate, endDate)
        )
      )
      .leftJoin(staff, eq(timeClockEntries.staffId, staff.id))
      .leftJoin(locations, eq(timeClockEntries.locationId, locations.id))
      .orderBy(desc(timeClockEntries.clockInTime));
  }

  async createPayrollEntry(data: InsertPayrollHistory): Promise<PayrollHistory> {
    const [entry] = await this.db
      .insert(payrollHistory)
      .values(data)
      .returning();

    return entry;
  }

  async getPayrollHistory(
    staffId: number,
    filters: PayrollFilters
  ): Promise<PayrollHistoryWithRelations[]> {
    const conditions = [
      eq(payrollHistory.staffId, staffId),
      between(payrollHistory.startDate, filters.startDate, filters.endDate)
    ];

    if (filters.locationId) {
      conditions.push(eq(payrollHistory.locationId, filters.locationId));
    }

    return this.db
      .select()
      .from(payrollHistory)
      .where(and(...conditions))
      .leftJoin(staff, eq(payrollHistory.staffId, staff.id))
      .leftJoin(locations, eq(payrollHistory.locationId, locations.id))
      .orderBy(desc(payrollHistory.startDate));
  }

  async calculatePayroll(
    staffId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{
    regularHours: number;
    overtimeHours: number;
    serviceRevenue: number;
    productRevenue: number;
    commission: number;
    totalPay: number;
  }> {
    // Get time clock entries
    const timeEntries = await this.getTimeClockEntries(staffId, startDate, endDate);
    
    // Calculate hours
    const totalMinutes = timeEntries.reduce((total, entry) => {
      if (!entry.clockOutTime) return total;
      const duration = entry.clockOutTime.getTime() - entry.clockInTime.getTime();
      return total + duration / (1000 * 60);
    }, 0);

    const totalHours = totalMinutes / 60;
    const regularHours = Math.min(totalHours, 40);
    const overtimeHours = Math.max(0, totalHours - 40);

    // Get service revenue
    const serviceRevenue = await this.calculateServiceRevenue(staffId, startDate, endDate);
    
    // Get product revenue
    const productRevenue = await this.calculateProductRevenue(staffId, startDate, endDate);

    // Calculate commission
    const staffMember = await this.findById(staffId);
    const commissionRate = staffMember?.commissionRate || 0;
    const commission = (serviceRevenue + productRevenue) * commissionRate;

    // Calculate total pay
    const hourlyRate = staffMember?.hourlyRate || 0;
    const totalPay = (regularHours * hourlyRate) +
                    (overtimeHours * hourlyRate * 1.5) +
                    commission;

    return {
      regularHours,
      overtimeHours,
      serviceRevenue,
      productRevenue,
      commission,
      totalPay
    };
  }

  private async calculateServiceRevenue(
    staffId: number,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const result = await this.db
      .select({
        total: sql`SUM(${services.price})`
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.staffId, staffId),
          between(appointments.date, startDate, endDate),
          eq(appointments.status, 'completed')
        )
      )
      .leftJoin(services, eq(appointments.serviceId, services.id));

    return result[0]?.total || 0;
  }

  private async calculateProductRevenue(
    staffId: number,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    // Implementation would depend on your product sales schema
    return 0;
  }

  private async getAssignedLocations(staffId: number): Promise<any[]> {
    const staffMember = await this.db
      .select()
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);

    if (!staffMember[0]?.locationIds?.length) return [];

    return this.db
      .select({
        id: locations.id,
        name: locations.name
      })
      .from(locations)
      .where(eq(locations.id, staffMember[0].locationIds));
  }

  private async getUpcomingAppointments(staffId: number): Promise<any[]> {
    return this.db
      .select({
        id: appointments.id,
        date: appointments.date,
        time: appointments.time,
        clientName: sql`${users.firstName} || ' ' || ${users.lastName}`,
        serviceName: services.name
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.staffId, staffId),
          sql`${appointments.date} >= CURRENT_DATE`
        )
      )
      .leftJoin(users, eq(appointments.clientId, users.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .orderBy(appointments.date, appointments.time)
      .limit(10);
  }
}
