
import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
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
  res: Response,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({
    error: { code, message },
  });
}

const orderIdSchema = z.string().trim().min(1);

const deliveryStatusSchema = z
  .object({
    status: z.enum([
      "ACCEPTED",
      "AT_RESTAURANT",
      "PICKED_UP",
      "ON_THE_WAY",
      "DELIVERED",
    ]),
  })
  .strict();

type DeliveryProgress =
  z.infer<typeof deliveryStatusSchema>["status"];

const nextStatus: Record<string, DeliveryProgress> = {
  ASSIGNED: "ACCEPTED",
  ACCEPTED: "AT_RESTAURANT",
  AT_RESTAURANT: "PICKED_UP",
  PICKED_UP: "ON_THE_WAY",
  ON_THE_WAY: "DELIVERED",
};

// GET /api/v1/delivery/orders
router.get("/", async (req, res) => {
  const userId = getUserId(
    req as unknown as AuthenticatedRequest
  );

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
router.get("/:orderId", async (req, res) => {
  const userId = getUserId(
    req as unknown as AuthenticatedRequest
  );
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

// PATCH /api/v1/delivery/orders/:orderId/status
router.patch("/:orderId/status", async (req, res) => {
  const userId = getUserId(
    req as unknown as AuthenticatedRequest
  );
  const orderId = getParam(req.params.orderId);

  if (!orderIdSchema.safeParse(orderId).success) {
    return sendError(
      res,
      400,
      "INVALID_ORDER_ID",
      "A valid order ID is required."
    );
  }

  const parsed = deliveryStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      400,
      "INVALID_STATUS",
      "Provide a valid delivery status."
    );
  }

  const requestedStatus = parsed.data.status;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const partner = await tx.deliveryPartner.findUnique({
          where: { userId },
          select: {
            id: true,
            status: true,
            isAvailable: true,
            user: {
              select: {
                status: true,
                role: true,
              },
            },
          },
        });

        if (
          !partner ||
          partner.user.status !== "ACTIVE" ||
          partner.user.role !== "DELIVERY_PARTNER"
        ) {
          return {
            error: {
              status: 403,
              code: "PARTNER_NOT_ACTIVE",
              message: "Delivery partner is not active.",
            },
          };
        }

        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            deliveryPartnerId: partner.id,
          },
          select: {
            id: true,
            orderStatus: true,
            paymentMethod: true,
            paymentStatus: true,
          },
        });

        if (!order) {
          return {
            error: {
              status: 404,
              code: "ORDER_NOT_FOUND",
              message:
                "Order not found or not assigned to this partner.",
            },
          };
        }

        if (
          order.orderStatus === "CANCELLED" ||
          order.orderStatus === "DELIVERED"
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_ALREADY_CLOSED",
              message: "This order is already closed.",
            },
          };
        }

        if (
          nextStatus[partner.status] !== requestedStatus
        ) {
          return {
            error: {
              status: 409,
              code: "INVALID_STATUS_TRANSITION",
              message:
                "Delivery statuses must be updated in sequence.",
            },
          };
        }

        if (
          order.orderStatus !== "READY_FOR_PICKUP" &&
          order.orderStatus !== "PICKED_UP" &&
          order.orderStatus !== "OUT_FOR_DELIVERY"
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_NOT_READY",
              message:
                "The restaurant order is not ready for delivery.",
            },
          };
        }

        if (
          (requestedStatus === "ACCEPTED" ||
            requestedStatus === "AT_RESTAURANT" ||
            requestedStatus === "PICKED_UP") &&
          order.orderStatus !== "READY_FOR_PICKUP"
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_STATUS_MISMATCH",
              message: "Order must be READY_FOR_PICKUP.",
            },
          };
        }

        if (
          requestedStatus === "ON_THE_WAY" &&
          order.orderStatus !== "PICKED_UP"
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_STATUS_MISMATCH",
              message: "Order must be PICKED_UP.",
            },
          };
        }

        if (
          requestedStatus === "DELIVERED" &&
          order.orderStatus !== "OUT_FOR_DELIVERY"
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_STATUS_MISMATCH",
              message: "Order must be OUT_FOR_DELIVERY.",
            },
          };
        }

        const partnerUpdated =
          await tx.deliveryPartner.updateMany({
            where: {
              id: partner.id,
              status: partner.status,
              isAvailable: false,
            },
            data: {
              status: requestedStatus,
              isAvailable: false,
            },
          });

        if (partnerUpdated.count !== 1) {
          throw new Error("DELIVERY_UPDATE_CONFLICT");
        }

        let newOrderStatus:
          | "PICKED_UP"
          | "OUT_FOR_DELIVERY"
          | "DELIVERED"
          | null = null;

        if (requestedStatus === "PICKED_UP") {
          newOrderStatus = "PICKED_UP";
        } else if (requestedStatus === "ON_THE_WAY") {
          newOrderStatus = "OUT_FOR_DELIVERY";
        } else if (requestedStatus === "DELIVERED") {
          newOrderStatus = "DELIVERED";
        }

        if (newOrderStatus) {
          const updated = await tx.order.updateMany({
            where: {
              id: orderId,
              deliveryPartnerId: partner.id,
              orderStatus: order.orderStatus,
            },
            data: {
              orderStatus: newOrderStatus,
            },
          });

          if (updated.count !== 1) {
            throw new Error("DELIVERY_UPDATE_CONFLICT");
          }

          await tx.orderStatusHistory.create({
            data: {
              orderId,
              status: newOrderStatus,
              note: "Updated by delivery partner.",
            },
          });
        }

        await tx.deliveryTrackingEvent.create({
          data: {
            orderId,
            deliveryPartnerId: partner.id,
            status: requestedStatus,
            note: `Delivery status updated to ${requestedStatus}.`,
          },
        });

        // Automatically make the partner eligible for another assignment
        // after delivery, provided no other active orders are assigned.
        // This does not modify the order payment or COD collection state.
        if (requestedStatus === "DELIVERED") {
          const available = await tx.deliveryPartner.updateMany({
            where: {
              id: partner.id,
              status: "DELIVERED",
              isAvailable: false,
              user: {
                role: "DELIVERY_PARTNER",
                status: "ACTIVE",
              },
              orders: {
                none: {
                  orderStatus: {
                    in: [
                      "PLACED",
                      "CONFIRMED",
                      "PREPARING",
                      "READY_FOR_PICKUP",
                      "PICKED_UP",
                      "OUT_FOR_DELIVERY",
                    ],
                  },
                },
              },
            },
            data: {
              status: "AVAILABLE",
              isAvailable: true,
            },
          });

          // If another active assignment exists, leave the partner
          // unavailable rather than permitting another assignment.
          if (available.count !== 1) {
            console.info(
              "Delivery completed; partner not reset because another active order exists.",
              { partnerId: partner.id, orderId }
            );
          }
        }

        const updatedOrder = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            paymentMethod: true,
            paymentStatus: true,
          },
        });

        return {
          order: updatedOrder,
          deliveryStatus: requestedStatus,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      }
    );

    if ("error" in result && result.error) {
      return sendError(
        res,
        result.error.status,
        result.error.code,
        result.error.message
      );
    }

    return res.json({
      data: {
        order: result.order,
        deliveryStatus: result.deliveryStatus,
      },
      message: "Delivery status updated successfully.",
    });
  } catch (error) {
    console.error("Update delivery status error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return sendError(
        res,
        409,
        "DELIVERY_UPDATE_CONFLICT",
        "Concurrent update detected. Please retry."
      );
    }

    if (
      error instanceof Error &&
      error.message === "DELIVERY_UPDATE_CONFLICT"
    ) {
      return sendError(
        res,
        409,
        "DELIVERY_UPDATE_CONFLICT",
        "Delivery state changed. Refresh and retry."
      );
    }

    return sendError(
      res,
      500,
      "DELIVERY_STATUS_UPDATE_FAILED",
      "Unable to update delivery status."
    );
  }
});

// Delivery status PATCH route deployment synchronization.
export default router;


