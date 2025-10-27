/**
 * Security Event Monitoring and Logging
 * 
 * This module tracks security events for audit and monitoring purposes.
 * It helps detect suspicious activity and maintain compliance.
 * 
 * IMPORTANT: This only LOGS events, doesn't block anything.
 */

import LoggerService from './logger.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export enum SecurityEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  
  // Password Events
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  PASSWORD_CHANGED = 'password_changed',
  WEAK_PASSWORD_USED = 'weak_password_used',
  
  // Account Events
  ACCOUNT_CREATED = 'account_created',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  ACCOUNT_DELETED = 'account_deleted',
  
  // Security Events
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_TOKEN = 'invalid_token',
  CSRF_VIOLATION = 'csrf_violation',
  
  // Permission Events
  PERMISSION_DENIED = 'permission_denied',
  ROLE_CHANGED = 'role_changed',
  
  // Data Access Events
  SENSITIVE_DATA_ACCESSED = 'sensitive_data_accessed',
  DATA_EXPORTED = 'data_exported',
  
  // API Events
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
}

export enum SecurityEventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: number;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

class SecurityMonitor {
  private events: SecurityEvent[] = [];
  private readonly MAX_MEMORY_EVENTS = 1000;
  private failedLoginAttempts = new Map<string, number>();
  
  constructor() {
    // Initialize database table for persistent storage
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      // Create security_events table if it doesn't exist
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS security_events (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          user_id INTEGER,
          username VARCHAR(255),
          ip_address VARCHAR(45),
          user_agent TEXT,
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Create indexes for better query performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC)
      `);
    } catch (error) {
      // Table might already exist, that's fine
      console.log('Security events table initialization:', error);
    }
  }

  /**
   * Log a security event
   */
  async logEvent(event: SecurityEvent): Promise<void> {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || new Date()
    };

    // Store in memory for quick access
    this.events.push(enrichedEvent);
    if (this.events.length > this.MAX_MEMORY_EVENTS) {
      this.events.shift();
    }

    // Log to standard logger
    const logLevel = this.getLogLevel(event.severity);
    LoggerService[logLevel](`[SECURITY] ${event.type}`, {
      ...enrichedEvent
    });

    // Store in database for persistence
    try {
      await db.execute(sql`
        INSERT INTO security_events (
          event_type, severity, user_id, username, 
          ip_address, user_agent, details
        ) VALUES (
          ${event.type},
          ${event.severity},
          ${event.userId || null},
          ${event.username || null},
          ${event.ipAddress || null},
          ${event.userAgent || null},
          ${JSON.stringify(event.details || {})}
        )
      `);
    } catch (error) {
      console.error('Failed to store security event:', error);
    }

    // Check for patterns that need alerts
    await this.checkSecurityPatterns(enrichedEvent);
  }

  /**
   * Check for security patterns that need immediate attention
   */
  private async checkSecurityPatterns(event: SecurityEvent): Promise<void> {
    // Check for multiple failed login attempts
    if (event.type === SecurityEventType.LOGIN_FAILED) {
      const key = `${event.ipAddress || 'unknown'}-${event.username || 'unknown'}`;
      const attempts = (this.failedLoginAttempts.get(key) || 0) + 1;
      this.failedLoginAttempts.set(key, attempts);

      if (attempts >= 5) {
        await this.logEvent({
          type: SecurityEventType.SUSPICIOUS_ACTIVITY,
          severity: SecurityEventSeverity.WARNING,
          userId: event.userId,
          username: event.username,
          ipAddress: event.ipAddress,
          details: {
            reason: 'Multiple failed login attempts',
            attempts: attempts
          }
        });
      }

      // Reset counter after 15 minutes
      setTimeout(() => {
        this.failedLoginAttempts.delete(key);
      }, 15 * 60 * 1000);
    }

    // Alert on critical events
    if (event.severity === SecurityEventSeverity.CRITICAL) {
      console.error('🚨 CRITICAL SECURITY EVENT:', event);
      // In production, this would send alerts via email/SMS/Slack
    }
  }

  /**
   * Get recent security events
   */
  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events for a specific user
   */
  getUserEvents(userId: number, limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(e => e.userId === userId)
      .slice(-limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: SecurityEventType, limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  /**
   * Get security summary
   */
  getSecuritySummary(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentSuspiciousActivity: SecurityEvent[];
  } {
    const summary = {
      totalEvents: this.events.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      recentSuspiciousActivity: [] as SecurityEvent[]
    };

    for (const event of this.events) {
      // Count by type
      summary.eventsByType[event.type] = (summary.eventsByType[event.type] || 0) + 1;
      
      // Count by severity
      summary.eventsBySeverity[event.severity] = (summary.eventsBySeverity[event.severity] || 0) + 1;
      
      // Collect suspicious activity
      if (event.type === SecurityEventType.SUSPICIOUS_ACTIVITY) {
        summary.recentSuspiciousActivity.push(event);
      }
    }

    return summary;
  }

  /**
   * Clear old events from memory (not database)
   */
  clearOldEvents(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
    this.events = this.events.filter(e => 
      e.timestamp && e.timestamp > cutoffTime
    );
  }

  /**
   * Helper to get log level from severity
   */
  private getLogLevel(severity: SecurityEventSeverity): 'info' | 'warn' | 'error' {
    switch (severity) {
      case SecurityEventSeverity.CRITICAL:
      case SecurityEventSeverity.ERROR:
        return 'error';
      case SecurityEventSeverity.WARNING:
        return 'warn';
      default:
        return 'info';
    }
  }
}

// Export singleton instance
export const securityMonitor = new SecurityMonitor();

// Helper functions for common logging patterns
export async function logLoginAttempt(
  success: boolean,
  username: string,
  userId?: number,
  ipAddress?: string,
  userAgent?: string,
  reason?: string
): Promise<void> {
  await securityMonitor.logEvent({
    type: success ? SecurityEventType.LOGIN_SUCCESS : SecurityEventType.LOGIN_FAILED,
    severity: success ? SecurityEventSeverity.INFO : SecurityEventSeverity.WARNING,
    userId,
    username,
    ipAddress,
    userAgent,
    details: reason ? { reason } : undefined
  });
}

export async function logPasswordEvent(
  type: 'reset_requested' | 'reset_completed' | 'changed' | 'weak',
  userId?: number,
  username?: string,
  ipAddress?: string,
  details?: Record<string, any>
): Promise<void> {
  const eventTypeMap = {
    'reset_requested': SecurityEventType.PASSWORD_RESET_REQUESTED,
    'reset_completed': SecurityEventType.PASSWORD_RESET_COMPLETED,
    'changed': SecurityEventType.PASSWORD_CHANGED,
    'weak': SecurityEventType.WEAK_PASSWORD_USED
  };

  await securityMonitor.logEvent({
    type: eventTypeMap[type],
    severity: type === 'weak' ? SecurityEventSeverity.WARNING : SecurityEventSeverity.INFO,
    userId,
    username,
    ipAddress,
    details
  });
}

export async function logSuspiciousActivity(
  reason: string,
  userId?: number,
  username?: string,
  ipAddress?: string,
  details?: Record<string, any>
): Promise<void> {
  await securityMonitor.logEvent({
    type: SecurityEventType.SUSPICIOUS_ACTIVITY,
    severity: SecurityEventSeverity.WARNING,
    userId,
    username,
    ipAddress,
    details: {
      reason,
      ...details
    }
  });
}
