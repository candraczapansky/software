import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { LoggerService } from '../utils/logger.js';

// JWT token generation
export function generateToken(user: any): string {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    staffId: user.staffId, // Include staffId if available
  };
  
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable must be set');
  }
  
  return jwt.sign(payload, secret as any, { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any } as any);
}

// Security headers middleware
export function securityHeaders() {
  const cspReportUri = process.env.CSP_REPORT_URI;

  return [
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'", "https:", "data:", "blob:"],
          // Do NOT use 'unsafe-dynamic'. If you later add nonces, consider 'strict-dynamic' in script-src only
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            // Allow Helcim hosted scripts
            "https://secure.helcim.app",
            "https://*.helcim.app",
            "https://api.helcim.com",
            "https://*.helcim.com",
            // Allow Unlayer editor
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
            // Allow Replit beacon script for hosted environments
            "https://replit.com",
          ],
          // Some browsers distinguish between script elements and other script sources
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            "https://secure.helcim.app",
            "https://*.helcim.app",
            "https://api.helcim.com",
            "https://*.helcim.com",
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
            // Allow Replit beacon script for hosted environments
            "https://replit.com",
          ],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://editor.unlayer.com", "https://*.unlayer.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:", "https://editor.unlayer.com", "https://*.unlayer.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://editor.unlayer.com", "https://*.unlayer.com"],
          connectSrc: [
            "'self'",
            "https:",
            "wss:",
            // Helcim APIs and widgets may open connections
            "https://api.helcim.com",
            "https://*.helcim.com",
            "https://secure.helcim.app",
            "https://*.helcim.app",
            // Unlayer APIs
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
            "https://api.unlayer.com",
          ],
          frameSrc: [
            "'self'",
            // Allow Helcim iframes/widgets
            "https://secure.helcim.app",
            "https://*.helcim.app",
            "https://*.helcim.com",
            // Unlayer editor iframes
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
            "blob:",
          ],
          // Support workers used by embedded editors
          workerSrc: [
            "'self'",
            "blob:",
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
          ],
          // Legacy directive for some browsers
          childSrc: [
            "'self'",
            "https://editor.unlayer.com",
            "https://*.unlayer.com",
            "blob:",
          ],
          objectSrc: ["'none'"],
          // reportUri is deprecated and inconsistently parsed by browsers. If reporting is needed,
          // configure a Report-To endpoint via headers at the proxy/web server layer instead.
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // xssFilter is deprecated in modern browsers; Helmet no longer needs it explicitly
    }),
    // Permissions-Policy replacement for legacy Feature-Policy
    (req: Request, res: Response, next: NextFunction) => {
      const policy = process.env.PERMISSIONS_POLICY || 'geolocation=(), microphone=(), camera=()';
      res.setHeader('Permissions-Policy', policy);
      next();
    }
  ];
}

// CORS configuration
export function corsConfig() {
  return cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  });
}

// Rate limiting middleware
export function createRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100, // limit each IP to 100 requests per windowMs
    message: options.message || 'Too many requests from this IP, please try again later.',
    keyGenerator: options.keyGenerator || ((req: Request) => ipKeyGenerator(req.ip || req.connection.remoteAddress || 'unknown')),
    handler: (req: Request, res: Response) => {
      LoggerService.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      res.status(429).json({
        error: 'RateLimitError',
        message: 'Too many requests',
        timestamp: new Date().toISOString(),
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks and static assets
      return req.path === '/health' || req.path.startsWith('/static/');
    },
  });
}

// Use a custom IP key generator that properly handles IPv6
const rateLimitKeyGenerator = (req: Request) => {
  // Use the built-in ipKeyGenerator helper to avoid IPv6 validation errors
  const ip = ipKeyGenerator(req.ip || req.connection.remoteAddress || 'unknown');
  
  LoggerService.debug('Rate limiter key generated', { 
    originalIp: req.ip, 
    processedIp: ip,
    forwarded: req.headers['x-forwarded-for']
  });
  
  return ip;
};

