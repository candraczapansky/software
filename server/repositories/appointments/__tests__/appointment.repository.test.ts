import { AppointmentRepository } from '../appointment.repository.template';
import { Database } from '../../../db';
import { appointments } from '../../../schema';
import { mockAppointment, mockAppointmentHistory } from './mocks';

describe('AppointmentRepository', () => {
  let db: Database;
  let repository: AppointmentRepository;

  beforeAll(async () => {
    // Setup test database connection
    db = new Database({
      // Test database configuration
    });
    repository = new AppointmentRepository(db);
  });

  afterAll(async () => {
    // Close database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data
    await db.delete(appointments);
  });

  describe('create', () => {
    it('should create a new appointment', async () => {
      const data = mockAppointment();
      const appointment = await repository.create(data);

      expect(appointment).toBeDefined();
      expect(appointment.id).toBeDefined();
      expect(appointment.clientId).toBe(data.clientId);
      expect(appointment.staffId).toBe(data.staffId);
      expect(appointment.serviceId).toBe(data.serviceId);
    });
  });

  describe('findById', () => {
    it('should return appointment with relations', async () => {
      const data = mockAppointment();
      const created = await repository.create(data);
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.client).toBeDefined();
      expect(found.staff).toBeDefined();
      expect(found.service).toBeDefined();
      expect(found.location).toBeDefined();
    });

    it('should return null for non-existent appointment', async () => {
      const found = await repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update appointment fields', async () => {
      const data = mockAppointment();
      const created = await repository.create(data);
      
      const updateData = {
        notes: 'Updated notes'
      };
      
      const updated = await repository.update(created.id, updateData);
      expect(updated.notes).toBe(updateData.notes);
    });
  });

  describe('findByFilters', () => {
    beforeEach(async () => {
      // Create test appointments
      await Promise.all([
        repository.create(mockAppointment({ staffId: 1, date: new Date('2025-10-25') })),
        repository.create(mockAppointment({ staffId: 1, date: new Date('2025-10-26') })),
        repository.create(mockAppointment({ staffId: 2, date: new Date('2025-10-25') }))
      ]);
    });

    it('should filter by staff', async () => {
      const results = await repository.findByFilters({ staffId: 1 });
      expect(results).toHaveLength(2);
      results.forEach(appointment => {
        expect(appointment.staffId).toBe(1);
      });
    });

    it('should filter by date range', async () => {
      const results = await repository.findByFilters({
        startDate: new Date('2025-10-25'),
        endDate: new Date('2025-10-25')
      });
      expect(results).toHaveLength(2);
    });

    it('should combine multiple filters', async () => {
      const results = await repository.findByFilters({
        staffId: 1,
        startDate: new Date('2025-10-25'),
        endDate: new Date('2025-10-25')
      });
      expect(results).toHaveLength(1);
    });
  });

  describe('appointment history', () => {
    it('should add and retrieve history', async () => {
      const appointment = await repository.create(mockAppointment());
      const history = mockAppointmentHistory(appointment.id);
      
      await repository.addHistory(history);
      const records = await repository.getHistory(appointment.id);
      
      expect(records).toHaveLength(1);
      expect(records[0].appointmentId).toBe(appointment.id);
    });
  });

  describe('appointment cancellation', () => {
    it('should cancel appointment and create cancellation record', async () => {
      const appointment = await repository.create(mockAppointment());
      const reason = 'Client requested';
      
      const cancellation = await repository.cancel(appointment.id, reason);
      expect(cancellation.appointmentId).toBe(appointment.id);
      expect(cancellation.reason).toBe(reason);
      
      const updated = await repository.findById(appointment.id);
      expect(updated.status).toBe('cancelled');
    });
  });

  describe('add-on services', () => {
    it('should manage add-on services', async () => {
      const appointment = await repository.create(mockAppointment());
      
      // Add add-ons
      await repository.setAddOns(appointment.id, [1, 2]);
      let addOns = await repository.getAddOns(appointment.id);
      expect(addOns).toEqual([1, 2]);
      
      // Add another
      await repository.addAddOn(appointment.id, 3);
      addOns = await repository.getAddOns(appointment.id);
      expect(addOns).toEqual([1, 2, 3]);
      
      // Remove one
      await repository.removeAddOn(appointment.id, 2);
      addOns = await repository.getAddOns(appointment.id);
      expect(addOns).toEqual([1, 3]);
    });
  });
});
