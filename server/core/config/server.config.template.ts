export interface ServerConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  cors: {
    origin: string[];
    methods: string[];
    allowedHeaders: string[];
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3002'),
  environment: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};
