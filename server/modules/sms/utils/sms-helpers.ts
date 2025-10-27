import { SMSAutoRespondConfig } from '../models/types';

export const isWithinBusinessHours = (config: SMSAutoRespondConfig): boolean => {
  if (!config.businessHoursOnly) return true;

  const now = new Date();
  const tz = config.businessHours.timezone;
  const currentTime = now.toLocaleTimeString('en-US', { timeZone: tz, hour12: false });
  
  return currentTime >= config.businessHours.start && currentTime <= config.businessHours.end;
};

export const shouldAutoRespond = (
  message: string,
  phoneNumber: string,
  config: SMSAutoRespondConfig
): boolean => {
  // Check if auto-respond is enabled
  if (!config.enabled) return false;

  // Check business hours
  if (!isWithinBusinessHours(config)) return false;

  // Check excluded phone numbers
  if (config.excludedPhoneNumbers.includes(phoneNumber)) return false;

  // Check if phone number is in auto-respond list (if list exists and is not empty)
  if (config.autoRespondPhoneNumbers?.length > 0 && !config.autoRespondPhoneNumbers.includes(phoneNumber)) {
    return false;
  }

  // Check excluded keywords
  const messageLC = message.toLowerCase();
  if (config.excludedKeywords.some(keyword => messageLC.includes(keyword.toLowerCase()))) {
    return false;
  }

  return true;
};

export const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Format as US phone number if 10 digits
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // If already has country code, just add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // Return as-is with + if already in international format
  if (cleaned.length > 11) {
    return `+${cleaned}`;
  }
  
  return phoneNumber;
};

export const truncateMessage = (message: string, maxLength: number): string => {
  if (message.length <= maxLength) return message;
  
  // Try to truncate at last complete sentence
  const lastPeriod = message.lastIndexOf('.', maxLength - 3);
  if (lastPeriod > maxLength * 0.75) {
    return message.slice(0, lastPeriod + 1);
  }
  
  // If no good sentence break, truncate at last complete word
  const truncated = message.slice(0, maxLength - 3).trim();
  const lastSpace = truncated.lastIndexOf(' ');
  
  return `${truncated.slice(0, lastSpace)}...`;
};
