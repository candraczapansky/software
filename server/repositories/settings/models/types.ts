import { InferModel } from 'drizzle-orm';
import { businessSettings, automationRules, emailTemplates } from '../../../schema';

// Base types from schema
export type BusinessSettings = InferModel<typeof businessSettings>;
export type AutomationRule = InferModel<typeof automationRules>;
export type EmailTemplate = InferModel<typeof emailTemplates>;

// Insert types
export type InsertBusinessSettings = InferModel<typeof businessSettings, 'insert'>;
export type InsertAutomationRule = InferModel<typeof automationRules, 'insert'>;
export type InsertEmailTemplate = InferModel<typeof emailTemplates, 'insert'>;

// Business Hours
export interface BusinessHours {
  dayOfWeek: number;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breakStart?: string;
  breakEnd?: string;
}

// Notification Settings
export interface NotificationSettings {
  email: {
    appointmentReminders: boolean;
    appointmentConfirmations: boolean;
    marketingEmails: boolean;
    staffNotifications: boolean;
    adminReports: boolean;
  };
  sms: {
    appointmentReminders: boolean;
    appointmentConfirmations: boolean;
    marketingMessages: boolean;
    staffNotifications: boolean;
  };
}

// Integration Settings
export interface IntegrationSettings {
  helcim?: {
    apiKey?: string;
    terminalId?: string;
    webhookUrl?: string;
    testMode: boolean;
  };
  twilio?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    webhookUrl?: string;
  };
  sendgrid?: {
    apiKey?: string;
    fromEmail?: string;
    fromName?: string;
  };
  openai?: {
    apiKey?: string;
    model: string;
    maxTokens: number;
  };
}

// Extended types with relations
export interface BusinessSettingsWithRelations extends BusinessSettings {
  businessHours: BusinessHours[];
  notifications: NotificationSettings;
  integrations: IntegrationSettings;
  locations: Array<{
    id: number;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  }>;
}

export interface AutomationRuleWithRelations extends AutomationRule {
  trigger: {
    event: string;
    conditions: Record<string, any>;
  };
  actions: Array<{
    type: string;
    params: Record<string, any>;
  }>;
}

export interface EmailTemplateWithRelations extends EmailTemplate {
  variables: string[];
  preview?: string;
}

// Repository interface
export interface ISettingsRepository {
  // Business Settings
  getBusinessSettings(): Promise<BusinessSettingsWithRelations>;
  updateBusinessSettings(data: Partial<InsertBusinessSettings>): Promise<BusinessSettings>;
  
  // Business Hours
  setBusinessHours(locationId: number, hours: BusinessHours[]): Promise<void>;
  getBusinessHours(locationId: number): Promise<BusinessHours[]>;
  
  // Notification Settings
  updateNotificationSettings(settings: NotificationSettings): Promise<void>;
  getNotificationSettings(): Promise<NotificationSettings>;
  
  // Integration Settings
  updateIntegrationSettings(settings: IntegrationSettings): Promise<void>;
  getIntegrationSettings(): Promise<IntegrationSettings>;
  
  // Automation Rules
  createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule>;
  getAutomationRule(id: number): Promise<AutomationRuleWithRelations | null>;
  updateAutomationRule(id: number, data: Partial<InsertAutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: number): Promise<void>;
  getAutomationRules(): Promise<AutomationRuleWithRelations[]>;
  
  // Email Templates
  createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate>;
  getEmailTemplate(id: number): Promise<EmailTemplateWithRelations | null>;
  updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate>;
  deleteEmailTemplate(id: number): Promise<void>;
  getEmailTemplates(): Promise<EmailTemplateWithRelations[]>;
  
  // System Configuration
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;
}
