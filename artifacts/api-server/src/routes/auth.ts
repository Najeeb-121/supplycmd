import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, companiesTable, usersTable } from "@workspace/db";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { validateBody } from "../lib/validate";
import { requireAuth } from "../middlewares/require-auth";
import { hashPassword, verifyPassword, createSession, cookieOptions, SESSION_COOKIE_NAME, hashToken } from "../lib/auth";
import { verifySupabaseAccessToken } from "../lib/supabase";
import { sessionsTable } from "@workspace/db";

const router: IRouter = Router();

const StrictSignupBody = SignupBody.extend({
  companyName: z.string().min(1, "Company name is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
const SupabaseProvisionBody = z.object({
  companyName: z.string().min(1, "Company name is required"),
  name: z.string().min(1, "Name is required"),
});

router.post("/auth/supabase/provision", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(SupabaseProvisionBody, req, res);
  if (!parsed.ok) return;

  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Supabase session" });
    return;
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const supabaseUser = await verifySupabaseAccessToken(accessToken);

  if (!supabaseUser || !supabaseUser.email) {
    res.status(401).json({ error: "Invalid Supabase session" });
    return;
  }

  const [existingBySupabaseId] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.supabaseUserId, supabaseUser.id));

  if (existingBySupabaseId) {
    res.status(409).json({ error: "Supabase account is already linked" });
    return;
  }

  const [existingByEmail] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, supabaseUser.email));

  if (existingByEmail) {
    res.status(409).json({
      error: "A SupplyCMD account with this email already exists",
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companiesTable)
      .values({ name: parsed.data.companyName })
      .returning();

    const [user] = await tx
      .insert(usersTable)
      .values({
        companyId: company.id,
        email: supabaseUser.email!,
        supabaseUserId: supabaseUser.id,
        passwordHash: null,
        name: parsed.data.name,
        role: "owner",
      })
      .returning();

    return { company, user };
  });

  res.status(201).json({
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    companyId: result.company.id,
    companyName: result.company.name,
  });
});

router.post("/auth/signup", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(StrictSignupBody, req, res);
  if (!parsed.ok) return;

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing.length > 0) {
    res.status(400).json({ errors: { email: "An account with this email already exists" } });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const result = await db.transaction(async (tx) => {
    const [company] = await tx.insert(companiesTable).values({ name: parsed.data.companyName }).returning();
    const [user] = await tx
      .insert(usersTable)
      .values({
        companyId: company.id,
        email: parsed.data.email,
        passwordHash,
        name: parsed.data.name,
        role: "owner",
      })
      .returning();
    return { company, user };
  });

  const { token, expiresAt } = await createSession(result.user.id);
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
  res.status(201).json({
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    companyId: result.company.id,
    companyName: result.company.name,
  });
});

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(LoginBody, req, res);
  if (!parsed.ok) return;

  const [row] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      passwordHash: usersTable.passwordHash,
      companyId: companiesTable.id,
      companyName: companiesTable.name,
    })
    .from(usersTable)
    .innerJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
    .where(eq(usersTable.email, parsed.data.email));

  if (!row || !row.passwordHash || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const { token, expiresAt } = await createSession(row.id);
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
  res.json({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    companyId: row.companyId,
    companyName: row.companyName,
  });
});

router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, req.user!.companyId));
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    name: req.user!.name,
    role: req.user!.role,
    companyId: req.user!.companyId,
    companyName: company?.name ?? "",
  });
});

export default router;