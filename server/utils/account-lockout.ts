/**
 * Account Lockout Security Feature
 * 
 * Prevents brute force attacks by locking accounts after multiple failed login attempts.
 * 
 * IMPORTANT: This feature is DISABLED by default.
 * To enable: Set environment variable ENABLE_ACCOUNT_LOCKOUT=true
 * 
 * This module is completely safe and won't affect existing functionality when disabled.
 */

import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { securityMonitor, SecurityEventType, SecurityEventSeverity } from './security-monitor.js';
import LoggerService from './logger.js';
import { securityConfig } from '../config/security.config.js';

// Use centralized security configuration
const LOCKOUT_CONFIG = securityConfig.accountLockout;

/**
 * Check if account lockout feature is enabled
 */
export function isLockoutEnabled(): boolean {
  return LOCKOUT_CONFIG.enabled;
}

/**
 * Check if an account is currently locked
 */
export async function isAccountLocked(userId: number): Promise<{
  isLocked: boolean;
  reason?: string;
  lockedUntil?: Date;
}> {
  // If feature is disabled, always return unlocked
  if (!isLockoutEnabled()) {
    return { isLocked: false };
  }

  try {
    const [user] = await db
      .select({
        accountLockedUntil: users.accountLockedUntil,
        lockoutReason: users.lockoutReason,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { isLocked: false };
    }

    // Check if lockout has expired
    if (user.accountLockedUntil) {
      const now = new Date();
      if (user.accountLockedUntil > now) {
        return {
          isLocked: true,
          reason: user.lockoutReason || 'Account temporarily locked',
          lockedUntil: user.accountLockedUntil,
        };
      } else {
        // Lockout expired, clear it
        await clearLockout(userId);
      }
    }

    return { isLocked: false };
  } catch (error) {
    LoggerService.error('Error checking account lockout:', {}, error as Error);
    // On error, fail open (don't lock user out)
    return { isLocked: false };
  }
}

/**
 * Record a failed login attempt
 */
export async function recordFailedLogin(
  userId: number,
  username: string,
  ipAddress?: string
): Promise<{
  attemptsRemaining: number;
  isNowLocked: boolean;
  lockedUntil?: Date;
}> {
  // If feature is disabled, don't record anything
  if (!isLockoutEnabled()) {
    return { attemptsRemaining: LOCKOUT_CONFIG.maxAttempts, isNowLocked: false };
  }

  try {
    // Get current user state
    const [user] = await db
      .select({
        failedLoginAttempts: users.failedLoginAttempts,
        lastFailedLogin: users.lastFailedLogin,
        accountLockedUntil: users.accountLockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { attemptsRemaining: LOCKOUT_CONFIG.maxAttempts, isNowLocked: false };
    }

    const now = new Date();
    let failedAttempts = user.failedLoginAttempts || 0;

      // Reset attempts if enough time has passed since last failure
      if (user.lastFailedLogin) {
        const minutesSinceLastFailure = 
          (now.getTime() - user.lastFailedLogin.getTime()) / (1000 * 60);
        
        if (minutesSinceLastFailure > LOCKOUT_CONFIG.resetAttemptsAfterMinutes) {
          failedAttempts = 0;
        }
      }

    // Increment failed attempts
    failedAttempts++;

    // Check if we should lock the account
    const shouldLock = failedAttempts >= LOCKOUT_CONFIG.maxAttempts;
    let lockedUntil: Date | null = null;
    let lockoutReason: string | null = null;

    if (shouldLock) {
      // Calculate lockout duration (progressive if enabled)
      let lockoutMinutes = LOCKOUT_CONFIG.lockoutDurationMinutes;
      
      if (LOCKOUT_CONFIG.progressiveLockout && user.accountLockedUntil) {
        // Double the lockout duration for repeat offenders
        const previousLockouts = Math.floor(failedAttempts / LOCKOUT_CONFIG.maxAttempts);
        lockoutMinutes = lockoutMinutes * Math.min(previousLockouts, 4); // Cap at 4x
      }

      lockedUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000);
      lockoutReason = `Too many failed login attempts (${failedAttempts})`;

      // Log security event
      await securityMonitor.logEvent({
        type: SecurityEventType.ACCOUNT_LOCKED,
        severity: SecurityEventSeverity.WARNING,
        userId,
        username,
        ipAddress,
        details: {
          failedAttempts,
          lockoutMinutes,
          lockedUntil: lockedUntil.toISOString(),
        },
      });

      LoggerService.warn('Account locked due to failed login attempts', {
        userId,
        username,
        failedAttempts,
        lockedUntil,
      });
    }

    // Update user record
    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : failedAttempts, // Reset on lock
        lastFailedLogin: now,
        accountLockedUntil: lockedUntil,
        lockoutReason,
      })
      .where(eq(users.id, userId));

    const attemptsRemaining = Math.max(0, LOCKOUT_CONFIG.maxAttempts - failedAttempts);

    return {
      attemptsRemaining: shouldLock ? 0 : attemptsRemaining,
      isNowLocked: shouldLock,
      lockedUntil: lockedUntil || undefined,
    };
  } catch (error) {
    LoggerService.error('Error recording failed login:', {}, error as Error);
    // On error, don't lock the account
    return { attemptsRemaining: 1, isNowLocked: false };
  }
}

