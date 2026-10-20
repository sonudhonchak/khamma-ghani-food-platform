import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// Every route in this file requires an active, authenticated administrator.
router.use(requireAuth, requireRole("ADMIN"));

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

type ReconciliationState =
  | "PENDING_COLLECTION"
  | "RECORDED_NOT_RECONCILED"
  | "REVIEW_REQUIRED";

// A Payment row means the app has recorded a declaration, not that cash
// has been physically reconciled against a handover/deposit.
function classifyCOD(
  paymentStatus: string,
  payment: null | { status: string; provider: string },
  amountMatches: boolean
): ReconciliationState {
  if (paymentStatus === "PENDING") {
    if (!payment) return "PENDING_COLLECTION";
    if (
      payment.status === "PENDING" &&
      payment.provider === "COD" &&
      amountMatches
    ) return "PENDING_COLLECTION";
    return "REVIEW_REQUIRED";
  }

  if (
    paymentStatus === "PAID" &&
    payment?.status === "PAID" &&
    payment.provider === "COD" &&
    amountMatches
  ) {
    return "RECORDED_NOT_RECONCILED";
  }

  return "REVIEW_REQUIRED";
}

// GET /api/v1/admin/cod/reconciliation?page=1&limit=25
// Read-only. Does not mark orders PAID, settle cash, or write audit records.
router.get("/reconciliation", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUERY",
        message: "Use valid page and limit values.",
      },
    });
  }

  const { page, limit } = parsed.data;
  const where = {
    paymentMethod: "COD" as const,
    orderStatus: "DELIVERED" as const,
  };

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          updatedAt: true,
          orderStatus: true,
          paymentMethod: true,
          paymentStatus: true,
          total: true,
          deliveryPartner: {
            select: {
              id: true,
              user: { select: { name: true } },
            },
          },
          payment: {
            select: {
              id: true,
              provider: true,
              status: true,
              amount: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const pageSummary = {
      pendingCollection: 0,
      recordedNotReconciled: 0,
      reviewRequired: 0,
    };

    const records = orders.map((order) => {
      const reconciliationState = classifyCOD(
        order.paymentStatus,
        order.payment,
        !!order.payment && order.total.equals(order.payment.amount)
      );

      if (reconciliationState === "PENDING_COLLECTION") {
        pageSummary.pendingCollection += 1;
      } else if (reconciliationState === "RECORDED_NOT_RECONCILED") {
        pageSummary.recordedNotReconciled += 1;
      } else {
        pageSummary.reviewRequired += 1;
      }

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        orderStatus: order.orderStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderTotal: order.total.toString(),
        deliveryPartner: order.deliveryPartner
          ? {
              id: order.deliveryPartner.id,
              name: order.deliveryPartner.user.name,
            }
          : null,
        payment: order.payment
          ? {
              id: order.payment.id,
              provider: order.payment.provider,
              status: order.payment.status,
              amount: order.payment.amount.toString(),
              createdAt: order.payment.createdAt,
              updatedAt: order.payment.updatedAt,
            }
          : null,
        reconciliationState,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      data: {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        pageSummary,
        message:
          "Read-only review. PAID means a collection was recorded, " +
          "not that cash was reconciled or deposited. " +
          "Page counts are not all-database totals. " +
          "Simulated orders must not be treated as cash due.",
      },
    });
  } catch (error) {
    console.error("COD reconciliation read error:", error);
    return res.status(500).json({
      error: {
        code: "COD_RECONCILIATION_FETCH_FAILED",
        message: "Unable to load COD reconciliation records.",
      },
    });
  }
});

export default router;
