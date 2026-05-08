import { Router } from "express";
import ridesRoutes from "./rides.js";
import zonesRoutes from "./zones.js";

const router = Router();

router.use("/rides", ridesRoutes);
router.use("/service-zones", zonesRoutes);

export default router;
