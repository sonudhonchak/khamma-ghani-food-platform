
import { Router, type Request } from "express";
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

const collectionSchema = z.object({
  amount: z.union([
    z.number().positive().finite(),
    z.string().regex(/^\d+(\.\d{1,2})?$/),
  ]),
}).strict();

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

function failure(
  status: number,
  code: string,
  message: string
) {
  return { error: { status, code, message } };
}

// POST /api/v1/delivery/orders/:orderId/cod-collection
router.post("/:orderId/cod-collection", async (req, res) => {
  const parsed = collectionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide a valid collected amount.",
      },
    });
  }

  const orderId = String(req.params.orderId);
  const userId = getUserId(req);
  const collectedAmount = new Prisma.Decimal(parsed.data.amount);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const partner = await tx.deliveryPartner.findUnique({
          where: { userId },
          include: {
            user: {
              select: { status: true },
            },
          },
        });

        if (!partner || partner.user.status !== "ACTIVE") {
          return failure(
            403,
            "PARTNER_NOT_ACTIVE",
            "Active delivery partner account required."
          );
        }

        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            deliveryPartnerId: partner.id,
          },
          include: { payment: true },
        });

        if (!order) {
          return failure(
            404,
            "ORDER_NOT_FOUND",
            "Assigned order not found."
          );
        }

        if (order.paymentMethod !== "COD") {
          return failure(
            409,
            "NOT_COD",
            "This order does not use Cash on Delivery."
          );
        }

        if (order.orderStatus !== "DELIVERED") {
          return failure(
            409,
            "ORDER_NOT_DELIVERED",
            "Complete delivery before confirming COD collection."
          );
        }

        if (order.paymentStatus !== "PENDING") {
          return failure(
            409,
            "PAYMENT_ALREADY_PROCESSED",
            "Payment is not pending."
          );
        }

        if (order.payment?.status === "PAID") {
          return failure(
            409,
            "PAYMENT_ALREADY_COLLECTED",
            "COD payment has already been recorded."
          );
        }

        if (!collectedAmount.equals(order.total)) {
          return failure(
            409,
            "AMOUNT_MISMATCH",
            "Collected amount must match the order total."
          );
        }

        // Claim the pending payment atomically.
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            deliveryPartnerId: partner.id,
            orderStatus: "DELIVERED",
            paymentMethod: "COD",
            paymentStatus: "PENDING",
          },
          data: {
            paymentStatus: "PAID",
          },
        });

        if (claimed.count !== 1) {
          return failure(
            409,
            "PAYMENT_CONFLICT",
            "Payment has already changed."
          );
        }

        const payment = await tx.payment.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            provider: "COD",
            amount: order.total,
            status: "PAID",
            rawReference:
              "Cash collection confirmed by delivery partner " +
              partner.id,
          },
          update: {
            provider: "COD",
            amount: order.total,
            status: "PAID",
            rawReference:
              "Cash collection confirmed by delivery partner " +
              partner.id,
          },
        });

        return {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            orderStatus: order.orderStatus,
            paymentMethod: order.paymentMethod,
            paymentStatus: "PAID",
            total: order.total,
          },
          payment: {
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            provider: payment.provider,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      }
    );

    if ("error" in result) {
      return res.status(result.error.status).json({
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
    }

    return res.json({
      data: result,
      message: "COD cash collection recorded successfully.",
    });
  } catch (error) {
    console.error("COD collection error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      return res.status(409).json({
        error: {
          code: "PAYMENT_CONFLICT",
          message: "Payment changed. Please refresh and try again.",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to record COD collection.",
      },
    });
  }
});

export default router;
