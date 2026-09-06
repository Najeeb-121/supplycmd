import type { Request, Response, NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { SESSION_COOKIE_NAME, hashToken } from "../lib/auth";
import { verifySupabaseAccessToken } from "../lib/supabase";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // TEST-ONLY AUTHENTICATION PATH
  if (process.env.NODE_ENV !== "production" && req.headers["x-e2e-test-company-id"]) {
    const companyId = parseInt(req.headers["x-e2e-test-company-id"] as string, 10);
    req.user = { id: 1, companyId, email: "e2e-test@pepsico.local", name: "E2E Test User", role: "owner" };
    return next();
  }

  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    const accessToken = authorization.slice("Bearer ".length).trim();
    const supabaseUser = await verifySupabaseAccessToken(accessToken);

    if (!supabaseUser) {
      res.status(401).json({ error: "Invalid Supabase session" });
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
      .from(usersTable)
      .where(eq(usersTable.supabaseUserId, supabaseUser.id));

    if (!row) {
      res.status(401).json({ error: "Supabase user is not linked to a SupplyCMD account" });
      return;
    }

    req.user = {
      id: row.userId,
      companyId: row.companyId,
      email: row.email,
      name: row.name,
      role: row.role,
    };

    return next();
  }

  // Legacy SupplyCMD session fallback during Supabase migration.
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

  req.user = {
    id: row.userId,
    companyId: row.companyId,
    email: row.email,
    name: row.name,
    role: row.role,
  };

  next();
}