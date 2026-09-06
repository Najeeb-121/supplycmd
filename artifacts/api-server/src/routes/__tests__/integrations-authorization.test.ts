import { describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import integrationsRouter from "../integrations";
import type { UserRole } from "../../types/auth";

function createTestApp(role: UserRole): Express {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = {
      id: 1,
      companyId: 1,
      email: `${role}@example.com`,
      name: role,
      role,
    };
    next();
  });

  app.use("/api", integrationsRouter);

  return app;
}

describe("Odoo connection authorization", () => {
  it("blocks members from changing the company Odoo connection", async () => {
    const app = createTestApp("member");

    const res = await request(app)
      .put("/api/integrations/odoo/connection")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Insufficient permissions" });
  });

  it("allows owners through the role gate", async () => {
    const app = createTestApp("owner");

    const res = await request(app)
      .put("/api/integrations/odoo/connection")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
  });

  it("allows admins through the role gate", async () => {
    const app = createTestApp("admin");

    const res = await request(app)
      .put("/api/integrations/odoo/connection")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
  });
});
