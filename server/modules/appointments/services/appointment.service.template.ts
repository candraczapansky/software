import { AppointmentRepository } from '../repositories/appointment.repository.template';
import { NotFoundError, ValidationError } from '../../../shared/middleware/error-handler.template';
import type {
  Appointment,
  AppointmentWithRelations,
  CreateAppointmentDTO,
  UpdateAppointmentDTO,
  AppointmentFilters
} from '../types/appointment.types.template';

export class AppointmentService {
  constructor(private appointmentRepository: AppointmentRepository) {}

  async createAppointment(data: CreateAppointmentDTO): Promise<AppointmentWithRelations> {
    // Validate business rules
    await this.validateAppointmentCreation(data);

    // Create appointment
    const appointment = await this.appointmentRepository.create(data);

    // Handle recurring appointments if needed
    if (data.isRecurring && data.recurringConfig) {
      await this.createRecurringAppointments(appointment.id, data);
    }

    // Send notifications
    await this.notifyParticipants(appointment.id, 'creation');

    return this.appointmentRepository.findById(appointment.id);
  }

  async updateAppointment(
    id: number,
    data: UpdateAppointmentDTO
  ): Promise<AppointmentWithRelations> {
    // Validate business rules
    await this.validateAppointmentUpdate(id, data);

    // Update appointment
    const appointment = await this.appointmentRepository.update(id, data);

    // Send notifications if status changed
    if (data.status) {
      await this.notifyParticipants(id, 'status_change');
    }

    return this.appointmentRepository.findById(appointment.id);
  }

  async cancelAppointment(id: number): Promise<void> {
    const appointment = await this.appointmentRepository.findById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    // Check if appointment can be cancelled
    if (!this.canBeCancelled(appointment)) {
      throw new ValidationError('Appointment cannot be cancelled');
    }

    // Update status
    await this.appointmentRepository.update(id, { status: 'cancelled' });

    // Send notifications
    await this.notifyParticipants(id, 'cancellation');
  }

  async getAppointment(id: number): Promise<AppointmentWithRelations> {
    const appointment = await this.appointmentRepository.findById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    return appointment;
  }

  async findAppointments(
    filters: AppointmentFilters
  ): Promise<AppointmentWithRelations[]> {
    return this.appointmentRepository.findByFilters(filters);
  }

  private async validateAppointmentCreation(
    data: CreateAppointmentDTO
  ): Promise<void> {
    // Check if staff is available
    const isStaffAvailable = await this.checkStaffAvailability(
      data.staffId,
      data.date,
      data.time
    );
    if (!isStaffAvailable) {
      throw new ValidationError('Staff is not available at selected time');
    }

    // Check if service can be performed by staff
    const canPerformService = await this.checkStaffService(
      data.staffId,
      data.serviceId
    );
    if (!canPerformService) {
      throw new ValidationError('Staff cannot perform selected service');
    }

    // Validate date is in future
    if (new Date(`${data.date} ${data.time}`) <= new Date()) {
      throw new ValidationError('Appointment must be in the future');
    }
  }

  private async validateAppointmentUpdate(
    id: number,
    data: UpdateAppointmentDTO
  ): Promise<void> {
    const appointment = await this.appointmentRepository.findById(id);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    // Check if appointment can be updated
    if (appointment.status === 'cancelled') {
      throw new ValidationError('Cancelled appointments cannot be updated');
    }

    if (data.staffId || data.date || data.time) {
      // Check new staff availability if staff/time is being changed
      const isStaffAvailable = await this.checkStaffAvailability(
        data.staffId || appointment.staffId,
        data.date || appointment.date.toISOString().split('T')[0],
        data.time || appointment.time
      );
      if (!isStaffAvailable) {
        throw new ValidationError('Staff is not available at selected time');
      }
    }

    if (data.serviceId) {
      // Check if new service can be performed by staff
      const canPerformService = await this.checkStaffService(
        appointment.staffId,
        data.serviceId
      );
      if (!canPerformService) {
        throw new ValidationError('Staff cannot perform selected service');
      }
    }
  }

  private async checkStaffAvailability(
    staffId: number,
    date: string,
    time: string
  ): Promise<boolean> {
    // Implementation would check staff schedule and existing appointments
    return true; // Placeholder
  }

  private async checkStaffService(
    staffId: number,
    serviceId: number
  ): Promise<boolean> {
    // Implementation would check if staff can perform service
    return true; // Placeholder
  }

  private canBeCancelled(appointment: Appointment): boolean {
    // Implementation would check business rules for cancellation
    return appointment.status !== 'cancelled' &&
           appointment.status !== 'completed';
  }

  private async createRecurringAppointments(
    originalId: number,
    data: CreateAppointmentDTO
  ): Promise<void> {
    // Implementation would create recurring appointments
  }

  private async notifyParticipants(
    appointmentId: number,
    type: 'creation' | 'status_change' | 'cancellation'
  ): Promise<void> {
    // Implementation would send notifications
  }
}
