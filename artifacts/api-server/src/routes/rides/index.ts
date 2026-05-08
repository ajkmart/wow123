import { Router } from "express";
import bookingRouter from "./booking.js";
import trackingRouter from "./tracking.js";
import dispatchRouter from "./dispatch.js";

export { startDispatchEngine, dispatchScheduledRides } from "./dispatch.js";

const router = Router();

router.use("/", bookingRouter);
router.use("/", trackingRouter);
router.use("/", dispatchRouter);

export default router;
