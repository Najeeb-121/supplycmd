import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  companiesTable,
  companyInvitationsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { validateBody } from "../lib/validate";
import { requireAuth } from "../middlewares/require-auth";
import {
  hashPassword,
  verifyPassword,
  createSession,
  cookieOptions,
  SESSION_COOKIE_NAME,
  hashToken,
  normalizeEmail,
} from "../lib/auth";

const router: IRouter = Router();

const StrictSignupBody = SignupBody.extend({
  companyName: z.string().min(1, "Company name is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const AcceptInvitationBody = z.object({
  token: z.string().min(1, "Invitation token is required"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/auth/signup", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(StrictSignupBody, req, res);
  if (!parsed.ok) return;
  const email = normalizeEmail(parsed.data.email);

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
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
        email,
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

router.post(
  "/auth/invitations/accept",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = validateBody(AcceptInvitationBody, req, res);
    if (!parsed.ok) return;

    const tokenHash = hashToken(parsed.data.token);

    const [invitation] = await db
      .select({
        id: companyInvitationsTable.id,
        companyId: companyInvitationsTable.companyId,
        email: companyInvitationsTable.email,
        role: companyInvitationsTable.role,
        expiresAt: companyInvitationsTable.expiresAt,
        acceptedAt: companyInvitationsTable.acceptedAt,
      })
      .from(companyInvitationsTable)
      .where(eq(companyInvitationsTable.tokenHash, tokenHash));

    if (
      !invitation ||
      invitation.acceptedAt !== null ||
      invitation.expiresAt <= new Date() ||
      (invitation.role !== "admin" && invitation.role !== "member")
    ) {
      res.status(400).json({ error: "Invitation is invalid or expired" });
      return;
    }

    const email = invitation.email.trim().toLowerCase();
    const passwordHash = await hashPassword(parsed.data.password);

    const result = await db.transaction(async (tx) => {
      const existingUsers = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`);

      if (existingUsers.length > 0) {
        return { conflict: true as const };
      }

      const [acceptedInvitation] = await tx
        .update(companyInvitationsTable)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(companyInvitationsTable.id, invitation.id),
            isNull(companyInvitationsTable.acceptedAt),
            gt(companyInvitationsTable.expiresAt, new Date()),
          ),
        )
        .returning({ id: companyInvitationsTable.id });

      if (!acceptedInvitation) {
        return { invalid: true as const };
      }

      const [user] = await tx
        .insert(usersTable)
        .values({
          companyId: invitation.companyId,
          email,
          passwordHash,
          name: parsed.data.name,
          role: invitation.role,
        })
        .returning();

      const [company] = await tx
        .select({
          id: companiesTable.id,
          name: companiesTable.name,
        })
        .from(companiesTable)
        .where(eq(companiesTable.id, invitation.companyId));

      if (!company) {
        throw new Error("Invitation company not found");
      }

      return { user, company };
    });

    if ("conflict" in result) {
      res.status(409).json({
        error: "An account with this email already exists",
      });
      return;
    }

    if ("invalid" in result) {
      res.status(400).json({ error: "Invitation is invalid or expired" });
      return;
    }

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
  },
);

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(LoginBody, req, res);
  if (!parsed.ok) return;
  const email = normalizeEmail(parsed.data.email);

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
    .where(sql`lower(${usersTable.email}) = ${email}`);

  if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
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