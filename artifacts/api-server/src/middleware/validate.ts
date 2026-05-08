import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";
import { logger } from "../lib/logger.js";

interface ValidationTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

const formatZodErrors = (err: ZodError): string => {
  return err.errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join(".")}: ` : "";
      return `${path}${e.message}`;
    })
    .join("; ");
};

const VALIDATION_ERROR_UR = "توثیق کی خرابی۔ اپنا ان پٹ چیک کریں۔";

export function validate(schema: ValidationTarget) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        const parsed = schema.query.parse(req.query) as Record<string, unknown>;
        Object.keys(req.query).forEach(k => { if (!(k in parsed)) delete (req.query as Record<string, unknown>)[k]; });
        Object.assign(req.query, parsed);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = formatZodErrors(err);
        logger.warn({ validationErrors: err.errors, url: req.url, method: req.method }, "Request validation failed");
        res.status(400).json({
          success: false,
          error: details,
          message: VALIDATION_ERROR_UR,
          code: "VALIDATION",
        });
        return;
      }
      next(err);
    }
  };
}

export function validateBody(schema: ZodSchema) {
  return validate({ body: schema });
}

export function validateQuery(schema: ZodSchema) {
  return validate({ query: schema });
}

export function validateParams(schema: ZodSchema) {
  return validate({ params: schema });
}
