import { Request, Response, NextFunction, Router } from 'express';
import { AppointmentService } from '../services/appointment.service.template';
import { validate } from '../../../shared/middleware/validation.template';
import { createAppointmentSchema, updateAppointmentSchema } from '../types/appointment.types.template';
import { AuthenticatedRequest } from '../../../shared/types';

export class AppointmentController {
  public router = Router();
  
  constructor(private appointmentService: AppointmentService) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // Create appointment
    this.router.post(
      '/',
      validate(createAppointmentSchema),
      this.createAppointment.bind(this)
    );

    // Get appointment by ID
    this.router.get(
      '/:id',
      this.getAppointment.bind(this)
    );

    // Update appointment
    this.router.put(
      '/:id',
      validate(updateAppointmentSchema),
      this.updateAppointment.bind(this)
    );

    // Cancel appointment
    this.router.post(
      '/:id/cancel',
      this.cancelAppointment.bind(this)
    );

    // Get appointments with filters
    this.router.get(
      '/',
      this.findAppointments.bind(this)
    );
  }

  private async createAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const appointment = await this.appointmentService.createAppointment({
        ...req.body,
        // Add user context if needed
        createdBy: req.user?.id
      });

      res.status(201).json({
        success: true,
        data: appointment
      });
    } catch (error) {
      next(error);
    }
  }

  private async getAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const appointment = await this.appointmentService.getAppointment(
        parseInt(req.params.id)
      );

      res.json({
        success: true,
        data: appointment
      });
    } catch (error) {
      next(error);
    }
  }

  private async updateAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const appointment = await this.appointmentService.updateAppointment(
        parseInt(req.params.id),
        {
          ...req.body,
          // Add user context if needed
          updatedBy: req.user?.id
        }
      );

      res.json({
        success: true,
        data: appointment
      });
    } catch (error) {
      next(error);
    }
  }

  private async cancelAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      await this.appointmentService.cancelAppointment(
        parseInt(req.params.id)
      );

      res.json({
        success: true,
        message: 'Appointment cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  private async findAppointments(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      // Parse query parameters
      const filters = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        staffId: req.query.staffId ? parseInt(req.query.staffId as string) : undefined,
        clientId: req.query.clientId ? parseInt(req.query.clientId as string) : undefined,
        serviceId: req.query.serviceId ? parseInt(req.query.serviceId as string) : undefined,
        locationId: req.query.locationId ? parseInt(req.query.locationId as string) : undefined,
        status: req.query.status ? (req.query.status as string).split(',') : undefined
      };

      const appointments = await this.appointmentService.findAppointments(filters);

      res.json({
        success: true,
        data: appointments
      });
    } catch (error) {
      next(error);
    }
  }
}
