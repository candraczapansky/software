import { ClientRepository } from '../client.repository.template';
import { Database } from '../../../db';
import { users } from '../../../schema';
import { mockClient, mockClientMembership, mockClientNote, mockClientPhoto } from './mocks';

describe('ClientRepository', () => {
  let db: Database;
  let repository: ClientRepository;

  beforeAll(async () => {
    // Setup test database connection
    db = new Database({
      // Test database configuration
    });
    repository = new ClientRepository(db);
  });

  afterAll(async () => {
    // Close database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data
    await db.delete(users);
  });

  describe('create', () => {
    it('should create a new client', async () => {
      const data = mockClient();
      const client = await repository.create(data);

      expect(client).toBeDefined();
      expect(client.id).toBeDefined();
      expect(client.email).toBe(data.email);
      expect(client.firstName).toBe(data.firstName);
      expect(client.lastName).toBe(data.lastName);
    });
  });

  describe('findById', () => {
    it('should return client with relations', async () => {
      const data = mockClient();
      const created = await repository.create(data);
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.memberships).toBeDefined();
      expect(found.notes).toBeDefined();
      expect(found.photos).toBeDefined();
      expect(found.appointments).toBeDefined();
      expect(found.preferences).toBeDefined();
    });

    it('should return null for non-existent client', async () => {
      const found = await repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update client fields', async () => {
      const data = mockClient();
      const created = await repository.create(data);
      
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name'
      };
      
      const updated = await repository.update(created.id, updateData);
      expect(updated.firstName).toBe(updateData.firstName);
      expect(updated.lastName).toBe(updateData.lastName);
    });
  });

  describe('findByFilters', () => {
    beforeEach(async () => {
      // Create test clients
      await Promise.all([
        repository.create(mockClient({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        })),
        repository.create(mockClient({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com'
        })),
        repository.create(mockClient({
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com'
        }))
      ]);
    });

    it('should filter by search term', async () => {
      const results = await repository.findByFilters({ search: 'Doe' });
      expect(results).toHaveLength(2);
    });

    it('should filter by location', async () => {
      const results = await repository.findByFilters({ locationId: 1 });
      expect(results.every(client => client.locationId === 1)).toBe(true);
    });

    it('should filter by creation date', async () => {
      const results = await repository.findByFilters({
        createdAfter: new Date(Date.now() - 86400000) // 24 hours ago
      });
      expect(results).toHaveLength(3);
    });
  });

  describe('memberships', () => {
    it('should manage client memberships', async () => {
      const client = await repository.create(mockClient());
      const membership = mockClientMembership(client.id);
      
      // Add membership
      await repository.addMembership(membership);
      const memberships = await repository.getMemberships(client.id);
      expect(memberships).toHaveLength(1);
      
      // Cancel membership
      await repository.cancelMembership(memberships[0].id);
      const updated = await repository.getMemberships(client.id);
      expect(updated[0].status).toBe('cancelled');
    });
  });

  describe('notes', () => {
    it('should manage client notes', async () => {
      const client = await repository.create(mockClient());
      const note = mockClientNote(client.id);
      
      // Add note
      const created = await repository.addNote(note);
      expect(created.clientId).toBe(client.id);
      
      // Get notes
      const notes = await repository.getNotes(client.id);
      expect(notes).toHaveLength(1);
      
      // Delete note
      await repository.deleteNote(created.id);
      const updated = await repository.getNotes(client.id);
      expect(updated).toHaveLength(0);
    });
  });

  describe('photos', () => {
    it('should manage client photos', async () => {
      const client = await repository.create(mockClient());
      const photo = mockClientPhoto(client.id);
      
      // Add photo
      const created = await repository.addPhoto(photo);
      expect(created.clientId).toBe(client.id);
      
      // Get photos
      const photos = await repository.getPhotos(client.id);
      expect(photos).toHaveLength(1);
      
      // Delete photo
      await repository.deletePhoto(created.id);
      const updated = await repository.getPhotos(client.id);
      expect(updated).toHaveLength(0);
    });
  });

  describe('preferences', () => {
    it('should manage client preferences', async () => {
      const client = await repository.create(mockClient());
      const preferences = {
        emailAppointmentReminders: true,
        emailPromotions: false,
        smsAppointmentReminders: true,
        smsPromotions: false
      };
      
      // Update preferences
      await repository.updatePreferences(client.id, preferences);
      
      // Get preferences
      const updated = await repository.getPreferences(client.id);
      expect(updated).toEqual(preferences);
    });
  });
});
