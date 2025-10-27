import { Request, Response, NextFunction } from 'express';
import { Schema } from 'zod';
import { ValidationError } from './error-handler.template';

export function validate(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      next(new ValidationError(error.message));
    }
  };
}

export function validateQuery(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      next(new ValidationError(error.message));
    }
  };
}

export function validateParams(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      next(new ValidationError(error.message));
    }
  };
}
