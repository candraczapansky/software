import { SettingsRepository } from '../settings.repository.template';
import { Database } from '../../../db';
import { businessSettings, automationRules, emailTemplates } from '../../../schema';
import {
  mockBusinessSettings,
  mockAutomationRule,
  mockEmailTemplate,
  mockBusinessHours,
  mockNotificationSettings,
  mockIntegrationSettings
} from './mocks';

describe('SettingsRepository', () => {
  let db: Database;
  let repository: SettingsRepository;

  beforeAll(async () => {
    // Setup test database connection
    db = new Database({
      // Test database configuration
    });
    repository = new SettingsRepository(db);
  });

  afterAll(async () => {
    // Close database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data
    await db.delete(businessSettings);
    await db.delete(automationRules);
    await db.delete(emailTemplates);
  });

  describe('business settings', () => {
    it('should get and update business settings', async () => {
      // Create initial settings
      const settings = mockBusinessSettings();
      await db.insert(businessSettings).values(settings);

      // Get settings
      const retrieved = await repository.getBusinessSettings();
      expect(retrieved).toBeDefined();
      expect(retrieved.businessHours).toBeDefined();
      expect(retrieved.notifications).toBeDefined();
      expect(retrieved.integrations).toBeDefined();
      expect(retrieved.locations).toBeDefined();

      // Update settings
      const updateData = {
        businessName: 'Updated Name',
        phone: '555-0123'
      };
      const updated = await repository.updateBusinessSettings(updateData);
      expect(updated.businessName).toBe(updateData.businessName);
      expect(updated.phone).toBe(updateData.phone);
    });
  });

  describe('business hours', () => {
    it('should manage business hours', async () => {
      const locationId = 1;
      const hours = mockBusinessHours();

      // Set hours
      await repository.setBusinessHours(locationId, hours);

      // Get hours
      const retrieved = await repository.getBusinessHours(locationId);
      expect(retrieved).toEqual(hours);
    });
  });

  describe('notification settings', () => {
    it('should manage notification settings', async () => {
      const settings = mockNotificationSettings();

      // Update settings
      await repository.updateNotificationSettings(settings);

      // Get settings
      const retrieved = await repository.getNotificationSettings();
      expect(retrieved).toEqual(settings);
    });
  });

  describe('integration settings', () => {
    it('should manage integration settings', async () => {
      const settings = mockIntegrationSettings();

      // Update settings
      await repository.updateIntegrationSettings(settings);

      // Get settings
      const retrieved = await repository.getIntegrationSettings();
      expect(retrieved).toEqual(settings);
    });
  });

  describe('automation rules', () => {
    it('should manage automation rules', async () => {
      const rule = mockAutomationRule();

      // Create rule
      const created = await repository.createAutomationRule(rule);
      expect(created.id).toBeDefined();

      // Get rule
      const retrieved = await repository.getAutomationRule(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.trigger).toBeDefined();
      expect(retrieved.actions).toBeDefined();

      // Update rule
      const updateData = {
        name: 'Updated Rule',
        isActive: false
      };
      const updated = await repository.updateAutomationRule(created.id, updateData);
      expect(updated.name).toBe(updateData.name);
      expect(updated.isActive).toBe(updateData.isActive);

      // Get all rules
      const rules = await repository.getAutomationRules();
      expect(rules).toHaveLength(1);

      // Delete rule
      await repository.deleteAutomationRule(created.id);
      const deleted = await repository.getAutomationRule(created.id);
      expect(deleted).toBeNull();
    });
  });

  describe('email templates', () => {
    it('should manage email templates', async () => {
      const template = mockEmailTemplate();

      // Create template
      const created = await repository.createEmailTemplate(template);
      expect(created.id).toBeDefined();

      // Get template
      const retrieved = await repository.getEmailTemplate(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.variables).toBeDefined();
      expect(retrieved.preview).toBeDefined();

      // Update template
      const updateData = {
        name: 'Updated Template',
        subject: 'Updated Subject'
      };
      const updated = await repository.updateEmailTemplate(created.id, updateData);
      expect(updated.name).toBe(updateData.name);
      expect(updated.subject).toBe(updateData.subject);

      // Get all templates
      const templates = await repository.getEmailTemplates();
      expect(templates).toHaveLength(1);

      // Delete template
      await repository.deleteEmailTemplate(created.id);
      const deleted = await repository.getEmailTemplate(created.id);
      expect(deleted).toBeNull();
    });
  });

  describe('system settings', () => {
    it('should manage system settings', async () => {
      const key = 'test_setting';
      const value = 'test_value';

      // Set setting
      await repository.setSetting(key, value);

      // Get setting
      const retrieved = await repository.getSetting(key);
      expect(retrieved).toBe(value);

      // Get all settings
      const settings = await repository.getAllSettings();
      expect(settings[key]).toBe(value);

      // Delete setting
      await repository.deleteSetting(key);
      const deleted = await repository.getSetting(key);
      expect(deleted).toBeNull();
    });
  });
});