/**
 * Clear failed login attempts (called on successful login)
 */
export async function clearFailedAttempts(userId: number): Promise<void> {
  // Even if feature is disabled, clear attempts to keep data clean
  try {
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lastFailedLogin: null,
      })
      .where(eq(users.id, userId));
  } catch (error) {
    LoggerService.error('Error clearing failed attempts:', {}, error as Error);
    // Non-critical error, don't throw
  }
}

/**
 * Clear account lockout (admin action or expiry)
 */
export async function clearLockout(
  userId: number,
  clearedBy?: number
): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        lastFailedLogin: null,
        lockoutReason: null,
      })
      .where(eq(users.id, userId));

    if (clearedBy) {
      // Log security event if manually cleared
      await securityMonitor.logEvent({
        type: SecurityEventType.ACCOUNT_UNLOCKED,
        severity: SecurityEventSeverity.INFO,
        userId,
        details: {
          clearedBy,
          reason: 'Manual unlock by administrator',
        },
      });
    }

    LoggerService.info('Account lockout cleared', { userId, clearedBy });
  } catch (error) {
    LoggerService.error('Error clearing lockout:', {}, error as Error);
    throw error;
  }
}

/**
 * Get lockout status for display (e.g., in admin panel)
 */
export async function getLockoutStatus(userId: number): Promise<{
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil?: Date;
  lastFailedLogin?: Date;
  attemptsRemaining: number;
}> {
  try {
    const [user] = await db
      .select({
        failedLoginAttempts: users.failedLoginAttempts,
        accountLockedUntil: users.accountLockedUntil,
        lastFailedLogin: users.lastFailedLogin,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        failedAttempts: 0,
        isLocked: false,
        attemptsRemaining: LOCKOUT_CONFIG.maxAttempts,
      };
    }

    const now = new Date();
    const isLocked = user.accountLockedUntil ? user.accountLockedUntil > now : false;
    const failedAttempts = user.failedLoginAttempts || 0;

    return {
      failedAttempts,
      isLocked,
      lockedUntil: isLocked ? user.accountLockedUntil! : undefined,
      lastFailedLogin: user.lastFailedLogin || undefined,
      attemptsRemaining: Math.max(0, LOCKOUT_CONFIG.maxAttempts - failedAttempts),
    };
  } catch (error) {
    LoggerService.error('Error getting lockout status:', {}, error as Error);
    return {
      failedAttempts: 0,
      isLocked: false,
      attemptsRemaining: LOCKOUT_CONFIG.maxAttempts,
    };
  }
}

/**
 * Check if IP address should be temporarily blocked (optional additional protection)
 */
export async function checkIpLockout(ipAddress: string): Promise<boolean> {
  // This is a placeholder for IP-based lockout
  // Could be implemented using Redis or in-memory cache
  // For now, always return false
  return false;
}
