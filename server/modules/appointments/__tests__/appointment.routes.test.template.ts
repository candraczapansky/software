import request from 'supertest';
import express from 'express';
import { AppointmentController } from '../controllers/appointment.controller.template';
import { AppointmentService } from '../services/appointment.service.template';
import { mockCreateAppointmentDTO, mockAppointment } from '../__mocks__/appointment.mocks.template';
import { errorHandler } from '../../../shared/middleware/error-handler.template';

jest.mock('../services/appointment.service.template');

describe('Appointment Routes', () => {
  let app: express.Application;
  let appointmentService: jest.Mocked<AppointmentService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create Express app
    app = express();
    app.use(express.json());

    // Setup mocked service
    appointmentService = new AppointmentService(null) as jest.Mocked<AppointmentService>;

    // Initialize controller with mocked service
    const appointmentController = new AppointmentController(appointmentService);

    // Setup routes
    app.use('/api/appointments', appointmentController.router);

    // Add error handler
    app.use(errorHandler);
  });

  describe('POST /api/appointments', () => {
    it('should create a new appointment', async () => {
      // Arrange
      const createDTO = mockCreateAppointmentDTO();
      const createdAppointment = mockAppointment();
      appointmentService.createAppointment.mockResolvedValue(createdAppointment);

      // Act
      const response = await request(app)
        .post('/api/appointments')
        .send(createDTO);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(createdAppointment);
      expect(appointmentService.createAppointment).toHaveBeenCalledWith(createDTO);
    });

    it('should return validation error for invalid data', async () => {
      // Arrange
      const invalidDTO = {
        // Missing required fields
      };

      // Act
      const response = await request(app)
        .post('/api/appointments')
        .send(invalidDTO);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should return appointment by ID', async () => {
      // Arrange
      const appointment = mockAppointment();
      appointmentService.getAppointment.mockResolvedValue(appointment);

      // Act
      const response = await request(app)
        .get(`/api/appointments/${appointment.id}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(appointment);
    });

    it('should return 404 for non-existent appointment', async () => {
      // Arrange
      appointmentService.getAppointment.mockRejectedValue(new Error('Not found'));

      // Act
      const response = await request(app)
        .get('/api/appointments/999');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/appointments/:id', () => {
    it('should update existing appointment', async () => {
      // Arrange
      const appointment = mockAppointment();
      const updateDTO = {
        notes: 'Updated notes'
      };
      const updatedAppointment = { ...appointment, ...updateDTO };
      appointmentService.updateAppointment.mockResolvedValue(updatedAppointment);

      // Act
      const response = await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .send(updateDTO);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updatedAppointment);
    });

    it('should return validation error for invalid update data', async () => {
      // Arrange
      const invalidDTO = {
        status: 'invalid_status'
      };

      // Act
      const response = await request(app)
        .put('/api/appointments/1')
        .send(invalidDTO);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/appointments/:id/cancel', () => {
    it('should cancel appointment', async () => {
      // Arrange
      const appointment = mockAppointment();
      appointmentService.cancelAppointment.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post(`/api/appointments/${appointment.id}/cancel`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(appointment.id);
    });

    it('should return error when cancellation fails', async () => {
      // Arrange
      appointmentService.cancelAppointment.mockRejectedValue(new Error('Cannot cancel'));

      // Act
      const response = await request(app)
        .post('/api/appointments/1/cancel');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/appointments', () => {
    it('should return filtered appointments', async () => {
      // Arrange
      const appointments = [mockAppointment(), mockAppointment()];
      appointmentService.findAppointments.mockResolvedValue(appointments);

      // Act
      const response = await request(app)
        .get('/api/appointments')
        .query({
          startDate: '2025-10-25',
          staffId: '1'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(appointments);
      expect(appointmentService.findAppointments).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        staffId: 1
      });
    });

    it('should handle invalid query parameters', async () => {
      // Arrange & Act
      const response = await request(app)
        .get('/api/appointments')
        .query({
          startDate: 'invalid-date'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
