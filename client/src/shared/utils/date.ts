import { format, addMinutes, isValid, parse, startOfDay, endOfDay } from 'date-fns';

export function formatDate(date: Date | string, formatStr: string = 'MM/dd/yyyy'): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return isValid(dateObj) ? format(dateObj, formatStr) : '';
}

export function formatTime(date: Date | string, formatStr: string = 'h:mm a'): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return isValid(dateObj) ? format(dateObj, formatStr) : '';
}

export function formatDateTime(date: Date | string, formatStr: string = 'MM/dd/yyyy h:mm a'): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return isValid(dateObj) ? format(dateObj, formatStr) : '';
}

export function parseTime(timeStr: string, referenceDate: Date = new Date()): Date {
  // Parse time strings like "14:30" or "2:30 PM"
  let date: Date;
  
  if (timeStr.includes(':')) {
    if (timeStr.toLowerCase().includes('m')) {
      // Parse "2:30 PM" format
      date = parse(timeStr, 'h:mm a', referenceDate);
    } else {
      // Parse "14:30" format
      date = parse(timeStr, 'HH:mm', referenceDate);
    }
  } else {
    // Invalid time format
    return new Date('Invalid Date');
  }

  return date;
}

export function addDuration(date: Date, durationMinutes: number): Date {
  return addMinutes(date, durationMinutes);
}

export function getDayBounds(date: Date): { start: Date; end: Date } {
  return {
    start: startOfDay(date),
    end: endOfDay(date),
  };
}

export function isValidDate(date: any): date is Date {
  return date instanceof Date && isValid(date);
}

export function toLocalTime(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(dateObj)) return new Date('Invalid Date');
  
  // Convert UTC to local time
  const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return localDate;
}

export function toUTCTime(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(dateObj)) return new Date('Invalid Date');
  
  // Convert local time to UTC
  const utcDate = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000);
  return utcDate;
}
