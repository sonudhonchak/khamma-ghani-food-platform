
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("DELIVERY_PARTNER"));

function getUserId(req: AuthenticatedRequest): string {
  return req.user.id;
}

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

const orderIdSchema = z.string().trim().min(1);

// GET /api/v1/delivery/orders
// Only return orders assigned to the logged-in delivery partner.
router.get("/", async (req, res) => {
  const userId = getUserId(req as AuthenticatedRequest);

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!partner) {
      return sendError(
        res,
        404,
        "DELIVERY_PROFILE_NOT_FOUND",
        "Delivery partner profile not found."
      );
    }

    const orders = await prisma.order.findMany({
      where: {
        deliveryPartnerId: partner.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        deliveryFee: true,
        createdAt: true,
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        addressCitySnapshot: true,
        addressPincodeSnapshot: true,
      },
    });

    return res.json({
      data: orders,
      total: orders.length,
    });
  } catch (error) {
    console.error("Fetch delivery orders error:", error);

    return sendError(
      res,
      500,
      "DELIVERY_ORDERS_FETCH_FAILED",
      "Unable to fetch assigned delivery orders."
    );
  }
});

// GET /api/v1/delivery/orders/:orderId
// Full delivery information only for the assigned partner.
router.get("/:orderId", async (req, res) => {
  const userId = getUserId(req as AuthenticatedRequest);
  const orderId = getParam(req.params.orderId);

  if (!orderIdSchema.safeParse(orderId).success) {
    return sendError(
      res,
      400,
      "INVALID_ORDER_ID",
      "A valid order ID is required."
    );
  }

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!partner) {
      return sendError(
        res,
        404,
        "DELIVERY_PROFILE_NOT_FOUND",
        "Delivery partner profile not found."
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryPartnerId: partner.id,
      },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotal: true,
        deliveryFee: true,
        taxes: true,
        discount: true,
        total: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        addressNameSnapshot: true,
        addressPhoneSnapshot: true,
        addressLineSnapshot: true,
        addressLandmarkSnapshot: true,
        addressCitySnapshot: true,
        addressStateSnapshot: true,
        addressPincodeSnapshot: true,
        addressLatitudeSnapshot: true,
        addressLongitudeSnapshot: true,
        items: true,
        deliveryEvents: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            status: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      return sendError(
        res,
        404,
        "ORDER_NOT_FOUND",
        "Order not found or not assigned to this partner."
      );
    }

    return res.json({
      data: order,
    });
  } catch (error) {
    console.error("Fetch assigned delivery order error:", error);

    return sendError(
      res,
      500,
      "DELIVERY_ORDER_FETCH_FAILED",
      "Unable to fetch assigned delivery order."
    );
  }
});

export default router;
