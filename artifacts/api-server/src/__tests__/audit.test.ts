import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { logAuditEvent } from "../lib/audit";

describe("logAuditEvent", () => {
  it("logs trusted tenant and actor context with safe audit fields", () => {
    const info = vi.fn();

    const req = {
      user: {
        id: 12,
        companyId: 42,
        email: "owner@example.com",
        name: "Owner User",
        role: "owner",
      },
      log: {
        info,
      },
    } as unknown as Request;

    logAuditEvent(req, {
      action: "company.invitation.created",
      outcome: "success",
      targetType: "company_invitation",
      targetId: 7,
      targetEmail: "member@example.com",
      targetRole: "member",
    });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      {
        audit: {
          action: "company.invitation.created",
          outcome: "success",
          companyId: 42,
          actorUserId: 12,
          actorRole: "owner",
          targetType: "company_invitation",
          targetId: 7,
          targetEmail: "member@example.com",
          targetRole: "member",
        },
      },
      "Audit event",
    );
  });

  it("uses null actor fields when no authenticated user is present", () => {
    const info = vi.fn();

    const req = {
      log: {
        info,
      },
    } as unknown as Request;

    logAuditEvent(req, {
      action: "auth.access.denied",
      outcome: "denied",
    });

    expect(info).toHaveBeenCalledWith(
      {
        audit: {
          action: "auth.access.denied",
          outcome: "denied",
          companyId: null,
          actorUserId: null,
          actorRole: null,
          targetType: null,
          targetId: null,
          targetEmail: null,
          targetRole: null,
        },
      },
      "Audit event",
    );
  });

  it("uses an explicit trusted actor when the request has no authenticated user", () => {
    const info = vi.fn();

    const req = {
      log: {
        info,
      },
    } as unknown as Request;

    logAuditEvent(req, {
      action: "auth.login.succeeded",
      outcome: "success",
      actor: {
        userId: 21,
        companyId: 84,
        role: "admin",
      },
      targetType: "user",
      targetId: 21,
      targetEmail: "admin@example.com",
      targetRole: "admin",
    });

    expect(info).toHaveBeenCalledWith(
      {
        audit: {
          action: "auth.login.succeeded",
          outcome: "success",
          companyId: 84,
          actorUserId: 21,
          actorRole: "admin",
          targetType: "user",
          targetId: 21,
          targetEmail: "admin@example.com",
          targetRole: "admin",
        },
      },
      "Audit event",
    );
  });

});