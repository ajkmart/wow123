import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export function loadRide() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rideId = String(req.params["id"] ?? "");
    if (!rideId) {
      res.status(400).json({ error: "Ride ID is required" });
      return;
    }

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    req.ride = ride;
    next();
  };
}

export function requireRideState(allowedStates: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let ride = req.ride;

    if (!ride) {
      const rideId = String(req.params["id"] ?? "");
      if (!rideId) {
        res.status(400).json({ error: "Ride ID is required" });
        return;
      }

      const [found] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
      if (!found) {
        res.status(404).json({ error: "Ride not found" });
        return;
      }
      ride = found;
    }

    if (!allowedStates.includes(ride!.status)) {
      res.status(400).json({
        error: `Ride cannot be modified in '${ride!.status}' state. Allowed: ${allowedStates.join(", ")}`,
      });
      return;
    }

    req.ride = ride;
    next();
  };
}

export function requireRideOwner(field: "userId" | "riderId") {
  return (req: Request, res: Response, next: NextFunction) => {
    const ride = req.ride;
    if (!ride) {
      res.status(500).json({ error: "Internal: ride not loaded" });
      return;
    }

    const callerId = field === "userId" ? req.customerId : req.riderId;
    if (!callerId || ride[field] !== callerId) {
      res.status(403).json({ error: "Access denied — not your ride" });
      return;
    }

    next();
  };
}
