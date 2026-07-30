import type { Request, Response } from "express";
import { z } from "zod";

/**
 * Parse `req.body` against `schema`. On success returns `{ ok: true, data }`.
 * On failure sends a 400 with `{ errors: { [field]: string } }` and returns `{ ok: false }`.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  req: Request,
  res: Response,
): { ok: true; data: T } | { ok: false } {
  const result = schema.safeParse(req.body);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  res.status(400).json({ errors });
  return { ok: false };
}
