import { Router } from "express";
import { db } from "@workspace/db";
import { savedAddressesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendSuccess, sendNotFound } from "../../lib/response.js";

const router = Router();

router.get("/users/:id/addresses", async (req, res) => {
  const userId = req.params["id"]!;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { sendNotFound(res, "User not found"); return; }

  const addresses = await db
    .select()
    .from(savedAddressesTable)
    .where(eq(savedAddressesTable.userId, userId));

  sendSuccess(res, { addresses });
});

export default router;
