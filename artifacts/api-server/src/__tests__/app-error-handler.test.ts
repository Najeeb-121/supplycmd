import { describe, expect, it, vi } from "vitest";
import express, { type Express, type RequestHandler } from "express";
import request from "supertest";
import { unhandledErrorHandler } from "../app";

describe("unhandledErrorHandler", () => {
  it("logs an unexpected error and returns only a safe 500 response", async () => {
    const error = vi.fn();

    const app: Express = express();

    const attachTestLogger: RequestHandler = (req, _res, next) => {
      req.log = {
        error,
      } as unknown as typeof req.log;

      next();
    };

    app.use(attachTestLogger);

    app.get("/boom", () => {
      throw new Error("database password=super-secret-value");
    });

    app.use(unhandledErrorHandler);

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Internal server error",
    });

    expect(JSON.stringify(res.body)).not.toContain("super-secret-value");

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        companyId: null,
        userId: null,
      }),
      "Unhandled request error",
    );
  });
});