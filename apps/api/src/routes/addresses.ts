
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("CUSTOMER"));

const addressSchema = z.object({
  label: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  addressLine: z.string().trim().min(5).max(300),
  landmark: z.string().trim().max(150).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid six-digit PIN code."),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});

function getUserId(req: Request): string {
  return (req as unknown as AuthenticatedRequest).user.id;
}

// GET /api/v1/addresses
router.get("/", async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: getUserId(req) },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });

    return res.json({ data: addresses });
  } catch (error) {
    console.error("Get addresses error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to load addresses.",
      },
    });
  }
});

// POST /api/v1/addresses
router.post("/", async (req, res) => {
  const parsed = addressSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid delivery address.",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const userId = getUserId(req);

    const address = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({
        where: { userId },
      });

      const makeDefault =
        parsed.data.isDefault || existingCount === 0;

      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          ...parsed.data,
          userId,
          isDefault: makeDefault,
        },
      });
    });

    return res.status(201).json({ data: address });
  } catch (error) {
    console.error("Create address error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to save delivery address.",
      },
    });
  }
});

// PATCH /api/v1/addresses/:addressId/default
router.patch("/:addressId/default", async (req, res) => {
  try {
    const userId = getUserId(req);
    const addressId = String(req.params.addressId);

    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existing) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Address not found.",
        },
      });
    }

    const address = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });

    return res.json({ data: address });
  } catch (error) {
    console.error("Set default address error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to update default address.",
      },
    });
  }
});

// DELETE /api/v1/addresses/:addressId
router.delete("/:addressId", async (req, res) => {
  try {
    const userId = getUserId(req);
    const addressId = String(req.params.addressId);

    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Address not found.",
        },
      });
    }

    if (existing._count.orders > 0) {
      return res.status(409).json({
        error: {
          code: "ADDRESS_IN_USE",
          message:
            "This address is linked to an existing order and cannot be deleted.",
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({
        where: { id: addressId },
      });

      if (existing.isDefault) {
        const nextAddress = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });

        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return res.json({
      data: {
        success: true,
        message: "Address deleted successfully.",
      },
    });
  } catch (error) {
    console.error("Delete address error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to delete address.",
      },
    });
  }
});

export default router;
