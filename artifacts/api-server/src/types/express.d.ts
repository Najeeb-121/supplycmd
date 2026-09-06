import "express";
import type { UserRole } from "./auth";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        companyId: number;
        email: string;
        name: string;
        role: UserRole;
      };
    }
  }
}
