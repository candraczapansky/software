# Server Organization Patterns

This document outlines the patterns and best practices for organizing server-side code in the DevBooking application.

## Directory Structure

```
server/
├── modules/                    # Domain-driven modules
│   ├── appointments/
│   │   ├── controllers/       # Route handlers
│   │   ├── services/         # Business logic
│   │   ├── repositories/     # Data access
│   │   └── types/           # Type definitions
│   └── [other modules]/
├── shared/                    # Shared code
│   ├── middleware/           # Express middleware
│   ├── utils/                # Common utilities
│   └── types/                # Shared types
├── core/                      # Core server code
│   ├── database/             # Database configuration
│   ├── auth/                 # Authentication
│   └── config/               # Server configuration
└── api/                      # API route definitions
```

## Module Organization

Each module should follow the Repository Pattern and have clear separation of concerns:

### 1. Controllers (Route Handlers)
- Handle HTTP requests and responses
- Validate request data
- Call appropriate services
- Format responses

Example:
```typescript
// modules/appointments/controllers/appointment-controller.ts
export class AppointmentController {
  constructor(private appointmentService: AppointmentService) {}

  async create(req: Request, res: Response) {
    try {
      const appointment = await this.appointmentService.create(req.body);
      res.status(201).json(appointment);
    } catch (error) {
      handleError(error, res);
    }
  }
}
```

### 2. Services (Business Logic)
- Implement business rules
- Coordinate between repositories
- Handle complex operations
- Manage transactions

Example:
```typescript
// modules/appointments/services/appointment-service.ts
export class AppointmentService {
  constructor(private appointmentRepo: AppointmentRepository) {}

  async create(data: CreateAppointmentDTO) {
    // Validate business rules
    await this.validateAvailability(data);
    
    // Create appointment
    const appointment = await this.appointmentRepo.create(data);
    
    // Handle side effects (notifications, etc.)
    await this.notifyParticipants(appointment);
    
    return appointment;
  }
}
```

### 3. Repositories (Data Access)
- Handle database operations
- Map database models to domain models
- Implement query logic
- No business logic

Example:
```typescript
// modules/appointments/repositories/appointment-repository.ts
export class AppointmentRepository {
  async findById(id: number): Promise<Appointment | null> {
    return db.appointments.findUnique({
      where: { id },
      include: { client: true, staff: true }
    });
  }

  async create(data: CreateAppointmentDTO): Promise<Appointment> {
    return db.appointments.create({
      data,
      include: { client: true, staff: true }
    });
  }
}
```

## Error Handling

### 1. Custom Error Classes
```typescript
// shared/errors/application-error.ts
export class ApplicationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

### 2. Error Middleware
```typescript
// shared/middleware/error-handler.ts
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof ApplicationError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code
    });
  }

  // Log unexpected errors
  logger.error(error);
  
  return res.status(500).json({
    error: 'Internal server error'
  });
}
```

## Middleware Organization

### 1. Authentication
```typescript
// shared/middleware/auth.ts
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw new AuthenticationError('No token provided');
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    throw new AuthenticationError('Invalid token');
  }
}
```

### 2. Validation
```typescript
// shared/middleware/validate.ts
export function validate(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      throw new ValidationError(error.message);
    }
  };
}
```

## Configuration Management

### 1. Environment-based Config
```typescript
// core/config/index.ts
export const config = {
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10')
    }
  },
  server: {
    port: parseInt(process.env.PORT || '3002'),
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || []
    }
  }
};
```

## Logging

### 1. Logger Configuration
```typescript
// core/logger/index.ts
export const logger = {
  info: (message: string, meta?: object) => {
    // Log info level
  },
  error: (error: Error, meta?: object) => {
    // Log error with stack trace
  },
  warn: (message: string, meta?: object) => {
    // Log warning level
  }
};
```

## Testing Organization

```
modules/appointments/
├── __tests__/
│   ├── controllers/
│   │   └── appointment-controller.test.ts
│   ├── services/
│   │   └── appointment-service.test.ts
│   └── repositories/
│       └── appointment-repository.test.ts
└── __mocks__/
    └── appointment-data.ts
```

## Best Practices

1. **Dependency Injection**
   - Use constructor injection
   - Make dependencies explicit
   - Easier to test and maintain

2. **Single Responsibility**
   - Each class/function does one thing
   - Keep files focused and small
   - Easy to understand and test

3. **Type Safety**
   - Use TypeScript strictly
   - Define clear interfaces
   - Validate data at boundaries

4. **Error Handling**
   - Use custom error classes
   - Handle errors at appropriate levels
   - Provide meaningful error messages

5. **Async/Await**
   - Use async/await consistently
   - Handle promise rejections
   - Maintain error stack traces

6. **Security**
   - Validate all inputs
   - Sanitize all outputs
   - Use proper authentication/authorization

7. **Performance**
   - Use connection pooling
   - Cache when appropriate
   - Monitor query performance

8. **Testing**
   - Write unit tests
   - Use integration tests
   - Mock external dependencies

## File Naming Conventions

1. **Controllers**
   - `feature-name.controller.ts`
   - `feature-name.controller.test.ts`

2. **Services**
   - `feature-name.service.ts`
   - `feature-name.service.test.ts`

3. **Repositories**
   - `feature-name.repository.ts`
   - `feature-name.repository.test.ts`

4. **Types**
   - `feature-name.types.ts`
   - `feature-name.dto.ts`

5. **Middleware**
   - `middleware-name.middleware.ts`
   - `middleware-name.test.ts`

## Documentation

Each module should include:
1. README.md with:
   - Purpose
   - Dependencies
   - Configuration
   - Usage examples
2. API documentation
3. Type definitions
4. Test coverage report
