import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import sandboxRouter from "./sandbox";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(sandboxRouter);
router.use(settingsRouter);

export default router;
