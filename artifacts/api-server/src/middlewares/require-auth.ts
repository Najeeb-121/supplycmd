import type { Request, Response, NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, hashToken } from "../lib/auth";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // TEST-ONLY AUTHENTICATION PATH
  if (process.env.NODE_ENV !== "production" && req.headers["x-e2e-test-company-id"]) {
    const companyId = parseInt(req.headers["x-e2e-test-company-id"] as string, 10);
    req.user = { id: 1, companyId, email: "e2e-test@pepsico.local", name: "E2E Test User", role: "owner" };
    return next();
  }

  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!token) {
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
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.user = { id: row.userId, companyId: row.companyId, email: row.email, name: row.name, role: row.role };
  next();
}