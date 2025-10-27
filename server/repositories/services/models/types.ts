import { InferModel } from 'drizzle-orm';
import { services, serviceCategories, staffServices } from '../../../schema';

// Base types from schema
export type Service = InferModel<typeof services>;
export type ServiceCategory = InferModel<typeof serviceCategories>;
export type StaffService = InferModel<typeof staffServices>;

// Insert types
export type InsertService = InferModel<typeof services, 'insert'>;
export type InsertServiceCategory = InferModel<typeof serviceCategories, 'insert'>;
export type InsertStaffService = InferModel<typeof staffServices, 'insert'>;

// Query filters
export interface ServiceFilters {
  categoryId?: number;
  locationId?: number;
  staffId?: number;
  search?: string;
  isAddOn?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minDuration?: number;
  maxDuration?: number;
}

// Extended types with relations
export interface ServiceWithRelations extends Service {
  category?: {
    id: number;
    name: string;
    description?: string;
  };
  staff?: Array<{
    id: number;
    firstName?: string;
    lastName?: string;
    title?: string;
  }>;
  locations?: Array<{
    id: number;
    name: string;
  }>;
  addOns?: Array<{
    id: number;
    name: string;
    price: number;
    duration: number;
  }>;
  baseServices?: Array<{
    id: number;
    name: string;
    price: number;
    duration: number;
  }>;
}

export interface ServiceCategoryWithRelations extends ServiceCategory {
  services?: Array<{
    id: number;
    name: string;
    price: number;
    duration: number;
  }>;
}

// Repository interface
export interface IServiceRepository {
  // Basic CRUD
  create(data: InsertService): Promise<Service>;
  findById(id: number): Promise<ServiceWithRelations | null>;
  update(id: number, data: Partial<InsertService>): Promise<Service>;
  delete(id: number): Promise<void>;
  
  // Queries
  findByFilters(filters: ServiceFilters): Promise<ServiceWithRelations[]>;
  findByCategory(categoryId: number): Promise<ServiceWithRelations[]>;
  findByLocation(locationId: number): Promise<ServiceWithRelations[]>;
  findByStaff(staffId: number): Promise<ServiceWithRelations[]>;
  search(query: string): Promise<ServiceWithRelations[]>;
  
  // Categories
  createCategory(data: InsertServiceCategory): Promise<ServiceCategory>;
  findCategoryById(id: number): Promise<ServiceCategoryWithRelations | null>;
  updateCategory(id: number, data: Partial<InsertServiceCategory>): Promise<ServiceCategory>;
  deleteCategory(id: number): Promise<void>;
  getAllCategories(): Promise<ServiceCategoryWithRelations[]>;
  
  // Staff assignments
  assignStaff(serviceId: number, staffId: number): Promise<void>;
  unassignStaff(serviceId: number, staffId: number): Promise<void>;
  getAssignedStaff(serviceId: number): Promise<number[]>;
  
  // Location assignments
  assignLocation(serviceId: number, locationId: number): Promise<void>;
  unassignLocation(serviceId: number, locationId: number): Promise<void>;
  getAssignedLocations(serviceId: number): Promise<number[]>;
  
  // Add-on relationships
  addAddOn(baseServiceId: number, addOnId: number): Promise<void>;
  removeAddOn(baseServiceId: number, addOnId: number): Promise<void>;
  getAddOns(baseServiceId: number): Promise<Service[]>;
  getBaseServices(addOnId: number): Promise<Service[]>;
}
