import type {
  InsertService,
  InsertServiceCategory
} from '../models/types';

export const mockService = (overrides: Partial<InsertService> = {}): InsertService => ({
  name: 'Test Service',
  description: 'Test service description',
  duration: 60,
  price: 100,
  categoryId: 1,
  isAddOn: false,
  locationIds: [],
  addOnServiceIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const mockServiceCategory = (
  overrides: Partial<InsertServiceCategory> = {}
): InsertServiceCategory => ({
  name: 'Test Category',
  description: 'Test category description',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});
