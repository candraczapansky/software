import { eq, and } from 'drizzle-orm';
import { Database } from '../../db';
import {
  businessSettings,
  automationRules,
  emailTemplates,
  locations,
  systemConfig
} from '../../schema';
import type {
  BusinessSettings,
  AutomationRule,
  EmailTemplate,
  BusinessSettingsWithRelations,
  AutomationRuleWithRelations,
  EmailTemplateWithRelations,
  InsertBusinessSettings,
  InsertAutomationRule,
  InsertEmailTemplate,
  BusinessHours,
  NotificationSettings,
  IntegrationSettings,
  ISettingsRepository
} from './models/types';

export class SettingsRepository implements ISettingsRepository {
  constructor(private db: Database) {}

  async getBusinessSettings(): Promise<BusinessSettingsWithRelations> {
    const [settings] = await this.db
      .select()
      .from(businessSettings)
      .limit(1);

    if (!settings) {
      throw new Error('Business settings not found');
    }

    // Get related data
    const [businessHours, notifications, integrations, businessLocations] = await Promise.all([
      this.getBusinessHours(settings.id),
      this.getNotificationSettings(),
      this.getIntegrationSettings(),
      this.getLocations()
    ]);

    return {
      ...settings,
      businessHours,
      notifications,
      integrations,
      locations: businessLocations
    };
  }

  async updateBusinessSettings(data: Partial<InsertBusinessSettings>): Promise<BusinessSettings> {
    const [updated] = await this.db
      .update(businessSettings)
      .set({ ...data, updatedAt: new Date() })
      .returning();

    return updated;
  }

  async setBusinessHours(locationId: number, hours: BusinessHours[]): Promise<void> {
    await this.setSetting(
      `business_hours_${locationId}`,
      JSON.stringify(hours)
    );
  }

  async getBusinessHours(locationId: number): Promise<BusinessHours[]> {
    const hoursJson = await this.getSetting(`business_hours_${locationId}`);
    return hoursJson ? JSON.parse(hoursJson) : [];
  }

  async updateNotificationSettings(settings: NotificationSettings): Promise<void> {
    await this.setSetting(
      'notification_settings',
      JSON.stringify(settings)
    );
  }

  async getNotificationSettings(): Promise<NotificationSettings> {
    const settingsJson = await this.getSetting('notification_settings');
    return settingsJson ? JSON.parse(settingsJson) : {
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
    };
  }

  async updateIntegrationSettings(settings: IntegrationSettings): Promise<void> {
    await this.setSetting(
      'integration_settings',
      JSON.stringify(settings)
    );
  }

  async getIntegrationSettings(): Promise<IntegrationSettings> {
    const settingsJson = await this.getSetting('integration_settings');
    return settingsJson ? JSON.parse(settingsJson) : {
      helcim: { testMode: true },
      twilio: {},
      sendgrid: {},
      openai: { model: 'gpt-4', maxTokens: 150 }
    };
  }

  async createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule> {
    const [rule] = await this.db
      .insert(automationRules)
      .values(data)
      .returning();

    return rule;
  }

  async getAutomationRule(id: number): Promise<AutomationRuleWithRelations | null> {
    const [rule] = await this.db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .limit(1);

    if (!rule) return null;

    return {
      ...rule,
      trigger: JSON.parse(rule.trigger),
      actions: JSON.parse(rule.actions)
    };
  }

  async updateAutomationRule(id: number, data: Partial<InsertAutomationRule>): Promise<AutomationRule> {
    const [updated] = await this.db
      .update(automationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(automationRules.id, id))
      .returning();

    return updated;
  }

  async deleteAutomationRule(id: number): Promise<void> {
    await this.db
      .delete(automationRules)
      .where(eq(automationRules.id, id));
  }

  async getAutomationRules(): Promise<AutomationRuleWithRelations[]> {
    const rules = await this.db
      .select()
      .from(automationRules)
      .orderBy(automationRules.name);

    return rules.map(rule => ({
      ...rule,
      trigger: JSON.parse(rule.trigger),
      actions: JSON.parse(rule.actions)
    }));
  }

  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await this.db
      .insert(emailTemplates)
      .values(data)
      .returning();

    return template;
  }

  async getEmailTemplate(id: number): Promise<EmailTemplateWithRelations | null> {
    const [template] = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .limit(1);

    if (!template) return null;

    return {
      ...template,
      variables: JSON.parse(template.variables),
      preview: await this.generateTemplatePreview(template)
    };
  }

  async updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate> {
    const [updated] = await this.db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();

    return updated;
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    await this.db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, id));
  }

  async getEmailTemplates(): Promise<EmailTemplateWithRelations[]> {
    const templates = await this.db
      .select()
      .from(emailTemplates)
      .orderBy(emailTemplates.name);

    return Promise.all(
      templates.map(async template => ({
        ...template,
        variables: JSON.parse(template.variables),
        preview: await this.generateTemplatePreview(template)
      }))
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const [setting] = await this.db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);

    return setting?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db
      .insert(systemConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: { value }
      });
  }

  async deleteSetting(key: string): Promise<void> {
    await this.db
      .delete(systemConfig)
      .where(eq(systemConfig.key, key));
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const settings = await this.db
      .select()
      .from(systemConfig);

    return settings.reduce((acc, setting) => ({
      ...acc,
      [setting.key]: setting.value
    }), {});
  }

  private async getLocations(): Promise<any[]> {
    return this.db
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        phone: locations.phone,
        email: locations.email
      })
      .from(locations)
      .orderBy(locations.name);
  }

  private async generateTemplatePreview(template: EmailTemplate): Promise<string> {
    const sampleData = template.variables.reduce((acc, variable) => ({
      ...acc,
      [variable]: `[${variable}]`
    }), {});

    return template.htmlContent.replace(
      /\{([^}]+)\}/g,
      (match, variable) => sampleData[variable] || match
    );
  }
}
