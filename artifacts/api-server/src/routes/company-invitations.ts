import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, companyInvitationsTable, usersTable } from "@workspace/db";
import { validateBody } from "../lib/validate";
import { createInvitationToken, hashToken } from "../lib/auth";
import { logAuditEvent } from "../lib/audit";
import { requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CreateInvitationBody = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});

router.get(
  "/company/users",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const companyId = req.user!.companyId;

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId));

    res.json(users);
  },
);

router.get(
  "/company/invitations",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const companyId = req.user!.companyId;

    const invitations = await db
      .select({
        id: companyInvitationsTable.id,
        email: companyInvitationsTable.email,
        role: companyInvitationsTable.role,
        expiresAt: companyInvitationsTable.expiresAt,
        acceptedAt: companyInvitationsTable.acceptedAt,
        createdAt: companyInvitationsTable.createdAt,
      })
      .from(companyInvitationsTable)
      .where(eq(companyInvitationsTable.companyId, companyId));

    res.json(invitations);
  },
);

router.post(
  "/company/invitations",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = validateBody(CreateInvitationBody, req, res);
    if (!parsed.ok) return;

    const companyId = req.user!.companyId;
    const email = parsed.data.email.trim().toLowerCase();

    const existingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`);

    if (existingUsers.length > 0) {
      logAuditEvent(req, {
        action: "company.invitation.create",
        outcome: "denied",
        targetType: "company_invitation",
        targetEmail: email,
        targetRole: parsed.data.role,
      });

      res.status(409).json({
        error: "An account with this email already exists",
      });
      return;
    }

    const token = createInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const [existingInvitation] = await db
      .select({ id: companyInvitationsTable.id })
      .from(companyInvitationsTable)
      .where(
        sql`
          ${companyInvitationsTable.companyId} = ${companyId}
          AND lower(${companyInvitationsTable.email}) = ${email}
        `,
      );

    if (existingInvitation) {
      await db
        .update(companyInvitationsTable)
        .set({
          email,
          role: parsed.data.role,
          tokenHash: hashToken(token),
          expiresAt,
          acceptedAt: null,
          createdByUserId: req.user!.id,
        })
        .where(and(
          eq(companyInvitationsTable.id, existingInvitation.id),
          eq(companyInvitationsTable.companyId, companyId),
        ));

      logAuditEvent(req, {
        action: "company.invitation.resent",
        outcome: "success",
        targetType: "company_invitation",
        targetId: existingInvitation.id,
        targetEmail: email,
        targetRole: parsed.data.role,
      });
    } else {
      await db.insert(companyInvitationsTable).values({
        companyId,
        email,
        role: parsed.data.role,
        tokenHash: hashToken(token),
        expiresAt,
        createdByUserId: req.user!.id,
      });

      logAuditEvent(req, {
        action: "company.invitation.created",
        outcome: "success",
        targetType: "company_invitation",
        targetEmail: email,
        targetRole: parsed.data.role,
      });
    }

    res.status(201).json({
      email,
      role: parsed.data.role,
      token,
      expiresAt,
    });
  },
);

export default router;