// Authentication rate limiter - more restrictive for auth endpoints
export const authRateLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 5, // limit each IP to 5 requests per window (very restrictive for auth)
  message: 'Too many authentication attempts, please try again later.',
  keyGenerator: rateLimitKeyGenerator,
});

// Password reset rate limiter - very restrictive to prevent abuse
export const passwordResetRateLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later.',
  keyGenerator: rateLimitKeyGenerator,
});

// SMS rate limiter - prevent SMS bombing attacks
export const smsRateLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window  
  max: 5, // limit each IP to 5 SMS requests per hour
  message: 'Too many SMS requests, please try again later.',
  keyGenerator: rateLimitKeyGenerator,
});

// General API rate limiter - less restrictive for normal operations
export const apiRateLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 100, // 100 requests per 15 minutes for general API calls
  message: 'Too many requests, please slow down.',
  keyGenerator: rateLimitKeyGenerator,
});

// Payment rate limiter - moderate restrictions for payment operations
export const paymentRateLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // 20 payment attempts per hour
  message: 'Too many payment attempts, please try again later.',
  keyGenerator: rateLimitKeyGenerator,
});

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key] as string);
      }
    });
  }

  // Sanitize body parameters
  if (req.body) {
    sanitizeObject(req.body);
  }

  // Sanitize URL parameters
  if (req.params) {
    Object.keys(req.params).forEach(key => {
      if (typeof req.params[key] === 'string') {
        req.params[key] = sanitizeString(req.params[key]);
      }
    });
  }

  next();
}

// Input validation middleware
export function validateInput(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid input data',
        details: error.errors,
      });
    }
  };
}

// Sanitize input string function
export function sanitizeInputString(input: string): string {
  return sanitizeString(input);
}

// Escape HTML
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// SQL injection prevention
export function preventSqlInjection(req: Request, res: Response, next: NextFunction) {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(\b(OR|AND)\b\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/i,
    /(--|\/\*|\*\/|;)/,
    /(\b(WAITFOR|DELAY)\b)/i,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  const hasSqlInjection = checkValue(req.query) || checkValue(req.body) || checkValue(req.params);

  if (hasSqlInjection) {
    LoggerService.warn('Potential SQL injection attempt detected', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });

    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid input detected',
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

// XSS prevention middleware
export function preventXSS(req: Request, res: Response, next: NextFunction) {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return xssPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  const hasXSS = checkValue(req.query) || checkValue(req.body) || checkValue(req.params);

  if (hasXSS) {
    LoggerService.warn('Potential XSS attempt detected', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });

    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid input detected',
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

// Request size limiting
export function limitRequestSize(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSizeBytes = parseSize(maxSize);

    if (contentLength > maxSizeBytes) {
      LoggerService.warn('Request too large', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        contentLength,
        maxSizeBytes,
      });

      return res.status(413).json({
        error: 'PayloadTooLargeError',
        message: 'Request entity too large',
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
}

// Security logging middleware
export function securityLogging(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log suspicious requests
  const suspiciousPatterns = [
    /\.\.\//, // Directory traversal
    /<script/i, // XSS attempts
    /union\s+select/i, // SQL injection
    /eval\s*\(/i, // Code injection
    /document\.cookie/i, // Cookie theft attempts
  ];

  const userAgent = req.get('User-Agent') || '';
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || pattern.test(userAgent)
  );

  if (isSuspicious) {
    LoggerService.warn('Suspicious request detected', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent,
      headers: req.headers,
    });
  }

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      LoggerService.warn('Request completed with error', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent,
      });
    }
  });

  next();
}

// Utility functions
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

function sanitizeObject(obj: any): void {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  });
}

function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB

  const value = parseFloat(match[1]);
  const unit = match[2] || 'mb';
  
  return value * units[unit];
}

// Export specific rate limiters for different endpoints
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later.',
});

export const apiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: 'Too many file uploads, please try again later.',
}); 