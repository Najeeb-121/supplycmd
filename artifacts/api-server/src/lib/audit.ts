import type { Request } from "express";
import type { UserRole } from "../types/auth";
import { logger } from "./logger";

export type AuditOutcome = "success" | "denied" | "failure";

export type AuditActor = {
  userId: number;
  companyId: number;
  role: UserRole;
};

export type AuditEvent = {
  action: string;
  outcome: AuditOutcome;
  actor?: AuditActor;
  targetType?: string;
  targetId?: number | string;
  targetEmail?: string;
  targetRole?: UserRole;
};

export function logAuditEvent(req: Request, event: AuditEvent): void {
  const requestActor = req.user
    ? {
      userId: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
    }
    : undefined;

  const actor = event.actor ?? requestActor;
  const auditLogger = req.log ?? logger;

  auditLogger.info(
    {
      audit: {
        action: event.action,
        outcome: event.outcome,
        companyId: actor?.companyId ?? null,
        actorUserId: actor?.userId ?? null,
        actorRole: actor?.role ?? null,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        targetEmail: event.targetEmail ?? null,
        targetRole: event.targetRole ?? null,
      },
    },
    "Audit event",
  );
}