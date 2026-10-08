
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("RESTAURANT_OWNER"));

const statusSchema = z.object({
  status: z.enum([
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
  ]),
  note: z.string().trim().max(500).optional(),
}).strict();

const allowedTransitions: Record<string, string> = {
  PLACED: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY_FOR_PICKUP",
};

function getOwnerId(req: any): string {
  return (req as AuthenticatedRequest).user.id;
}

function getOrderId(req: any): string {
  const value = req.params.orderId;
  return Array.isArray(value) ? value[0] : value;
}

function sendError(
  res: any,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({
    error: { code, message },
  });
}

// GET /api/v1/restaurant/orders
// List orders belonging to the authenticated owner.
router.get("/", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        restaurant: {
          ownerId: getOwnerId(req),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        items: true,
      },
    });

    return res.json({
      data: orders,
      total: orders.length,
    });
  } catch (error) {
    console.error("Restaurant orders fetch error:", error);

    return sendError(
      res,
      500,
      "RESTAURANT_ORDERS_FETCH_FAILED",
      "Unable to fetch restaurant orders."
    );
  }
});

// GET /api/v1/restaurant/orders/:orderId
// View an owned restaurant's order details.
router.get("/:orderId", async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: getOrderId(req),
        restaurant: {
          ownerId: getOwnerId(req),
        },
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        items: true,
        statusHistory: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!order) {
      return sendError(
        res,
        404,
        "ORDER_NOT_FOUND",
        "Order not found or does not belong to your restaurant."
      );
    }

    return res.json({
      data: order,
    });
  } catch (error) {
    console.error("Restaurant order details error:", error);

    return sendError(
      res,
      500,
      "ORDER_FETCH_FAILED",
      "Unable to fetch order details."
    );
  }
});

// PATCH /api/v1/restaurant/orders/:orderId/status
// Update order status with ownership and transition checks.
router.patch("/:orderId/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please provide a valid order status.",
        details: parsed.error.flatten(),
      },
    });
  }

  const orderId = getOrderId(req);
  const ownerId = getOwnerId(req);
  const nextStatus = parsed.data.status;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          id: orderId,
          restaurant: {
            ownerId,
          },
        },
        select: {
          id: true,
          orderStatus: true,
        },
      });

      if (!existing) {
        return {
          error: {
            status: 404,
            code: "ORDER_NOT_FOUND",
            message:
              "Order not found or does not belong to your restaurant.",
          },
        };
      }

      const expectedNextStatus =
        allowedTransitions[existing.orderStatus];

      if (expectedNextStatus !== nextStatus) {
        return {
          error: {
            status: 409,
            code: "INVALID_STATUS_TRANSITION",
            message:
              `Cannot change order status from ` +
              `${existing.orderStatus} to ${nextStatus}.`,
          },
        };
      }

      // Conditional update prevents two simultaneous requests
      // from advancing the same previous status twice.
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          orderStatus: existing.orderStatus,
          restaurant: {
            ownerId,
          },
        },
        data: {
          orderStatus: nextStatus,
        },
      });

      if (updated.count !== 1) {
        return {
          error: {
            status: 409,
            code: "ORDER_STATUS_CONFLICT",
            message:
              "Order status changed. Refresh and try again.",
          },
        };
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: nextStatus,
          note:
            parsed.data.note ??
            `Order status updated to ${nextStatus}.`,
        },
      });

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          statusHistory: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      return { order };
    });

    if ("error" in result && result.error) {
      return sendError(
        res,
        result.error.status,
        result.error.code,
        result.error.message
      );
    }

    return res.json({
      data: result.order,
      message: "Order status updated successfully.",
    });
  } catch (error) {
    console.error("Restaurant order status update error:", error);

    return sendError(
      res,
      500,
      "ORDER_STATUS_UPDATE_FAILED",
      "Unable to update order status."
    );
  }
});

export default router;
