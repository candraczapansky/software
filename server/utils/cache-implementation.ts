/**
 * Cache Implementation for Performance Optimization
 * 
 * This module provides caching utilities for frequently accessed data
 * that rarely changes, reducing database load and improving response times.
 */

import { DatabaseOptimizer } from './database-optimizer.js';

// Cache TTL (Time To Live) configurations in milliseconds
export const CACHE_TTL = {
  SERVICE_CATEGORIES: 3600000,  // 1 hour - categories rarely change
  LOCATIONS: 1800000,           // 30 minutes - locations are mostly static
  SERVICES: 900000,             // 15 minutes - services change occasionally
  STAFF_SCHEDULES: 300000,      // 5 minutes - schedules need fresher data
  STAFF_SERVICES: 600000,       // 10 minutes - staff-service mappings
  BUSINESS_SETTINGS: 3600000,   // 1 hour - settings rarely change
  ROOMS: 1800000,              // 30 minutes - rooms are static
};

// Initialize the database optimizer with caching
const dbOptimizer = new DatabaseOptimizer();

/**
 * Generic cached query wrapper
 * Checks cache first, then executes query if cache miss
 */
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<T>,
  ttl: number = 300000 // Default 5 minutes
): Promise<T> {
  return dbOptimizer.cachedQuery(cacheKey, queryFn, ttl);
}

/**
 * Invalidate cache by pattern
 * Use when data is updated to ensure fresh data on next request
 */
export function invalidateCachePattern(pattern: string): void {
  dbOptimizer.invalidateCache(pattern);
}

/**
 * Service Categories Cache Implementation
 */
export async function getCachedServiceCategories(storage: any) {
  return cachedQuery(
    'service-categories:all',
    () => storage.getAllServiceCategories(),
    CACHE_TTL.SERVICE_CATEGORIES
  );
}

/**
 * Locations Cache Implementation
 */
export async function getCachedLocations(db: any, locationsTable: any) {
  return cachedQuery(
    'locations:all',
    async () => {
      const { desc } = await import('drizzle-orm');
      return db.select().from(locationsTable).orderBy(desc(locationsTable.id));
    },
    CACHE_TTL.LOCATIONS
  );
}

/**
 * Active Locations Cache Implementation
 */
export async function getCachedActiveLocations(db: any, locationsTable: any) {
  return cachedQuery(
    'locations:active',
    async () => {
      const { eq, desc } = await import('drizzle-orm');
      return db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.isActive, true))
        .orderBy(desc(locationsTable.id));
    },
    CACHE_TTL.LOCATIONS
  );
}

/**
 * Services by Location Cache Implementation
 */
export async function getCachedServicesByLocation(
  storage: any,
  locationId: number
) {
  return cachedQuery(
    `services:location:${locationId}`,
    () => storage.getServicesByLocation(locationId),
    CACHE_TTL.SERVICES
  );
}

/**
 * Staff Services Cache Implementation
 */
export async function getCachedStaffServices(storage: any, staffId: number) {
  return cachedQuery(
    `staff-services:${staffId}`,
    () => storage.getStaffServices(staffId),
    CACHE_TTL.STAFF_SERVICES
  );
}

/**
 * Staff Schedules Cache Implementation
 */
export async function getCachedStaffSchedules(
  storage: any,
  staffId: number
) {
  return cachedQuery(
    `staff-schedules:${staffId}`,
    () => storage.getStaffSchedulesByStaffId(staffId),
    CACHE_TTL.STAFF_SCHEDULES
  );
}

/**
 * Business Settings Cache Implementation
 */
export async function getCachedBusinessSettings(storage: any) {
  return cachedQuery(
    'business-settings:current',
    () => storage.getBusinessSettings(),
    CACHE_TTL.BUSINESS_SETTINGS
  );
}

/**
 * Rooms Cache Implementation
 */
export async function getCachedRooms(storage: any) {
  return cachedQuery(
    'rooms:all',
    () => storage.getAllRooms(),
    CACHE_TTL.ROOMS
  );
}

/**
 * Batch fetch users to avoid N+1 queries
 */
export async function batchFetchUsers(
  storage: any,
  userIds: number[]
): Promise<Map<number, any>> {
  // Remove duplicates
  const uniqueIds = [...new Set(userIds)];
  
  // Create cache key for this specific batch
  const cacheKey = `users:batch:${uniqueIds.sort().join(',')}`;
  
  const users = await cachedQuery(
    cacheKey,
    async () => {
      // Fetch all users in one query
      const userPromises = uniqueIds.map(id => storage.getUser(id));
      return Promise.all(userPromises);
    },
    300000 // 5 minutes cache for user batches
  );
  
  // Return as a Map for O(1) lookups
  const userMap = new Map<number, any>();
  users.forEach((user: any) => {
    if (user) {
      userMap.set(user.id, user);
    }
  });
  
  return userMap;
}

/**
 * Cache invalidation helpers for when data changes
 */
export const cacheInvalidators = {
  // Call after updating service categories
  invalidateServiceCategories: () => {
    invalidateCachePattern('service-categories:');
  },
  
  // Call after updating locations
  invalidateLocations: () => {
    invalidateCachePattern('locations:');
  },
  
  // Call after updating services
  invalidateServices: (locationId?: number) => {
    if (locationId) {
      invalidateCachePattern(`services:location:${locationId}`);
    } else {
      invalidateCachePattern('services:');
    }
  },
  
  // Call after updating staff schedules
  invalidateStaffSchedules: (staffId?: number) => {
    if (staffId) {
      invalidateCachePattern(`staff-schedules:${staffId}`);
    } else {
      invalidateCachePattern('staff-schedules:');
    }
  },
  
  // Call after updating staff services
  invalidateStaffServices: (staffId?: number) => {
    if (staffId) {
      invalidateCachePattern(`staff-services:${staffId}`);
    } else {
      invalidateCachePattern('staff-services:');
    }
  },
  
  // Call after updating business settings
  invalidateBusinessSettings: () => {
    invalidateCachePattern('business-settings:');
  },
  
  // Call after updating rooms
  invalidateRooms: () => {
    invalidateCachePattern('rooms:');
  },
  
  // Clear all caches (use sparingly)
  invalidateAll: () => {
    invalidateCachePattern('');
  }
};

/**
 * Performance monitoring helper
 */
export async function monitorQueryPerformance<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - start;
    
    // Log slow queries (>1 second)
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected: ${queryName} took ${duration}ms`);
    } else if (duration > 500) {
      console.log(`⏱️ Query performance: ${queryName} took ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Query failed: ${queryName} after ${duration}ms`, error);
    throw error;
  }
}

export default {
  cachedQuery,
  invalidateCachePattern,
  getCachedServiceCategories,
  getCachedLocations,
  getCachedActiveLocations,
  getCachedServicesByLocation,
  getCachedStaffServices,
  getCachedStaffSchedules,
  getCachedBusinessSettings,
  getCachedRooms,
  batchFetchUsers,
  cacheInvalidators,
  monitorQueryPerformance,
  CACHE_TTL
};

