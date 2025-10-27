# Component Organization Patterns

This document outlines the patterns and best practices for organizing components in the DevBooking application.

## Directory Structure

```
client/src/
├── features/                    # Feature-based components and logic
│   ├── appointments/
│   │   ├── components/         # Feature-specific components
│   │   ├── hooks/             # Feature-specific hooks
│   │   ├── utils/             # Feature-specific utilities
│   │   └── types/             # Feature-specific types
│   └── [other features]/
├── shared/                     # Shared/common code
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Common hooks
│   ├── utils/                 # Common utilities
│   └── types/                 # Shared type definitions
└── pages/                     # Page components
```

## Component Organization Patterns

### 1. Feature-First Organization

Components should be organized by feature first, then by type. This makes it easier to:
- Find related code
- Understand feature boundaries
- Maintain feature isolation
- Scale the application

Example:
```
features/appointments/
├── components/
│   ├── AppointmentForm/
│   │   ├── index.tsx
│   │   ├── ClientSection.tsx
│   │   ├── ServiceSection.tsx
│   │   └── TimeSelection.tsx
│   ├── AppointmentList/
│   └── AppointmentDetails/
├── hooks/
│   ├── useAppointments.ts
│   └── useAvailability.ts
└── types/
    ├── index.ts
    └── api.ts
```

### 2. Component File Structure

Each component file should follow this structure:
1. Imports
2. Types/Interfaces
3. Helper Functions
4. Component Definition
5. Exports

Example:
```typescript
// 1. Imports
import React from 'react';
import { useForm } from 'react-hook-form';

// 2. Types/Interfaces
interface Props {
  onSubmit: (data: FormData) => void;
}

interface FormData {
  name: string;
  email: string;
}

// 3. Helper Functions
const validateEmail = (email: string) => {
  // ...
};

// 4. Component Definition
export function MyComponent({ onSubmit }: Props) {
  // ...
}

// 5. Exports
export default MyComponent;
```

### 3. Component Composition

Break down large components into smaller, focused components:

```typescript
// Bad: Large monolithic component
function AppointmentForm() {
  // 300+ lines of code
}

// Good: Composed of smaller components
function AppointmentForm() {
  return (
    <Form>
      <ClientSection />
      <ServiceSection />
      <TimeSelection />
      <NotesSection />
    </Form>
  );
}
```

### 4. Shared Components

Shared components should be:
- Generic and reusable
- Well-documented
- Properly typed
- Thoroughly tested

Example:
```typescript
// shared/components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', size = 'md', children, onClick }: ButtonProps) {
  // ...
}
```

### 5. Custom Hooks

Extract complex logic into custom hooks:

```typescript
// Bad: Logic in component
function Component() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch data...
  }, []);
}

// Good: Logic in custom hook
function Component() {
  const { data, loading, error } = useData();
}
```

### 6. Type Organization

- Keep types close to their usage
- Share common types
- Use descriptive names

```typescript
// features/appointments/types/index.ts
export interface Appointment {
  id: number;
  clientId: number;
  // ...
}

// features/appointments/types/api.ts
import { Appointment } from './index';

export interface CreateAppointmentRequest {
  // ...
}
```

## Best Practices

### 1. Component Naming

- Use PascalCase for component files and functions
- Use descriptive, specific names
- Add type suffixes where appropriate

```typescript
// Good
AppointmentList.tsx
AppointmentDetails.tsx
useAppointmentData.ts
appointmentHelpers.ts
```

### 2. Props

- Use TypeScript interfaces for props
- Provide default values where appropriate
- Document complex props

```typescript
interface TableProps {
  /** Data to display in the table */
  data: Array<Record<string, any>>;
  /** Function to render custom cell content */
  renderCell?: (row: any, column: string) => React.ReactNode;
  /** Whether to show row selection */
  selectable?: boolean;
}
```

### 3. State Management

- Use local state for UI state
- Use React Query for server state
- Use Context for shared state
- Keep state close to where it's used

### 4. Performance

- Memoize expensive computations
- Use React.memo for pure components
- Lazy load large components
- Avoid unnecessary re-renders

```typescript
// Good
const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);
const MemoizedComponent = React.memo(MyPureComponent);
const LazyComponent = React.lazy(() => import('./HeavyComponent'));
```

### 5. Error Handling

- Use error boundaries for component errors
- Handle async errors gracefully
- Provide meaningful error messages
- Show loading states

### 6. Testing

- Write tests alongside components
- Test component behavior, not implementation
- Use meaningful test descriptions
- Mock external dependencies

```typescript
// features/appointments/components/__tests__/AppointmentForm.test.tsx
describe('AppointmentForm', () => {
  it('should display validation errors when submitting empty form', () => {
    // ...
  });
});
```

## File Naming Conventions

1. Components:
   - `ComponentName.tsx`
   - `ComponentName.test.tsx`
   - `ComponentName.styles.ts` (if using CSS-in-JS)

2. Hooks:
   - `useHookName.ts`
   - `useHookName.test.ts`

3. Utils:
   - `utility-name.ts`
   - `utility-name.test.ts`

4. Types:
   - `types.ts`
   - `api-types.ts`

## Documentation

Each component should include:
1. Brief description
2. Props documentation
3. Usage examples
4. Important notes/caveats

Example:
```typescript
/**
 * DataTable - A reusable table component with sorting and pagination
 *
 * @example
 * <DataTable
 *   data={users}
 *   columns={['name', 'email']}
 *   onSort={handleSort}
 * />
 */
```
