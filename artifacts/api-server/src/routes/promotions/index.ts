import { Router } from "express";
import publicRouter from "./public.js";
import campaignsRouter from "./campaigns.js";
import offersRouter from "./offers.js";

const router = Router();

router.use("/", publicRouter);
router.use("/", campaignsRouter);
router.use("/", offersRouter);

export default router;
