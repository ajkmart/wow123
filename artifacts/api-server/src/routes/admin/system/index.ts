import { Router } from "express";
import authRoutes from "./auth.js";
import usersRoutes from "./users.js";
import rbacRoutes from "./rbac.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/rbac", rbacRoutes);

export default router;
