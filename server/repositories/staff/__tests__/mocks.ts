import type {
  InsertStaff,
  InsertStaffSchedule,
  InsertTimeClockEntry,
  InsertPayrollHistory
} from '../models/types';

export const mockStaff = (overrides: Partial<InsertStaff> = {}): InsertStaff => ({
  userId: 1,
  role: 'stylist',
  title: 'Stylist',
  locationId: 1,
  locationIds: [1],
  isActive: true,
  hourlyRate: 20,
  commissionRate: 0.4,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockStaffSchedule = (
  staffId: number,
  overrides: Partial<InsertStaffSchedule> = {}
): InsertStaffSchedule => ({
  staffId,
  locationId: 1,
  dayOfWeek: 1, // Monday
  startTime: '09:00',
  endTime: '17:00',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockTimeClockEntry = (
  staffId: number,
  overrides: Partial<InsertTimeClockEntry> = {}
): InsertTimeClockEntry => ({
  staffId,
  locationId: 1,
  clockInTime: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
  clockOutTime: new Date(),
  notes: 'Regular shift',
  ...overrides
});

export const mockPayrollEntry = (
  staffId: number,
  overrides: Partial<InsertPayrollHistory> = {}
): InsertPayrollHistory => ({
  staffId,
  locationId: 1,
  startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago
  endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
  regularHours: 40,
  overtimeHours: 5,
  serviceRevenue: 2000,
  productRevenue: 500,
  commission: 1000,
  totalPay: 2000,
  createdAt: new Date(),
  ...overrides
});
