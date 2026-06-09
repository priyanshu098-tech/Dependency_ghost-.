import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import sandboxRouter from "./sandbox";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(sandboxRouter);

export default router;
