import { StaffRepository } from '../staff.repository.template';
import { Database } from '../../../db';
import { staff, staffSchedules, timeClockEntries } from '../../../schema';
import {
  mockStaff,
  mockStaffSchedule,
  mockTimeClockEntry,
  mockPayrollEntry
} from './mocks';

describe('StaffRepository', () => {
  let db: Database;
  let repository: StaffRepository;

  beforeAll(async () => {
    // Setup test database connection
    db = new Database({
      // Test database configuration
    });
    repository = new StaffRepository(db);
  });

  afterAll(async () => {
    // Close database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data
    await db.delete(staff);
    await db.delete(staffSchedules);
    await db.delete(timeClockEntries);
  });

  describe('create', () => {
    it('should create a new staff member', async () => {
      const data = mockStaff();
      const staffMember = await repository.create(data);

      expect(staffMember).toBeDefined();
      expect(staffMember.id).toBeDefined();
      expect(staffMember.userId).toBe(data.userId);
      expect(staffMember.role).toBe(data.role);
    });
  });

  describe('findById', () => {
    it('should return staff member with relations', async () => {
      const data = mockStaff();
      const created = await repository.create(data);
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.user).toBeDefined();
      expect(found.services).toBeDefined();
      expect(found.schedule).toBeDefined();
      expect(found.locations).toBeDefined();
      expect(found.appointments).toBeDefined();
    });

    it('should return null for non-existent staff member', async () => {
      const found = await repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update staff member fields', async () => {
      const data = mockStaff();
      const created = await repository.create(data);
      
      const updateData = {
        title: 'Senior Stylist',
        hourlyRate: 25
      };
      
      const updated = await repository.update(created.id, updateData);
      expect(updated.title).toBe(updateData.title);
      expect(updated.hourlyRate).toBe(updateData.hourlyRate);
    });
  });

  describe('findByFilters', () => {
    beforeEach(async () => {
      // Create test staff members
      await Promise.all([
        repository.create(mockStaff({
          locationId: 1,
          role: 'stylist',
          isActive: true
        })),
        repository.create(mockStaff({
          locationId: 1,
          role: 'assistant',
          isActive: true
        })),
        repository.create(mockStaff({
          locationId: 2,
          role: 'stylist',
          isActive: false
        }))
      ]);
    });

    it('should filter by location', async () => {
      const results = await repository.findByFilters({ locationId: 1 });
      expect(results).toHaveLength(2);
      results.forEach(staff => {
        expect(staff.locationId).toBe(1);
      });
    });

    it('should filter by role', async () => {
      const results = await repository.findByFilters({ role: 'stylist' });
      expect(results).toHaveLength(2);
      results.forEach(staff => {
        expect(staff.role).toBe('stylist');
      });
    });

    it('should filter by active status', async () => {
      const results = await repository.findByFilters({ isActive: true });
      expect(results).toHaveLength(2);
      results.forEach(staff => {
        expect(staff.isActive).toBe(true);
      });
    });
  });

  describe('services', () => {
    it('should manage service assignments', async () => {
      const staffMember = await repository.create(mockStaff());
      const serviceId = 1;
      
      // Assign service
      await repository.assignService(staffMember.id, serviceId);
      let services = await repository.getAssignedServices(staffMember.id);
      expect(services).toHaveLength(1);
      
      // Unassign service
      await repository.unassignService(staffMember.id, serviceId);
      services = await repository.getAssignedServices(staffMember.id);
      expect(services).toHaveLength(0);
    });
  });

  describe('schedule', () => {
    it('should manage staff schedules', async () => {
      const staffMember = await repository.create(mockStaff());
      const schedule = mockStaffSchedule(staffMember.id);
      
      // Create schedule
      const created = await repository.createSchedule(schedule);
      expect(created.staffId).toBe(staffMember.id);
      
      // Update schedule
      const updateData = {
        startTime: '10:00',
        endTime: '18:00'
      };
      const updated = await repository.updateSchedule(created.id, updateData);
      expect(updated.startTime).toBe(updateData.startTime);
      expect(updated.endTime).toBe(updateData.endTime);
      
      // Get schedule
      const schedules = await repository.getSchedule(staffMember.id, {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      expect(schedules).toHaveLength(1);
      
      // Delete schedule
      await repository.deleteSchedule(created.id);
      const empty = await repository.getSchedule(staffMember.id, {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      expect(empty).toHaveLength(0);
    });
  });

  describe('time clock', () => {
    it('should manage time clock entries', async () => {
      const staffMember = await repository.create(mockStaff());
      const entry = mockTimeClockEntry(staffMember.id);
      
      // Clock in
      const clockIn = await repository.clockIn(entry);
      expect(clockIn.staffId).toBe(staffMember.id);
      expect(clockIn.clockInTime).toBeDefined();
      expect(clockIn.clockOutTime).toBeNull();
      
      // Clock out
      const clockOut = await repository.clockOut(clockIn.id);
      expect(clockOut.clockOutTime).toBeDefined();
      
      // Get entries
      const entries = await repository.getTimeClockEntries(
        staffMember.id,
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date()
      );
      expect(entries).toHaveLength(1);
    });
  });

  describe('payroll', () => {
    it('should calculate payroll correctly', async () => {
      const staffMember = await repository.create(mockStaff({
        hourlyRate: 20,
        commissionRate: 0.4
      }));
      
      // Create time entries for 45 hours
      const entry = mockTimeClockEntry(staffMember.id);
      await repository.clockIn(entry);
      await repository.clockOut(entry.id);
      
      // Calculate payroll
      const payroll = await repository.calculatePayroll(
        staffMember.id,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      expect(payroll.regularHours).toBeDefined();
      expect(payroll.overtimeHours).toBeDefined();
      expect(payroll.serviceRevenue).toBeDefined();
      expect(payroll.productRevenue).toBeDefined();
      expect(payroll.commission).toBeDefined();
      expect(payroll.totalPay).toBeDefined();
    });

    it('should create and retrieve payroll history', async () => {
      const staffMember = await repository.create(mockStaff());
      const entry = mockPayrollEntry(staffMember.id);
      
      // Create payroll entry
      const created = await repository.createPayrollEntry(entry);
      expect(created.staffId).toBe(staffMember.id);
      
      // Get payroll history
      const history = await repository.getPayrollHistory(staffMember.id, {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      });
      expect(history).toHaveLength(1);
    });
  });
});
