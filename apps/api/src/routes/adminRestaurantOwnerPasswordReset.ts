
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword } from "../auth.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

const resetSchema = z
  .object({
    restaurantId: z.string().trim().min(1).max(100),
    newPassword: z.string().min(12).max(128),
    ownerIdentityAndConsentVerified: z.literal(true),
  })
  .strict();

// POST /api/v1/admin/restaurant-owners/:ownerId/reset-password
// Admin must independently verify owner identity and consent.

router.post("/:ownerId/reset-password", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const ownerId = Array.isArray(req.params.ownerId)
    ? req.params.ownerId[0]
    : req.params.ownerId;

  if (!ownerId || ownerId.length > 100) {
    return res.status(400).json({
      error: {
        code: "INVALID_OWNER_ID",
        message: "Invalid owner ID.",
      },
    });
  }

  const parsed = resetSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message:
          "Restaurant ID, strong new password (12+ characters), and confirmed owner authorization are required.",
      },
    });
  }

  const { restaurantId, newPassword } = parsed.data;

  const adminId = (req as AuthenticatedRequest).user.id;

  try {
    // Never reset an Admin, Customer, or Rider using this route.
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (
      !owner ||
      owner.role !== "RESTAURANT_OWNER" ||
      owner.status !== "ACTIVE"
    ) {
      return res.status(404).json({
        error: {
          code: "ACTIVE_OWNER_NOT_FOUND",
          message:
            "No active Restaurant Owner account matches this ID.",
        },
      });
    }

    // Verify the restaurant actually belongs to this owner.
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!restaurant) {
      return res.status(409).json({
        error: {
          code: "OWNER_RESTAURANT_MISMATCH",
          message:
            "The supplied restaurant does not belong to this owner.",
        },
      });
    }

    // Hash the new password before starting the transaction.
    const passwordHash = await hashPassword(newPassword);
    const revokedAt = new Date();

    const revokedSessions = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.user.updateMany({
          where: {
            id: ownerId,
            role: "RESTAURANT_OWNER",
            status: "ACTIVE",
          },
          data: {
            passwordHash,
          },
        });

        if (updated.count !== 1) {
          throw new Error("OWNER_CHANGED_DURING_RESET");
        }

        // Revoke old sessions so the owner must log in again.
        const revoked = await tx.authSession.updateMany({
          where: {
            userId: ownerId,
            revokedAt: null,
          },
          data: {
            revokedAt,
          },
        });

        return revoked.count;
      }
    );

    // Audit the action without logging passwords or tokens.
    console.info("Restaurant owner password reset", {
      adminId,
      ownerId,
      restaurantId,
      revokedSessions,
    });

    return res.status(200).json({
      data: {
        ownerId,
        restaurantId,
        sessionsRevoked: revokedSessions,
      },
      message:
        "Owner password reset. Previous sessions have been revoked.",
    });
  } catch (error) {
    console.error("Restaurant owner password reset failed", {
      adminId,
      ownerId,
      restaurantId,
      errorCode:
        error instanceof Error
          ? error.name
          : "UNKNOWN_ERROR",
    });

    return res.status(500).json({
      error: {
        code: "OWNER_PASSWORD_RESET_FAILED",
        message:
          "Unable to reset the password. The previous password remains valid if the transaction rolled back.",
      },
    });
  }
});

export default router;
            
