# Shared UI Components

This directory contains reusable UI components that are shared across multiple features.

## Form Components

### 1. Input Fields
- `Input` - Basic text input
- `Textarea` - Multiline text input
- `Select` - Dropdown select
- `Checkbox` - Single checkbox
- `NoteInput` - Rich text input for notes

### 2. Form Layout
- `Form` - Form container with validation
- `FormField` - Form field wrapper
- `FormItem` - Form item container
- `FormLabel` - Form label
- `FormMessage` - Form error/validation message
- `FormDescription` - Form field description

## Dialog Components

### 1. Modal Dialogs
- `Dialog` - Base dialog component
- `DialogContent` - Dialog content wrapper
- `DialogHeader` - Dialog header with title
- `DialogFooter` - Dialog footer for actions
- `DialogTitle` - Dialog title
- `DialogDescription` - Dialog description

### 2. Alert Dialogs
- `AlertDialog` - Confirmation dialog
- `AlertDialogContent` - Alert content
- `AlertDialogHeader` - Alert header
- `AlertDialogFooter` - Alert footer
- `AlertDialogTitle` - Alert title
- `AlertDialogDescription` - Alert description

## Data Display

### 1. Tables
- `Table` - Table container
- `TableHeader` - Table header
- `TableBody` - Table body
- `TableRow` - Table row
- `TableCell` - Table cell
- `TableHead` - Table header cell

### 2. Cards
- `Card` - Card container
- `CardHeader` - Card header
- `CardTitle` - Card title
- `CardDescription` - Card description
- `CardContent` - Card content
- `CardFooter` - Card footer

## Navigation

### 1. Menus
- `DropdownMenu` - Dropdown menu container
- `DropdownMenuTrigger` - Menu trigger button
- `DropdownMenuContent` - Menu content
- `DropdownMenuItem` - Menu item

### 2. Popover
- `Popover` - Popover container
- `PopoverTrigger` - Popover trigger
- `PopoverContent` - Popover content

## Feedback

### 1. Status Indicators
- `Badge` - Status badge
- `Alert` - Alert message
- `AlertDescription` - Alert description
- `Skeleton` - Loading skeleton

### 2. Progress
- `Loader` - Loading spinner
- `Progress` - Progress bar

## Buttons

### 1. Basic Buttons
- `Button` - Base button component with variants:
  - Primary
  - Secondary
  - Ghost
  - Link
  - Destructive

### 2. Icon Buttons
- `IconButton` - Button with icon only

## Calendar and Date
- `Calendar` - Date picker calendar
- `DatePicker` - Date input with calendar
- `TimePicker` - Time selection input

## Usage Guidelines

1. **Component Imports**
```typescript
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
```

2. **Form Usage**
```typescript
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";

// Inside your component
<Form>
  <FormField>
    <FormLabel>Field Label</FormLabel>
    <FormItem>
      <Input />
    </FormItem>
    <FormMessage />
  </FormField>
</Form>
```

3. **Dialog Usage**
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

// Inside your component
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>
    // Content here
  </DialogContent>
</Dialog>
```

4. **Table Usage**
```typescript
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/shared/components/ui/table";

// Inside your component
<Table>
  <TableHeader>
    <TableRow>
      <TableCell>Header</TableCell>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Content</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## Component Organization

Components are organized by type and functionality:
- `/ui` - Base UI components
- `/layout` - Layout components
- `/data` - Data display components
- `/forms` - Form-specific components
- `/feedback` - Loading and error states
- `/navigation` - Navigation components
