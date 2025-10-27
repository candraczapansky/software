// Base API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// Common Query Parameters
export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

// Common Response Types
export interface HealthCheckResponse {
  success: boolean;
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    email: 'configured' | 'unconfigured';
    sms: 'configured' | 'unconfigured';
  };
  databaseMonitor: any;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    permissions: string[];
  };
}
