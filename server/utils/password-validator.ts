/**
 * Password Strength Validation Utility
 * 
 * This module provides configurable password strength validation
 * WITHOUT breaking existing user passwords.
 * 
 * IMPORTANT: This only validates NEW passwords during:
 * - User registration
 * - Password reset
 * - Password change
 * 
 * Existing users can still login with their current passwords.
 */

export interface PasswordPolicy {
  minLength: number;
  maxLength?: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords?: boolean;
}

// Default policy - can be overridden via environment variables
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
  maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH || '128'),
  requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
  requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false', 
  requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
  requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
  preventCommonPasswords: process.env.PASSWORD_PREVENT_COMMON !== 'false'
};

// Common passwords to prevent (top 100 most common)
const COMMON_PASSWORDS = [
  'password', '12345678', '123456789', 'password1', 'password123',
  'qwerty', 'abc123', '111111', '1234567', 'welcome',
  'monkey', '1234567890', 'dragon', '123123', 'baseball',
  'iloveyou', 'trustno1', 'sunshine', 'princess', 'qwerty123',
  'admin', 'letmein', 'welcome123', 'password!', 'p@ssw0rd'
];

/**
 * Validates a password against the policy
 * Returns array of error messages (empty if valid)
 */
export function validatePasswordStrength(
  password: string, 
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): string[] {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return errors;
  }

  // Length validation
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  if (policy.maxLength && password.length > policy.maxLength) {
    errors.push(`Password must not exceed ${policy.maxLength} characters`);
  }

  // Complexity requirements
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (policy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check against common passwords
  if (policy.preventCommonPasswords) {
    const passwordLower = password.toLowerCase();
    if (COMMON_PASSWORDS.includes(passwordLower)) {
      errors.push('This password is too common. Please choose a more unique password');
    }
  }

  // Additional checks for very weak patterns
  if (password.length >= policy.minLength) {
    // Check for repeated characters (e.g., "aaaaaaaa")
    if (/^(.)\1+$/.test(password)) {
      errors.push('Password cannot consist of repeated characters');
    }

    // Check for sequential characters (e.g., "12345678" or "abcdefgh")
    if (isSequential(password)) {
      errors.push('Password cannot be a sequence of characters');
    }
  }

  return errors;
}

/**
 * Checks if password is sequential
 */
function isSequential(password: string): boolean {
  const lower = password.toLowerCase();
  
  // Check for number sequences
  const numberSeq = '01234567890123456789';
  if (numberSeq.includes(lower) && lower.length >= 4) {
    return true;
  }

  // Check for alphabet sequences
  const alphaSeq = 'abcdefghijklmnopqrstuvwxyzabc';
  if (alphaSeq.includes(lower) && lower.length >= 4) {
    return true;
  }

  // Check for keyboard sequences
  const keyboardSeqs = ['qwerty', 'asdfgh', 'zxcvbn', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return keyboardSeqs.some(seq => lower.includes(seq));
}

/**
 * Generates password strength score (0-100)
 * For UI feedback purposes
 */
export function getPasswordStrength(password: string): {
  score: number;
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  feedback: string;
} {
  if (!password) {
    return { score: 0, strength: 'very-weak', feedback: 'Enter a password' };
  }

  let score = 0;
  
  // Length scoring (up to 30 points)
  score += Math.min(password.length * 2, 30);

  // Complexity scoring (up to 60 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/.test(password)) score += 15;
  
  // Variety bonus
  const uniqueChars = new Set(password).size;
  score += Math.min(uniqueChars, 15);

  // Penalties
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    score = Math.max(score - 50, 0);
  }
  if (isSequential(password)) {
    score = Math.max(score - 20, 0);
  }

  // Determine strength level
  let strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  let feedback: string;

  if (score < 20) {
    strength = 'very-weak';
    feedback = 'Very weak - Add more characters and variety';
  } else if (score < 40) {
    strength = 'weak';
    feedback = 'Weak - Consider adding numbers and symbols';
  } else if (score < 60) {
    strength = 'fair';
    feedback = 'Fair - Good, but could be stronger';
  } else if (score < 80) {
    strength = 'good';
    feedback = 'Good - Strong password';
  } else {
    strength = 'strong';
    feedback = 'Strong - Excellent password!';
  }

  return { score: Math.min(score, 100), strength, feedback };
}

/**
 * Utility to check if we should enforce password policy
 * Based on environment configuration
 */
export function shouldEnforcePasswordPolicy(): boolean {
  // Allow disabling for development/testing
  return process.env.ENFORCE_PASSWORD_POLICY !== 'false';
}

/**
 * Gets human-readable password requirements
 * For displaying to users
 */
export function getPasswordRequirements(policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string {
  const requirements: string[] = [];
  
  requirements.push(`At least ${policy.minLength} characters`);
  
  if (policy.requireUppercase) requirements.push('One uppercase letter');
  if (policy.requireLowercase) requirements.push('One lowercase letter'); 
  if (policy.requireNumbers) requirements.push('One number');
  if (policy.requireSpecialChars) requirements.push('One special character');
  
  return requirements.join(', ');
}
