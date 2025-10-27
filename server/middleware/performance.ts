import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import path from 'path';

/**
 * Compression middleware for better performance
 * Compresses responses for faster transmission
 */
export const compressionMiddleware = compression({
  filter: (req, res) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Don't compress authentication endpoints to avoid issues
    if (req.path.includes('/auth/') || req.path.includes('/login')) {
      return false;
    }
    // Use compression for text-based responses
    return compression.filter(req, res);
  },
  level: 6, // Balance between speed and compression ratio
});

/**
 * Caching headers for static assets
 */
export const staticCacheMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const ext = path.extname(req.url);
  
  // Long cache for immutable assets (hashed filenames)
  if (req.url.includes('-') && req.url.includes('.')) {
    // Vite generates files with hash in name like 'index-KO_qdURY.js'
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  // Short cache for HTML files
  else if (ext === '.html' || ext === '') {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  // Medium cache for other static assets
  else if (['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
  }
  
  next();
};

/**
 * API response caching headers
 */
export const apiCacheMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // No caching for API routes by default
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
};

/**
 * Performance headers
 */
export const performanceHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Enable browser connection reuse
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5');
  
  // Resource hints for faster subsequent navigation
  if (req.path === '/' || req.path === '/index.html') {
    // Preconnect to common CDNs
    res.setHeader('Link', '<https://secure.helcim.app>; rel=preconnect');
  }
  
  next();
};
