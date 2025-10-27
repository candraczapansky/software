import type {
  InsertBusinessSettings,
  InsertAutomationRule,
  InsertEmailTemplate,
  BusinessHours,
  NotificationSettings,
  IntegrationSettings
} from '../models/types';

export const mockBusinessSettings = (
  overrides: Partial<InsertBusinessSettings> = {}
): InsertBusinessSettings => ({
  businessName: 'Test Business',
  phone: '123-456-7890',
  email: 'test@example.com',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zipCode: '12345',
  timezone: 'America/Chicago',
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockBusinessHours = (): BusinessHours[] => [
  {
    dayOfWeek: 1, // Monday
    isOpen: true,
    openTime: '09:00',
    closeTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00'
  },
  {
    dayOfWeek: 2, // Tuesday
    isOpen: true,
    openTime: '09:00',
    closeTime: '17:00'
  },
  {
    dayOfWeek: 3, // Wednesday
    isOpen: true,
    openTime: '09:00',
    closeTime: '17:00'
  },
  {
    dayOfWeek: 4, // Thursday
    isOpen: true,
    openTime: '09:00',
    closeTime: '17:00'
  },
  {
    dayOfWeek: 5, // Friday
    isOpen: true,
    openTime: '09:00',
    closeTime: '17:00'
  },
  {
    dayOfWeek: 6, // Saturday
    isOpen: true,
    openTime: '10:00',
    closeTime: '15:00'
  },
  {
    dayOfWeek: 0, // Sunday
    isOpen: false
  }
];

export const mockNotificationSettings = (): NotificationSettings => ({
  email: {
    appointmentReminders: true,
    appointmentConfirmations: true,
    marketingEmails: false,
    staffNotifications: true,
    adminReports: true
  },
  sms: {
    appointmentReminders: true,
    appointmentConfirmations: true,
    marketingMessages: false,
    staffNotifications: true
  }
});

export const mockIntegrationSettings = (): IntegrationSettings => ({
  helcim: {
    apiKey: 'test_key',
    terminalId: 'test_terminal',
    webhookUrl: 'https://example.com/webhook',
    testMode: true
  },
  twilio: {
    accountSid: 'test_sid',
    authToken: 'test_token',
    phoneNumber: '+15555555555',
    webhookUrl: 'https://example.com/sms'
  },
  sendgrid: {
    apiKey: 'test_key',
    fromEmail: 'test@example.com',
    fromName: 'Test Business'
  },
  openai: {
    apiKey: 'test_key',
    model: 'gpt-4',
    maxTokens: 150
  }
});

export const mockAutomationRule = (
  overrides: Partial<InsertAutomationRule> = {}
): InsertAutomationRule => ({
  name: 'Test Rule',
  description: 'Test automation rule',
  trigger: JSON.stringify({
    event: 'appointment.created',
    conditions: {
      serviceId: 1,
      status: 'confirmed'
    }
  }),
  actions: JSON.stringify([
    {
      type: 'send_email',
      params: {
        templateId: 1,
        to: '{client.email}',
        subject: 'Appointment Confirmation'
      }
    }
  ]),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockEmailTemplate = (
  overrides: Partial<InsertEmailTemplate> = {}
): InsertEmailTemplate => ({
  name: 'Test Template',
  description: 'Test email template',
  subject: 'Test Subject',
  htmlContent: '<p>Hello {name},</p><p>Your appointment is scheduled for {date} at {time}.</p>',
  variables: JSON.stringify(['name', 'date', 'time']),
  category: 'appointments',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});
