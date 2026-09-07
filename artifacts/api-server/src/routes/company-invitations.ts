import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, companyInvitationsTable, usersTable } from "@workspace/db";
import { validateBody } from "../lib/validate";
import { createInvitationToken, hashToken } from "../lib/auth";
import { requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CreateInvitationBody = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});

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
    } else {
      await db.insert(companyInvitationsTable).values({
        companyId,
        email,
        role: parsed.data.role,
        tokenHash: hashToken(token),
        expiresAt,
        createdByUserId: req.user!.id,
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
