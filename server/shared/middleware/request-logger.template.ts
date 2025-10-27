import { Request, Response, NextFunction } from 'express';
import { logger } from '../../core/logger';
import { v4 as uuidv4 } from 'uuid';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate unique request ID if not present
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.headers['x-request-id'] = requestId;

  // Log request start
  const startTime = Date.now();
  logger.info({
    type: 'request_start',
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined
    }
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      type: 'request_end',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      size: res.getHeader('content-length')
    });
  });

  // Log errors
  res.on('error', (error) => {
    logger.error({
      type: 'request_error',
      requestId,
      method: req.method,
      path: req.path,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  });

  next();
}

export function performanceLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'];

  // Log slow requests
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 1000) { // Log requests taking more than 1 second
      logger.warn({
        type: 'slow_request',
        requestId,
        method: req.method,
        path: req.path,
        duration,
        threshold: 1000
      });
    }
  });

  next();
}
