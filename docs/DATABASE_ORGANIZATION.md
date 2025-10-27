# Database Organization Patterns

This document outlines the patterns and best practices for organizing database code in the DevBooking application.

## Schema Organization

```
server/
├── core/
│   └── database/
│       ├── schema/              # Database schema definitions
│       │   ├── appointments.ts
│       │   ├── clients.ts
│       │   └── staff.ts
│       ├── migrations/          # Database migrations
│       ├── seeds/              # Seed data
│       └── connection.ts       # Database connection configuration
```

## Schema Definitions

Each schema file should define:
1. Table structure
2. Relationships
3. Indices
4. Constraints
5. Type definitions

Example:
```typescript
// core/database/schema/appointments.ts
import { pgTable, serial, timestamp, text, integer } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { staff } from './staff';

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id')
    .references(() => clients.id)
    .notNull(),
  staffId: integer('staff_id')
    .references(() => staff.id)
    .notNull(),
  date: timestamp('date').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Define indices
createIndex('appointments_client_id_idx', appointments.clientId);
createIndex('appointments_staff_id_idx', appointments.staffId);
createIndex('appointments_date_idx', appointments.date);
```

## Migration Organization

### 1. Migration Files
```typescript
// core/database/migrations/[timestamp]_create_appointments.ts
export async function up(db: Database) {
  await db.schema
    .createTable('appointments')
    .addColumn('id', 'serial', col => col.primaryKey())
    .addColumn('client_id', 'integer', col => 
      col.references('clients.id').notNull()
    )
    .addColumn('staff_id', 'integer', col => 
      col.references('staff.id').notNull()
    )
    .addColumn('date', 'timestamp', col => col.notNull())
    .addColumn('status', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamp', col => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', col => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();
}

export async function down(db: Database) {
  await db.schema.dropTable('appointments').execute();
}
```

### 2. Migration Best Practices
- Make migrations reversible
- One change per migration
- Use descriptive names
- Include both up and down migrations
- Test migrations before applying

## Query Organization

### 1. Repository Pattern
```typescript
// modules/appointments/repositories/appointment-repository.ts
export class AppointmentRepository {
  constructor(private db: Database) {}

  async findById(id: number) {
    return this.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .first();
  }

  async create(data: CreateAppointmentDTO) {
    return this.db
      .insert(appointments)
      .values(data)
      .returning();
  }
}
```

### 2. Query Builders
```typescript
// modules/appointments/repositories/queries/find-appointments.ts
export function buildAppointmentQuery(filters: AppointmentFilters) {
  let query = db
    .select()
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(staff, eq(appointments.staffId, staff.id));

  if (filters.startDate) {
    query = query.where(gte(appointments.date, filters.startDate));
  }

  if (filters.endDate) {
    query = query.where(lte(appointments.date, filters.endDate));
  }

  return query;
}
```

## Performance Optimization

### 1. Indexing Strategy
```sql
-- Commonly queried fields
CREATE INDEX appointments_date_idx ON appointments(date);
CREATE INDEX appointments_status_idx ON appointments(status);

-- Composite indices for common queries
CREATE INDEX appointments_staff_date_idx ON appointments(staff_id, date);
CREATE INDEX appointments_client_date_idx ON appointments(client_id, date);
```

### 2. Query Optimization
```typescript
// Efficient pagination
async function paginateAppointments(page: number, perPage: number) {
  const offset = (page - 1) * perPage;
  
  // Use cursor-based pagination for better performance
  return db
    .select()
    .from(appointments)
    .orderBy(appointments.id)
    .limit(perPage)
    .offset(offset);
}

// Efficient counting
async function countAppointments(filters: AppointmentFilters) {
  return db
    .select({ count: sql`count(*)` })
    .from(appointments)
    .where(buildWhereClause(filters))
    .first();
}
```

## Data Validation

### 1. Schema Validation
```typescript
// modules/appointments/schemas/appointment.schema.ts
export const createAppointmentSchema = z.object({
  clientId: z.number().positive(),
  staffId: z.number().positive(),
  date: z.date(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
});

// Validate before database operations
async function createAppointment(data: unknown) {
  const validated = createAppointmentSchema.parse(data);
  return appointmentRepository.create(validated);
}
```

### 2. Database Constraints
```sql
-- Ensure valid status values
ALTER TABLE appointments
ADD CONSTRAINT valid_status
CHECK (status IN ('pending', 'confirmed', 'cancelled'));

-- Ensure date is not in past
ALTER TABLE appointments
ADD CONSTRAINT future_date
CHECK (date >= CURRENT_DATE);
```

## Transaction Management

### 1. Transaction Wrapper
```typescript
// core/database/transaction.ts
export async function withTransaction<T>(
  db: Database,
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  const tx = await db.transaction();
  try {
    const result = await callback(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
```

### 2. Using Transactions
```typescript
// Creating appointment with related records
async function createAppointmentWithDetails(data: CreateAppointmentDTO) {
  return withTransaction(db, async (tx) => {
    const appointment = await tx
      .insert(appointments)
      .values(data)
      .returning();

    await tx
      .insert(appointmentDetails)
      .values({
        appointmentId: appointment.id,
        ...data.details
      });

    return appointment;
  });
}
```

## Testing

### 1. Test Database Setup
```typescript
// test/helpers/database.ts
export async function setupTestDatabase() {
  const db = new Database({
    // Test database configuration
  });
  
  await db.migrate.latest();
  return db;
}

export async function clearTestDatabase(db: Database) {
  await db.raw('TRUNCATE TABLE appointments CASCADE');
}
```

### 2. Repository Tests
```typescript
// modules/appointments/repositories/__tests__/appointment-repository.test.ts
describe('AppointmentRepository', () => {
  let db: Database;
  let repository: AppointmentRepository;

  beforeEach(async () => {
    db = await setupTestDatabase();
    repository = new AppointmentRepository(db);
  });

  afterEach(async () => {
    await clearTestDatabase(db);
  });

  it('should create appointment', async () => {
    const appointment = await repository.create({
      clientId: 1,
      staffId: 1,
      date: new Date(),
      status: 'pending'
    });

    expect(appointment).toHaveProperty('id');
  });
});
```

## Best Practices

1. **Schema Design**
   - Use appropriate data types
   - Define relationships explicitly
   - Add proper constraints
   - Create necessary indices

2. **Query Performance**
   - Use efficient queries
   - Implement pagination
   - Cache when appropriate
   - Monitor query performance

3. **Data Integrity**
   - Use transactions when needed
   - Validate data before insertion
   - Handle concurrent updates
   - Maintain referential integrity

4. **Security**
   - Sanitize inputs
   - Use parameterized queries
   - Implement proper access control
   - Audit sensitive operations

5. **Testing**
   - Use a separate test database
   - Reset data between tests
   - Test edge cases
   - Verify constraints
