
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const testClassificationSchema = z.object({
  orderNumber: z.string().trim().min(3).max(80),
  expectedOrderTotal: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  expectedPaymentStatus: z.enum(["PENDING", "PAID"]),
  reason: z.string().trim().min(20).max(500),
  confirmation: z.literal("I_CONFIRM_TEST_ORDER_NO_REAL_CASH"),
}).strict();

type ReconciliationState =
  | "PENDING_COLLECTION"
  | "RECORDED_NOT_RECONCILED"
  | "REVIEW_REQUIRED"
  | "TEST_EXCLUDED"
  | "UNREVIEWED";

// PAID does not prove physical cash settlement.
function classifyCOD(
  paymentStatus: string,
  payment: null | {
    status: string;
    provider: string;
  },
  amountMatches: boolean,
): Exclude<ReconciliationState, "TEST_EXCLUDED" | "UNREVIEWED"> {
  if (paymentStatus === "PENDING") {
    if (!payment) {
      return "PENDING_COLLECTION";
    }

    if (
      payment.status === "PENDING" &&
      payment.provider === "COD" &&
      amountMatches
    ) {
      return "PENDING_COLLECTION";
    }

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

// Compare money as integer cents.
function toCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");

  return (
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"))
  );
}

// ==========================================
// GET ADMIN COD RECONCILIATION
// ==========================================

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
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
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

          financialClassification: {
            select: {
              type: true,
              reason: true,
              createdAt: true,
              updatedAt: true,
            },
          },

          deliveryPartner: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
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
      testExcluded: 0,
      unreviewed: 0,
    };

    const records = orders.map((order) => {
      const financialType =
        order.financialClassification?.type ?? "UNREVIEWED";

      const baseState = classifyCOD(
        order.paymentStatus,
        order.payment,
        !!order.payment &&
          order.total.equals(order.payment.amount),
      );

      let reconciliationState: ReconciliationState;

      if (financialType === "TEST") {
        reconciliationState = "TEST_EXCLUDED";
        pageSummary.testExcluded += 1;
      } else if (financialType === "UNREVIEWED") {
        reconciliationState = "UNREVIEWED";
        pageSummary.unreviewed += 1;
      } else {
        reconciliationState = baseState;

        if (baseState === "PENDING_COLLECTION") {
          pageSummary.pendingCollection += 1;
        } else if (
          baseState === "RECORDED_NOT_RECONCILED"
        ) {
          pageSummary.recordedNotReconciled += 1;
        } else {
          pageSummary.reviewRequired += 1;
        }
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

        financialType,

        excludedFromRealCashSummary:
          financialType !== "REAL",

        classificationReason:
          order.financialClassification?.reason ?? null,

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
          "Only explicitly verified REAL orders count in financial summaries. " +
          "TEST orders are excluded. UNREVIEWED orders are excluded pending review. " +
          "PAID is not proof of cash deposit or settlement. Counts are page-only.",
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

// ==========================================
// POST - CLASSIFY ORDER AS TEST
// ==========================================

// Only an authenticated ADMIN can classify a
// delivered COD order as a test transaction.
//
// This route does not modify Order.paymentStatus
// or any Payment record.

router.post("/test-orders", async (req, res) => {
  const parsed = testClassificationSchema.safeParse(
    req.body,
  );

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Order confirmation, reason and explicit test acknowledgement are required.",
      },
    });
  }

  const actorId =
    (req as AuthenticatedRequest).user.id;

  const {
    orderNumber,
    expectedOrderTotal,
    expectedPaymentStatus,
    reason,
  } = parsed.data;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: {
            orderNumber,
          },
          select: {
            id: true,
            orderNumber: true,
            total: true,
            orderStatus: true,
            paymentMethod: true,
            paymentStatus: true,
            financialClassification: {
              select: {
                type: true,
              },
            },
          },
        });

        if (!order) {
          return {
            httpStatus: 404,
            code: "ORDER_NOT_FOUND",
          } as const;
        }

        if (
          order.paymentMethod !== "COD" ||
          order.orderStatus !== "DELIVERED"
        ) {
          return {
            httpStatus: 409,
            code: "ORDER_NOT_ELIGIBLE",
          } as const;
        }

        if (
          toCents(order.total.toString()) !==
            toCents(expectedOrderTotal) ||
          order.paymentStatus !==
            expectedPaymentStatus
        ) {
          return {
            httpStatus: 409,
            code: "ORDER_DETAILS_CHANGED",
          } as const;
        }

        if (order.financialClassification) {
          return {
            httpStatus: 409,
            code: "ALREADY_CLASSIFIED",
          } as const;
        }

        await tx.orderFinancialClassification.create({
          data: {
            orderId: order.id,
            type: "TEST",
            reason,
            classifiedById: actorId,
          },
        });

        const audit =
          await tx.financialClassificationAudit.create({
            data: {
              orderId: order.id,
              actorId,
              beforeType: null,
              afterType: "TEST",
              reason,
            },
          });

        return {
          httpStatus: 201,
          code: "CLASSIFIED_AS_TEST",
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            financialType: "TEST",
            paymentStatus: order.paymentStatus,
            orderTotal: order.total.toString(),
            auditId: audit.id,
            paymentChanged: false,
          },
        } as const;
      },
      {
        isolationLevel: "Serializable",
      },
    );

    res.setHeader("Cache-Control", "no-store");

    if (result.httpStatus !== 201) {
      return res.status(result.httpStatus).json({
        error: {
          code: result.code,
          message:
            "Test order classification was not applied.",
        },
      });
    }

    return res.status(201).json({
      data: result.data,
    });
  } catch (error) {
    // Prevent duplicate classifications.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        error: {
          code: "ALREADY_CLASSIFIED",
          message: "Order is already classified.",
        },
      });
    }

    console.error(
      "Test order classification error:",
      error,
    );

    return res.status(500).json({
      error: {
        code: "TEST_CLASSIFICATION_FAILED",
        message: "Unable to classify the order.",
      },
    });
  }
});

export default router;
