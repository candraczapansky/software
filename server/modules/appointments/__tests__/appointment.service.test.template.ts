import { AppointmentService } from '../services/appointment.service.template';
import { AppointmentRepository } from '../repositories/appointment.repository.template';
import { NotFoundError, ValidationError } from '../../../shared/middleware/error-handler.template';
import { mockAppointment, mockCreateAppointmentDTO } from '../__mocks__/appointment.mocks.template';

// Mock the repository
jest.mock('../repositories/appointment.repository.template');

describe('AppointmentService', () => {
  let appointmentService: AppointmentService;
  let appointmentRepository: jest.Mocked<AppointmentRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create a fresh instance for each test
    appointmentRepository = new AppointmentRepository(null) as jest.Mocked<AppointmentRepository>;
    appointmentService = new AppointmentService(appointmentRepository);
  });

  describe('createAppointment', () => {
    it('should create a new appointment successfully', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO();
      appointmentRepository.create.mockResolvedValue({ id: 1, ...createDTO });
      appointmentRepository.findById.mockResolvedValue(mockAppointment());

      // Act
      const result = await appointmentService.createAppointment(createDTO);

      // Assert
      expect(appointmentRepository.create).toHaveBeenCalledWith(createDTO);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should create recurring appointments when isRecurring is true', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO({
        isRecurring: true,
        recurringConfig: {
          frequency: 'weekly',
          count: 4
        }
      });
      appointmentRepository.create.mockResolvedValue({ id: 1, ...createDTO });
      appointmentRepository.findById.mockResolvedValue(mockAppointment());

      // Act
      await appointmentService.createAppointment(createDTO);

      // Assert
      expect(appointmentRepository.create).toHaveBeenCalledTimes(4);
    });

    it('should throw ValidationError when staff is not available', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO({
        staffId: 999 // Unavailable staff
      });

      // Act & Assert
      await expect(appointmentService.createAppointment(createDTO))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('updateAppointment', () => {
    it('should update an existing appointment successfully', async () => {
      // Arrange
      const appointmentId = 1;
      const updateDTO = {
        notes: 'Updated notes'
      };
      appointmentRepository.findById.mockResolvedValue(mockAppointment());
      appointmentRepository.update.mockResolvedValue({ 
        ...mockAppointment(),
        ...updateDTO
      });

      // Act
      const result = await appointmentService.updateAppointment(appointmentId, updateDTO);

      // Assert
      expect(appointmentRepository.update).toHaveBeenCalledWith(appointmentId, updateDTO);
      expect(result.notes).toBe(updateDTO.notes);
    });

    it('should throw NotFoundError when appointment does not exist', async () => {
      // Arrange
      const appointmentId = 999;
      const updateDTO = {
        notes: 'Updated notes'
      };
      appointmentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(appointmentService.updateAppointment(appointmentId, updateDTO))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw ValidationError when updating cancelled appointment', async () => {
      // Arrange
      const appointmentId = 1;
      const updateDTO = {
        notes: 'Updated notes'
      };
      appointmentRepository.findById.mockResolvedValue(mockAppointment({
        status: 'cancelled'
      }));

      // Act & Assert
      await expect(appointmentService.updateAppointment(appointmentId, updateDTO))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel an existing appointment successfully', async () => {
      // Arrange
      const appointmentId = 1;
      appointmentRepository.findById.mockResolvedValue(mockAppointment());
      appointmentRepository.update.mockResolvedValue(mockAppointment({
        status: 'cancelled'
      }));

      // Act
      await appointmentService.cancelAppointment(appointmentId);

      // Assert
      expect(appointmentRepository.update).toHaveBeenCalledWith(appointmentId, {
        status: 'cancelled'
      });
    });

    it('should throw NotFoundError when appointment does not exist', async () => {
      // Arrange
      const appointmentId = 999;
      appointmentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(appointmentService.cancelAppointment(appointmentId))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw ValidationError when cancelling completed appointment', async () => {
      // Arrange
      const appointmentId = 1;
      appointmentRepository.findById.mockResolvedValue(mockAppointment({
        status: 'completed'
      }));

      // Act & Assert
      await expect(appointmentService.cancelAppointment(appointmentId))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('findAppointments', () => {
    it('should return filtered appointments successfully', async () => {
      // Arrange
      const filters = {
        startDate: new Date(),
        staffId: 1
      };
      const mockAppointments = [
        mockAppointment({ staffId: 1 }),
        mockAppointment({ staffId: 1 })
      ];
      appointmentRepository.findByFilters.mockResolvedValue(mockAppointments);

      // Act
      const result = await appointmentService.findAppointments(filters);

      // Assert
      expect(appointmentRepository.findByFilters).toHaveBeenCalledWith(filters);
      expect(result).toHaveLength(2);
      expect(result[0].staffId).toBe(1);
    });

    it('should return empty array when no appointments match filters', async () => {
      // Arrange
      const filters = {
        staffId: 999
      };
      appointmentRepository.findByFilters.mockResolvedValue([]);

      // Act
      const result = await appointmentService.findAppointments(filters);

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
