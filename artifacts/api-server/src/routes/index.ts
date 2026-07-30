import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inventoryRouter from "./inventory";
import suppliersRouter from "./suppliers";
import productionRouter from "./production";
import demandRouter from "./demand";
import ordersRouter from "./orders";
import dashboardRouter from "./dashboard";
import importRouter from "./import";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inventoryRouter);
router.use(suppliersRouter);
router.use(productionRouter);
router.use(demandRouter);
router.use(ordersRouter);
router.use(dashboardRouter);
router.use(importRouter);
router.use(aiRouter);

export default router;
