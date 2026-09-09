import type { Request, Response, NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, hashToken } from "../lib/auth";
import { logAuditEvent } from "../lib/audit";
import { isUserRole } from "../types/auth";
import type { UserRole } from "../types/auth";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // TEST-ONLY AUTHENTICATION PATH
  if (process.env.NODE_ENV !== "production" && req.headers["x-e2e-test-company-id"]) {
    const companyId = parseInt(req.headers["x-e2e-test-company-id"] as string, 10);
    req.user = { id: 1, companyId, email: "e2e-test@pepsico.local", name: "E2E Test User", role: "owner" };
    return next();
  }


  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!token) {
    logAuditEvent(req, {
      action: "auth.session.missing",
      outcome: "denied",
    });

    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [row] = await db
    .select({
      userId: usersTable.id,
      companyId: usersTable.companyId,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.tokenHash, hashToken(token)), gt(sessionsTable.expiresAt, new Date())));

  if (!row) {
    logAuditEvent(req, {
      action: "auth.session.invalid",
      outcome: "denied",
    });

    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }
  if (!isUserRole(row.role)) {
    logAuditEvent(req, {
      action: "auth.role.invalid",
      outcome: "denied",
      targetType: "user",
      targetId: row.userId,
      targetEmail: row.email,
    });

    res.status(403).json({ error: "Invalid user role" });
    return;
  }

  req.user = { id: row.userId, companyId: row.companyId, email: row.email, name: row.name, role: row.role };
  next();
}
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      logAuditEvent(req, {
        action: "authorization.user.missing",
        outcome: "denied",
      });

      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logAuditEvent(req, {
        action: "authorization.role.denied",
        outcome: "denied",
        targetType: "user",
        targetId: req.user.id,
        targetEmail: req.user.email,
        targetRole: req.user.role,
      });

      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
