import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    permissions: string[];
  };
}

export interface PaginationOptions {
  page: number;
  perPage: number;
}

export interface SortOptions {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ServiceError extends Error {
  code?: string;
  statusCode?: number;
  details?: Record<string, any>;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
}

export interface EmailConfig {
  provider: 'sendgrid';
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export interface SMSConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface ServerConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  database: DatabaseConfig;
  email: EmailConfig;
  sms: SMSConfig;
  jwtSecret: string;
  corsOrigins: string[];
}
