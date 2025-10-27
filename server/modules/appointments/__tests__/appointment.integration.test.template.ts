import { Database } from '../../../core/database';
import { AppointmentService } from '../services/appointment.service.template';
import { AppointmentRepository } from '../repositories/appointment.repository.template';
import { mockCreateAppointmentDTO, mockAppointmentFilters } from '../__mocks__/appointment.mocks.template';
import { setupTestDatabase, clearTestDatabase } from '../../../test/helpers/database';

describe('Appointment Integration Tests', () => {
  let db: Database;
  let appointmentService: AppointmentService;
  let appointmentRepository: AppointmentRepository;

  beforeAll(async () => {
    // Setup test database
    db = await setupTestDatabase();
    appointmentRepository = new AppointmentRepository(db);
    appointmentService = new AppointmentService(appointmentRepository);
  });

  afterAll(async () => {
    // Cleanup database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await clearTestDatabase(db);
  });

  describe('Appointment Creation Flow', () => {
    it('should create and retrieve an appointment', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO();

      // Act
      const created = await appointmentService.createAppointment(createDTO);
      const retrieved = await appointmentService.getAppointment(created.id);

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.clientId).toBe(createDTO.clientId);
      expect(retrieved.staffId).toBe(createDTO.staffId);
      expect(retrieved.serviceId).toBe(createDTO.serviceId);
    });

    it('should create recurring appointments', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO({
        isRecurring: true,
        recurringConfig: {
          frequency: 'weekly',
          count: 4
        }
      });

      // Act
      await appointmentService.createAppointment(createDTO);
      const appointments = await appointmentService.findAppointments({
        clientId: createDTO.clientId
      });

      // Assert
      expect(appointments).toHaveLength(4);
      appointments.forEach(appointment => {
        expect(appointment.clientId).toBe(createDTO.clientId);
        expect(appointment.staffId).toBe(createDTO.staffId);
        expect(appointment.serviceId).toBe(createDTO.serviceId);
      });
    });
  });

  describe('Appointment Update Flow', () => {
    it('should update appointment details', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO();
      const created = await appointmentService.createAppointment(createDTO);
      const updateDTO = {
        notes: 'Updated test notes',
        status: 'confirmed' as const
      };

      // Act
      const updated = await appointmentService.updateAppointment(created.id, updateDTO);

      // Assert
      expect(updated.notes).toBe(updateDTO.notes);
      expect(updated.status).toBe(updateDTO.status);
    });

    it('should handle concurrent updates correctly', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO();
      const created = await appointmentService.createAppointment(createDTO);

      // Act
      const updates = [
        appointmentService.updateAppointment(created.id, { notes: 'Update 1' }),
        appointmentService.updateAppointment(created.id, { notes: 'Update 2' })
      ];

      // Assert
      await expect(Promise.all(updates)).resolves.toBeDefined();
      const final = await appointmentService.getAppointment(created.id);
      expect(['Update 1', 'Update 2']).toContain(final.notes);
    });
  });

  describe('Appointment Search Flow', () => {
    it('should find appointments by filters', async () => {
      // Arrange
      const appointment1 = await appointmentService.createAppointment(
        mockCreateAppointmentDTO({ staffId: 1 })
      );
      const appointment2 = await appointmentService.createAppointment(
        mockCreateAppointmentDTO({ staffId: 2 })
      );

      // Act
      const filters = mockAppointmentFilters();
      filters.staffId = 1;
      const results = await appointmentService.findAppointments(filters);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(appointment1.id);
    });

    it('should handle date range searches correctly', async () => {
      // Arrange
      await appointmentService.createAppointment(
        mockCreateAppointmentDTO({ date: '2025-10-25' })
      );
      await appointmentService.createAppointment(
        mockCreateAppointmentDTO({ date: '2025-10-26' })
      );

      // Act
      const filters = mockAppointmentFilters();
      filters.startDate = new Date('2025-10-25');
      filters.endDate = new Date('2025-10-25');
      const results = await appointmentService.findAppointments(filters);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].date.toISOString().split('T')[0]).toBe('2025-10-25');
    });
  });

  describe('Appointment Cancellation Flow', () => {
    it('should cancel an appointment and notify participants', async () => {
      // Arrange
      const created = await appointmentService.createAppointment(
        mockCreateAppointmentDTO()
      );

      // Act
      await appointmentService.cancelAppointment(created.id);
      const cancelled = await appointmentService.getAppointment(created.id);

      // Assert
      expect(cancelled.status).toBe('cancelled');
      // Additional assertions for notifications would go here
    });

    it('should handle cancellation of recurring appointments', async () => {
      // Arrange
      const created = await appointmentService.createAppointment(
        mockCreateAppointmentDTO({
          isRecurring: true,
          recurringConfig: {
            frequency: 'weekly',
            count: 4
          }
        })
      );

      // Act
      await appointmentService.cancelAppointment(created.id);
      const appointments = await appointmentService.findAppointments({
        clientId: created.clientId
      });

      // Assert
      const cancelledAppointment = appointments.find(a => a.id === created.id);
      expect(cancelledAppointment.status).toBe('cancelled');
      // Other appointments in the series should still be active
      const activeAppointments = appointments.filter(a => a.id !== created.id);
      activeAppointments.forEach(appointment => {
        expect(appointment.status).toBe('pending');
      });
    });
  });
});
