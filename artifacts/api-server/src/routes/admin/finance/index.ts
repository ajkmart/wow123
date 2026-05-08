import { Router } from "express";
import walletsRoutes from "./wallets.js";

const router = Router();

router.use("/finance", walletsRoutes);

export default router;
