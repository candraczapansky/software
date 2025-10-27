export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if it's a valid US number (10 digits) or international number (>10 digits)
  return cleaned.length >= 10;
}

export function isValidPostalCode(postalCode: string, countryCode: string = 'US'): boolean {
  const postalRegexByCountry: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/, // US ZIP code
    CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, // Canadian postal code
  };

  const regex = postalRegexByCountry[countryCode];
  if (!regex) return true; // If no validation for country, assume valid
  
  return regex.test(postalCode);
}

export function isStrongPassword(password: string): {
  isValid: boolean;
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
} {
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const isValid = Object.values(requirements).every(Boolean);

  return {
    isValid,
    requirements,
  };
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateDateRange(startDate: Date, endDate: Date): boolean {
  return startDate <= endDate;
}

export function validateTimeRange(startTime: string, endTime: string): boolean {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  if (endHour > startHour) return true;
  if (endHour === startHour) return endMinute > startMinute;
  return false;
}
