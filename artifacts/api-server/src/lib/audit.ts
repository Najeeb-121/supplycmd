import type { Request } from "express";
import type { UserRole } from "../types/auth";
import { logger } from "./logger";

export type AuditOutcome = "success" | "denied" | "failure";

export type AuditEvent = {
  action: string;
  outcome: AuditOutcome;
  targetType?: string;
  targetId?: number | string;
  targetEmail?: string;
  targetRole?: UserRole;
};

export function logAuditEvent(req: Request, event: AuditEvent): void {
  const actor = req.user;
  const auditLogger = req.log ?? logger;

  auditLogger.info(
    {
      audit: {
        action: event.action,
        outcome: event.outcome,
        companyId: actor?.companyId ?? null,
        actorUserId: actor?.id ?? null,
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