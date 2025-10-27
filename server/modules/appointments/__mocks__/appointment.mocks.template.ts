import type {
  Appointment,
  AppointmentWithRelations,
  CreateAppointmentDTO,
  AppointmentStatus
} from '../types/appointment.types.template';

export const mockCreateAppointmentDTO = (
  overrides: Partial<CreateAppointmentDTO> = {}
): CreateAppointmentDTO => ({
  clientId: 1,
  staffId: 1,
  serviceId: 1,
  date: '2025-10-25',
  time: '10:00',
  notes: 'Test appointment',
  locationId: 1,
  ...overrides
});

export const mockAppointment = (
  overrides: Partial<AppointmentWithRelations> = {}
): AppointmentWithRelations => ({
  id: 1,
  clientId: 1,
  staffId: 1,
  serviceId: 1,
  date: new Date('2025-10-25'),
  time: '10:00',
  duration: 60,
  price: 100,
  status: 'pending' as AppointmentStatus,
  notes: 'Test appointment',
  locationId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '123-456-7890'
  },
  staff: {
    id: 1,
    user: {
      id: 1,
      firstName: 'Jane',
      lastName: 'Smith'
    },
    title: 'Stylist'
  },
  service: {
    id: 1,
    name: 'Haircut',
    duration: 60,
    price: 100,
    description: 'Basic haircut'
  },
  location: {
    id: 1,
    name: 'Main Salon'
  },
  ...overrides
});

export const mockAppointmentFilters = () => ({
  startDate: new Date('2025-10-25'),
  endDate: new Date('2025-10-26'),
  staffId: 1,
  clientId: 1,
  serviceId: 1,
  locationId: 1,
  status: ['pending']
});

export const mockDatabase = {
  query: jest.fn(),
  transaction: jest.fn()
};
