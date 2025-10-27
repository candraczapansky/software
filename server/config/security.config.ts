/**
 * Security Configuration
 * 
 * This file contains all security-related configuration settings.
 * Update these values based on your security requirements.
 */

export const securityConfig = {
  // Account Lockout Settings
  accountLockout: {
    // ENABLE THIS IN PRODUCTION!
    enabled: process.env.ENABLE_ACCOUNT_LOCKOUT === 'true' || process.env.NODE_ENV === 'production',
    maxAttempts: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5'),
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30'),
    resetAttemptsAfterMinutes: parseInt(process.env.RESET_ATTEMPTS_AFTER_MINUTES || '60'),
    progressiveLockout: process.env.PROGRESSIVE_LOCKOUT !== 'false',
  },

  // Session Management
  session: {
    // Idle timeout in minutes (no activity)
    idleTimeoutMinutes: parseInt(process.env.SESSION_IDLE_TIMEOUT || '30'),
    // Absolute timeout in hours (maximum session length)
    absoluteTimeoutHours: parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT || '12'),
    // Require re-authentication for sensitive operations
    requireReauthMinutes: parseInt(process.env.REQUIRE_REAUTH_MINUTES || '5'),
  },

  // Rate Limiting
  rateLimiting: {
    auth: {
      windowMinutes: 15,
      maxAttempts: 5,
    },
    passwordReset: {
      windowMinutes: 60,
      maxAttempts: 3,
    },
    sms: {
      windowMinutes: 60,
      maxAttempts: 5,
    },
    api: {
      windowMinutes: 15,
      maxAttempts: 100,
    },
    payment: {
      windowMinutes: 60,
      maxAttempts: 20,
    },
  },

  // Password Policy
  passwordPolicy: {
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    requireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
    requireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
    preventCommon: process.env.PASSWORD_PREVENT_COMMON !== 'false',
    historyCount: parseInt(process.env.PASSWORD_HISTORY_COUNT || '5'),
  },

  // CSRF Protection
  csrf: {
    enabled: process.env.ENABLE_CSRF !== 'false' && process.env.NODE_ENV === 'production',
    cookieName: '_csrf',
    headerName: 'x-csrf-token',
  },

  // Security Headers
  headers: {
    hsts: {
      enabled: process.env.ENABLE_HSTS !== 'false',
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    csp: {
      enabled: process.env.ENABLE_CSP !== 'false',
      reportUri: process.env.CSP_REPORT_URI,
    },
  },

  // Audit Logging
  auditLogging: {
    enabled: process.env.ENABLE_AUDIT_LOG !== 'false',
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    retention: parseInt(process.env.AUDIT_RETENTION_DAYS || '90'),
  },

  // IP-based Security
  ipSecurity: {
    enableBlacklist: process.env.ENABLE_IP_BLACKLIST === 'true',
    enableWhitelist: process.env.ENABLE_IP_WHITELIST === 'true',
    maxFailedAttemptsPerIp: parseInt(process.env.MAX_FAILED_PER_IP || '10'),
    ipBlockDurationHours: parseInt(process.env.IP_BLOCK_HOURS || '24'),
  },

  // Two-Factor Authentication
  twoFactor: {
    enabled: process.env.ENABLE_2FA === 'true',
    issuer: process.env.APP_NAME || 'Glo Esthetics',
    enforceForAdmins: process.env.ENFORCE_2FA_ADMINS === 'true',
  },
};

// Helper function to check if in production mode
export function isProductionMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Helper function to get security recommendations
export function getSecurityRecommendations(): string[] {
  const recommendations: string[] = [];

  if (!securityConfig.accountLockout.enabled) {
    recommendations.push('⚠️ Account lockout is DISABLED - Enable it to prevent brute force attacks');
  }

  if (!isProductionMode()) {
    recommendations.push('ℹ️ Running in development mode - Some security features are relaxed');
  }

  if (securityConfig.rateLimiting.auth.maxAttempts > 5) {
    recommendations.push('⚠️ Authentication rate limit is too permissive (> 5 attempts)');
  }

  if (securityConfig.passwordPolicy.minLength < 8) {
    recommendations.push('⚠️ Password minimum length is too short (< 8 characters)');
  }

  if (!securityConfig.csrf.enabled && isProductionMode()) {
    recommendations.push('⚠️ CSRF protection is disabled in production');
  }

  if (!securityConfig.auditLogging.enabled) {
    recommendations.push('ℹ️ Audit logging is disabled - Consider enabling for compliance');
  }

  if (!securityConfig.twoFactor.enabled) {
    recommendations.push('ℹ️ Two-factor authentication is disabled - Consider enabling for admins');
  }

  return recommendations;
}

// Log security status on startup
export function logSecurityStatus(): void {
  console.log('\n🔒 Security Configuration Status:');
  console.log('================================');
  console.log(`Account Lockout: ${securityConfig.accountLockout.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`CSRF Protection: ${securityConfig.csrf.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`Rate Limiting: ✅ Enabled`);
  console.log(`Session Timeout: ${securityConfig.session.idleTimeoutMinutes} min idle, ${securityConfig.session.absoluteTimeoutHours} hrs absolute`);
  console.log(`Audit Logging: ${securityConfig.auditLogging.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`2FA: ${securityConfig.twoFactor.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  
  const recommendations = getSecurityRecommendations();
  if (recommendations.length > 0) {
    console.log('\n📋 Security Recommendations:');
    recommendations.forEach(rec => console.log(`  ${rec}`));
  }
  
  console.log('================================\n');
}


