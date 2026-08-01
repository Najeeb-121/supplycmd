import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import suppliersRouter from "./suppliers";
import productionRouter from "./production";
import demandRouter from "./demand";
import ordersRouter from "./orders";
import dashboardRouter from "./dashboard";
import importRouter from "./import";
import aiRouter from "./ai";
import integrationsRouter from "./integrations";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(authRouter);

// Everything below requires a logged-in user, scoped to their company
router.use(requireAuth);
router.use(inventoryRouter);
router.use(suppliersRouter);
router.use(productionRouter);
router.use(demandRouter);
router.use(ordersRouter);
router.use(dashboardRouter);
router.use(importRouter);
router.use(aiRouter);
router.use(integrationsRouter);

export default router;