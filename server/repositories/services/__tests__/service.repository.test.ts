import { ServiceRepository } from '../service.repository.template';
import { Database } from '../../../db';
import { services, serviceCategories } from '../../../schema';
import { mockService, mockServiceCategory } from './mocks';

describe('ServiceRepository', () => {
  let db: Database;
  let repository: ServiceRepository;

  beforeAll(async () => {
    // Setup test database connection
    db = new Database({
      // Test database configuration
    });
    repository = new ServiceRepository(db);
  });

  afterAll(async () => {
    // Close database connection
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data
    await db.delete(services);
    await db.delete(serviceCategories);
  });

  describe('create', () => {
    it('should create a new service', async () => {
      const data = mockService();
      const service = await repository.create(data);

      expect(service).toBeDefined();
      expect(service.id).toBeDefined();
      expect(service.name).toBe(data.name);
      expect(service.price).toBe(data.price);
      expect(service.duration).toBe(data.duration);
    });
  });

  describe('findById', () => {
    it('should return service with relations', async () => {
      const category = await repository.createCategory(mockServiceCategory());
      const data = mockService({ categoryId: category.id });
      const created = await repository.create(data);
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.category).toBeDefined();
      expect(found.staff).toBeDefined();
      expect(found.locations).toBeDefined();
      expect(found.addOns).toBeDefined();
    });

    it('should return null for non-existent service', async () => {
      const found = await repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update service fields', async () => {
      const data = mockService();
      const created = await repository.create(data);
      
      const updateData = {
        name: 'Updated Service',
        price: 150
      };
      
      const updated = await repository.update(created.id, updateData);
      expect(updated.name).toBe(updateData.name);
      expect(updated.price).toBe(updateData.price);
    });
  });

  describe('findByFilters', () => {
    beforeEach(async () => {
      const category = await repository.createCategory(mockServiceCategory());
      
      // Create test services
      await Promise.all([
        repository.create(mockService({
          categoryId: category.id,
          name: 'Basic Haircut',
          price: 50,
          duration: 30
        })),
        repository.create(mockService({
          categoryId: category.id,
          name: 'Premium Haircut',
          price: 100,
          duration: 60
        })),
        repository.create(mockService({
          categoryId: category.id,
          name: 'Hair Color',
          price: 150,
          duration: 120
        }))
      ]);
    });

    it('should filter by category', async () => {
      const category = await repository.createCategory(mockServiceCategory());
      const results = await repository.findByFilters({ categoryId: category.id });
      expect(results.every(service => service.categoryId === category.id)).toBe(true);
    });

    it('should filter by price range', async () => {
      const results = await repository.findByFilters({
        minPrice: 75,
        maxPrice: 125
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Premium Haircut');
    });

    it('should filter by duration range', async () => {
      const results = await repository.findByFilters({
        minDuration: 45,
        maxDuration: 90
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Premium Haircut');
    });

    it('should search by name', async () => {
      const results = await repository.findByFilters({ search: 'Premium' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Premium Haircut');
    });
  });

  describe('categories', () => {
    it('should manage service categories', async () => {
      // Create category
      const category = await repository.createCategory(mockServiceCategory());
      expect(category).toBeDefined();
      
      // Update category
      const updateData = { name: 'Updated Category' };
      const updated = await repository.updateCategory(category.id, updateData);
      expect(updated.name).toBe(updateData.name);
      
      // Get category with services
      const found = await repository.findCategoryById(category.id);
      expect(found).toBeDefined();
      expect(found.services).toBeDefined();
      
      // Get all categories
      const categories = await repository.getAllCategories();
      expect(categories).toHaveLength(1);
    });
  });

  describe('staff assignments', () => {
    it('should manage staff assignments', async () => {
      const service = await repository.create(mockService());
      const staffId = 1;
      
      // Assign staff
      await repository.assignStaff(service.id, staffId);
      let assigned = await repository.getAssignedStaff(service.id);
      expect(assigned).toHaveLength(1);
      
      // Unassign staff
      await repository.unassignStaff(service.id, staffId);
      assigned = await repository.getAssignedStaff(service.id);
      expect(assigned).toHaveLength(0);
    });
  });

  describe('location assignments', () => {
    it('should manage location assignments', async () => {
      const service = await repository.create(mockService());
      const locationId = 1;
      
      // Assign location
      await repository.assignLocation(service.id, locationId);
      let assigned = await repository.getAssignedLocations(service.id);
      expect(assigned).toHaveLength(1);
      
      // Unassign location
      await repository.unassignLocation(service.id, locationId);
      assigned = await repository.getAssignedLocations(service.id);
      expect(assigned).toHaveLength(0);
    });
  });

  describe('add-on relationships', () => {
    it('should manage add-on relationships', async () => {
      const baseService = await repository.create(mockService());
      const addOnService = await repository.create(mockService({ isAddOn: true }));
      
      // Add add-on
      await repository.addAddOn(baseService.id, addOnService.id);
      let addOns = await repository.getAddOns(baseService.id);
      expect(addOns).toHaveLength(1);
      
      // Remove add-on
      await repository.removeAddOn(baseService.id, addOnService.id);
      addOns = await repository.getAddOns(baseService.id);
      expect(addOns).toHaveLength(0);
    });
  });
});
