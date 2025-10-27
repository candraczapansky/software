import { InferModel } from 'drizzle-orm';
import { staff, staffServices, staffSchedules, timeClockEntries, payrollHistory } from '../../../schema';

// Base types from schema
export type Staff = InferModel<typeof staff>;
export type StaffService = InferModel<typeof staffServices>;
export type StaffSchedule = InferModel<typeof staffSchedules>;
export type TimeClockEntry = InferModel<typeof timeClockEntries>;
export type PayrollHistory = InferModel<typeof payrollHistory>;

// Insert types
export type InsertStaff = InferModel<typeof staff, 'insert'>;
export type InsertStaffService = InferModel<typeof staffServices, 'insert'>;
export type InsertStaffSchedule = InferModel<typeof staffSchedules, 'insert'>;
export type InsertTimeClockEntry = InferModel<typeof timeClockEntries, 'insert'>;
export type InsertPayrollHistory = InferModel<typeof payrollHistory, 'insert'>;

// Query filters
export interface StaffFilters {
  locationId?: number;
  serviceId?: number;
  isActive?: boolean;
  search?: string;
  role?: string;
}

export interface ScheduleFilters {
  startDate: Date;
  endDate: Date;
  locationId?: number;
}

export interface PayrollFilters {
  startDate: Date;
  endDate: Date;
  locationId?: number;
  includeCommissions?: boolean;
}

// Extended types with relations
export interface StaffWithRelations extends Staff {
  user?: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  services?: Array<{
    id: number;
    name: string;
    duration: number;
    price: number;
  }>;
  schedule?: Array<{
    id: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    locationId: number;
  }>;
  locations?: Array<{
    id: number;
    name: string;
  }>;
  appointments?: Array<{
    id: number;
    date: Date;
    time: string;
    clientName: string;
    serviceName: string;
  }>;
}

export interface StaffScheduleWithRelations extends StaffSchedule {
  staff?: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
  location?: {
    id: number;
    name: string;
  };
}

export interface TimeClockEntryWithRelations extends TimeClockEntry {
  staff?: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
  location?: {
    id: number;
    name: string;
  };
}

export interface PayrollHistoryWithRelations extends PayrollHistory {
  staff?: {
    id: number;
    firstName?: string;
    lastName?: string;
  };
  location?: {
    id: number;
    name: string;
  };
  details?: {
    regularHours: number;
    overtimeHours: number;
    serviceRevenue: number;
    productRevenue: number;
    commissionRate: number;
    commission: number;
    totalPay: number;
  };
}

// Repository interface
export interface IStaffRepository {
  // Basic CRUD
  create(data: InsertStaff): Promise<Staff>;
  findById(id: number): Promise<StaffWithRelations | null>;
  update(id: number, data: Partial<InsertStaff>): Promise<Staff>;
  delete(id: number): Promise<void>;
  
  // Queries
  findByFilters(filters: StaffFilters): Promise<StaffWithRelations[]>;
  findByLocation(locationId: number): Promise<StaffWithRelations[]>;
  findByService(serviceId: number): Promise<StaffWithRelations[]>;
  search(query: string): Promise<StaffWithRelations[]>;
  
  // Services
  assignService(staffId: number, serviceId: number): Promise<void>;
  unassignService(staffId: number, serviceId: number): Promise<void>;
  getAssignedServices(staffId: number): Promise<number[]>;
  
  // Schedule
  createSchedule(data: InsertStaffSchedule): Promise<StaffSchedule>;
  updateSchedule(id: number, data: Partial<InsertStaffSchedule>): Promise<StaffSchedule>;
  deleteSchedule(id: number): Promise<void>;
  getSchedule(staffId: number, filters: ScheduleFilters): Promise<StaffScheduleWithRelations[]>;
  
  // Time Clock
  clockIn(data: InsertTimeClockEntry): Promise<TimeClockEntry>;
  clockOut(entryId: number): Promise<TimeClockEntry>;
  getTimeClockEntries(staffId: number, startDate: Date, endDate: Date): Promise<TimeClockEntryWithRelations[]>;
  
  // Payroll
  createPayrollEntry(data: InsertPayrollHistory): Promise<PayrollHistory>;
  getPayrollHistory(staffId: number, filters: PayrollFilters): Promise<PayrollHistoryWithRelations[]>;
  calculatePayroll(staffId: number, startDate: Date, endDate: Date): Promise<{
    regularHours: number;
    overtimeHours: number;
    serviceRevenue: number;
    productRevenue: number;
    commission: number;
    totalPay: number;
  }>;
}
