# Security Environment Variables Template

Copy the configuration below to your `.env` file and adjust values for your production environment.

## Critical Security Settings - MUST Configure

```bash
# JWT Secret - CHANGE THIS! Use a strong random string (at least 32 characters)
JWT_SECRET=CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_KEY_AT_LEAST_32_CHARS

# Enable Account Lockout (set to 'true' in production)
ENABLE_ACCOUNT_LOCKOUT=true
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
RESET_ATTEMPTS_AFTER_MINUTES=60
PROGRESSIVE_LOCKOUT=true
```

## Session Management

```bash
# Session timeouts
SESSION_IDLE_TIMEOUT=30        # Minutes of inactivity before logout
SESSION_ABSOLUTE_TIMEOUT=12     # Hours - maximum session duration
REQUIRE_REAUTH_MINUTES=5        # Require password for sensitive operations
```

## Password Policy

```bash
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_PREVENT_COMMON=true
PASSWORD_HISTORY_COUNT=5
```

## Additional Security Features

```bash
# CSRF Protection (enabled by default in production)
ENABLE_CSRF=true

# Security Headers
ENABLE_HSTS=true
ENABLE_CSP=true
CSP_REPORT_URI=

# Audit Logging
ENABLE_AUDIT_LOG=true
AUDIT_LOG_LEVEL=info
AUDIT_RETENTION_DAYS=90

# IP Security
ENABLE_IP_BLACKLIST=false
ENABLE_IP_WHITELIST=false
MAX_FAILED_PER_IP=10
IP_BLOCK_HOURS=24

# Two-Factor Authentication
ENABLE_2FA=false
ENFORCE_2FA_ADMINS=false
```

## CORS Settings

```bash
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Production Mode

```bash
# Set to 'production' for production deployments
NODE_ENV=production
```

## ⚠️ Production Deployment Checklist

Before deploying to production, ensure:

1. ✅ **JWT_SECRET** is changed to a strong, unique secret (use a password generator)
2. ✅ **ENABLE_ACCOUNT_LOCKOUT** is set to `true`
3. ✅ **NODE_ENV** is set to `production`
4. ✅ **ALLOWED_ORIGINS** contains only your production domain(s)
5. ✅ Consider enabling **ENABLE_2FA** for admin accounts
6. ✅ Review and adjust rate limits based on expected usage
7. ✅ Enable **ENABLE_AUDIT_LOG** for compliance requirements
8. ✅ Test account lockout functionality
9. ✅ Verify HTTPS is enforced (ENABLE_HSTS=true)
10. ✅ Set up monitoring for security events

## 🔐 Generating Secure Secrets

To generate a secure JWT_SECRET, use one of these methods:

### Option 1: OpenSSL (Linux/Mac)
```bash
openssl rand -base64 32
```

### Option 2: Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Option 3: Online Generator
Use a reputable password generator to create a 32+ character random string

## 📊 Monitoring Security Events

With these settings enabled, monitor:
- Failed login attempts (check logs for patterns)
- Account lockouts (may indicate attack attempts)
- Rate limit violations (possible bot activity)
- CSRF violations (potential attack attempts)
- Unusual session patterns (hijacking attempts)

## 🚨 Incident Response

If you detect suspicious activity:
1. Check audit logs for patterns
2. Review locked accounts
3. Consider temporarily lowering rate limits
4. Enable IP blacklisting if under attack
5. Review security alerts in your monitoring system

## 📝 Notes

- Account lockout prevents brute force attacks
- Rate limiting protects against DoS and credential stuffing
- Session timeouts reduce risk from unattended sessions
- CSRF tokens prevent cross-site request forgery
- Security headers protect against various web vulnerabilities


