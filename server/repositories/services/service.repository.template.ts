import { eq, and, or, like, between, desc } from 'drizzle-orm';
import { Database } from '../../db';
import {
  services,
  serviceCategories,
  staffServices,
  staff,
  locations
} from '../../schema';
import type {
  Service,
  ServiceCategory,
  ServiceWithRelations,
  ServiceCategoryWithRelations,
  InsertService,
  InsertServiceCategory,
  ServiceFilters,
  IServiceRepository
} from './models/types';

export class ServiceRepository implements IServiceRepository {
  constructor(private db: Database) {}

  async create(data: InsertService): Promise<Service> {
    const [service] = await this.db
      .insert(services)
      .values(data)
      .returning();
    
    return service;
  }

  async findById(id: number): Promise<ServiceWithRelations | null> {
    const [service] = await this.db
      .select()
      .from(services)
      .where(eq(services.id, id))
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .limit(1);

    if (!service) return null;

    // Get related data
    const [assignedStaff, locations, addOns, baseServices] = await Promise.all([
      this.getAssignedStaff(id),
      this.getAssignedLocations(id),
      this.getAddOns(id),
      this.getBaseServices(id)
    ]);

    return {
      ...service.services,
      category: service.serviceCategories,
      staff: assignedStaff,
      locations,
      addOns,
      baseServices
    };
  }

  async update(id: number, data: Partial<InsertService>): Promise<Service> {
    const [updated] = await this.db
      .update(services)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();

    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(services)
      .where(eq(services.id, id));
  }

  async findByFilters(filters: ServiceFilters): Promise<ServiceWithRelations[]> {
    const conditions = [];

    if (filters.categoryId) {
      conditions.push(eq(services.categoryId, filters.categoryId));
    }

    if (filters.search) {
      conditions.push(
        or(
          like(services.name, `%${filters.search}%`),
          like(services.description, `%${filters.search}%`)
        )
      );
    }

    if (filters.isAddOn !== undefined) {
      conditions.push(eq(services.isAddOn, filters.isAddOn));
    }

    if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
      conditions.push(between(services.price, filters.minPrice, filters.maxPrice));
    }

    if (filters.minDuration !== undefined && filters.maxDuration !== undefined) {
      conditions.push(between(services.duration, filters.minDuration, filters.maxDuration));
    }

    const results = await this.db
      .select()
      .from(services)
      .where(and(...conditions))
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .orderBy(services.name);

    // Map results to ServiceWithRelations
    return Promise.all(
      results.map(async (result) => ({
        ...result.services,
        category: result.serviceCategories,
        staff: await this.getAssignedStaff(result.services.id),
        locations: await this.getAssignedLocations(result.services.id),
        addOns: await this.getAddOns(result.services.id),
        baseServices: await this.getBaseServices(result.services.id)
      }))
    );
  }

  async findByCategory(categoryId: number): Promise<ServiceWithRelations[]> {
    return this.findByFilters({ categoryId });
  }

  async findByLocation(locationId: number): Promise<ServiceWithRelations[]> {
    const services = await this.findByFilters({});
    return services.filter(service => 
      service.locations?.some(location => location.id === locationId)
    );
  }

  async findByStaff(staffId: number): Promise<ServiceWithRelations[]> {
    const services = await this.findByFilters({});
    return services.filter(service =>
      service.staff?.some(staff => staff.id === staffId)
    );
  }

  async search(query: string): Promise<ServiceWithRelations[]> {
    return this.findByFilters({ search: query });
  }

  async createCategory(data: InsertServiceCategory): Promise<ServiceCategory> {
    const [category] = await this.db
      .insert(serviceCategories)
      .values(data)
      .returning();

    return category;
  }

  async findCategoryById(id: number): Promise<ServiceCategoryWithRelations | null> {
    const [category] = await this.db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, id))
      .limit(1);

    if (!category) return null;

    const categoryServices = await this.findByCategory(id);

    return {
      ...category,
      services: categoryServices
    };
  }

  async updateCategory(id: number, data: Partial<InsertServiceCategory>): Promise<ServiceCategory> {
    const [updated] = await this.db
      .update(serviceCategories)
      .set(data)
      .where(eq(serviceCategories.id, id))
      .returning();

    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await this.db
      .delete(serviceCategories)
      .where(eq(serviceCategories.id, id));
  }

  async getAllCategories(): Promise<ServiceCategoryWithRelations[]> {
    const categories = await this.db
      .select()
      .from(serviceCategories)
      .orderBy(serviceCategories.name);

    return Promise.all(
      categories.map(async (category) => ({
        ...category,
        services: await this.findByCategory(category.id)
      }))
    );
  }

  async assignStaff(serviceId: number, staffId: number): Promise<void> {
    await this.db
      .insert(staffServices)
      .values({ serviceId, staffId })
      .onConflictDoNothing();
  }

  async unassignStaff(serviceId: number, staffId: number): Promise<void> {
    await this.db
      .delete(staffServices)
      .where(
        and(
          eq(staffServices.serviceId, serviceId),
          eq(staffServices.staffId, staffId)
        )
      );
  }

  async getAssignedStaff(serviceId: number): Promise<any[]> {
    return this.db
      .select({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        title: staff.title
      })
      .from(staffServices)
      .where(eq(staffServices.serviceId, serviceId))
      .leftJoin(staff, eq(staffServices.staffId, staff.id));
  }

  async assignLocation(serviceId: number, locationId: number): Promise<void> {
    const service = await this.findById(serviceId);
    if (!service) return;

    const locationIds = service.locations?.map(l => l.id) || [];
    if (!locationIds.includes(locationId)) {
      locationIds.push(locationId);
      await this.update(serviceId, { locationIds });
    }
  }

  async unassignLocation(serviceId: number, locationId: number): Promise<void> {
    const service = await this.findById(serviceId);
    if (!service) return;

    const locationIds = service.locations?.map(l => l.id).filter(id => id !== locationId) || [];
    await this.update(serviceId, { locationIds });
  }

  async getAssignedLocations(serviceId: number): Promise<any[]> {
    const service = await this.db
      .select()
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);

    if (!service[0]?.locationIds?.length) return [];

    return this.db
      .select({
        id: locations.id,
        name: locations.name
      })
      .from(locations)
      .where(eq(locations.id, service[0].locationIds));
  }

  async addAddOn(baseServiceId: number, addOnId: number): Promise<void> {
    const service = await this.findById(baseServiceId);
    if (!service) return;

    const addOnIds = service.addOns?.map(a => a.id) || [];
    if (!addOnIds.includes(addOnId)) {
      addOnIds.push(addOnId);
      await this.update(baseServiceId, { addOnServiceIds: addOnIds });
    }
  }

  async removeAddOn(baseServiceId: number, addOnId: number): Promise<void> {
    const service = await this.findById(baseServiceId);
    if (!service) return;

    const addOnIds = service.addOns?.map(a => a.id).filter(id => id !== addOnId) || [];
    await this.update(baseServiceId, { addOnServiceIds: addOnIds });
  }

  async getAddOns(baseServiceId: number): Promise<Service[]> {
    const service = await this.db
      .select()
      .from(services)
      .where(eq(services.id, baseServiceId))
      .limit(1);

    if (!service[0]?.addOnServiceIds?.length) return [];

    return this.db
      .select()
      .from(services)
      .where(eq(services.id, service[0].addOnServiceIds));
  }

  async getBaseServices(addOnId: number): Promise<Service[]> {
    return this.db
      .select()
      .from(services)
      .where(eq(services.addOnServiceIds, addOnId));
  }
}
