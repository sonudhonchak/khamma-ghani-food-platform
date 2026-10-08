
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

const createPartnerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/)
    .optional(),
  password: z.string().min(8).max(128),
  vehicleType: z.string().trim().max(50).optional(),
  vehicleNumber: z.string().trim().max(30).optional(),
}).strict();

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
}).strict();

const assignOrderSchema = z.object({
  orderId: z.string().trim().min(1),
}).strict();

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
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

// POST /api/v1/admin/delivery-partners
// Create a new delivery partner.
router.post("/", async (req, res) => {
  const parsed = createPartnerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please check delivery partner details.",
        details: parsed.error.flatten(),
      },
    });
  }

  const {
    name,
    email,
    phone,
    password,
    vehicleType,
    vehicleNumber,
  } = parsed.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (existingUser) {
      return sendError(
        res,
        409,
        "USER_EXISTS",
        "An account with this email or phone already exists."
      );
    }

    const passwordHash = await hashPassword(password);

    const partner = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone: phone ?? null,
          passwordHash,
          role: "DELIVERY_PARTNER",
        },
      });

      const profile = await tx.deliveryPartner.create({
        data: {
          userId: user.id,
          isAvailable: false,
          status: "AVAILABLE",
          vehicleType: vehicleType ?? null,
          vehicleNumber: vehicleNumber ?? null,
        },
      });

      return {
        id: profile.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isAvailable: profile.isAvailable,
        status: profile.status,
        vehicleType: profile.vehicleType,
        vehicleNumber: profile.vehicleNumber,
      };
    });

    return res.status(201).json({
      data: partner,
      message: "Delivery partner created successfully.",
    });
  } catch (error) {
    console.error("Create delivery partner error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return sendError(
        res,
        409,
        "USER_EXISTS",
        "An account with this email or phone already exists."
      );
    }

    return sendError(
      res,
      500,
      "DELIVERY_PARTNER_CREATE_FAILED",
      "Unable to create delivery partner."
    );
  }
});

// GET /api/v1/admin/delivery-partners
// List delivery partners.
router.get("/", async (_req, res) => {
  try {
    const partners = await prisma.deliveryPartner.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        isAvailable: true,
        status: true,
        vehicleType: true,
        vehicleNumber: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    return res.json({
      data: partners,
      total: partners.length,
    });
  } catch (error) {
    console.error("List delivery partners error:", error);

    return sendError(
      res,
      500,
      "DELIVERY_PARTNERS_FETCH_FAILED",
      "Unable to fetch delivery partners."
    );
  }
});

// PATCH /api/v1/admin/delivery-partners/:partnerId/availability
// Admin controls whether a partner can receive assignments.
router.patch("/:partnerId/availability", async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      400,
      "INVALID_INPUT",
      "isAvailable must be true or false."
    );
  }

  const partnerId = param(req.params.partnerId);

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      include: {
        user: {
          select: {
            status: true,
            role: true,
          },
        },
      },
    });

    if (!partner) {
      return sendError(
        res,
        404,
        "PARTNER_NOT_FOUND",
        "Delivery partner not found."
      );
    }

    if (
      partner.user.status !== "ACTIVE" ||
      partner.user.role !== "DELIVERY_PARTNER"
    ) {
      return sendError(
        res,
        409,
        "PARTNER_INACTIVE",
        "Delivery partner account is not active."
      );
    }

    const updatedCount = await prisma.deliveryPartner.updateMany({
      where: {
        id: partnerId,
        status: "AVAILABLE",
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
        isAvailable: parsed.data.isAvailable,
      },
    });

    if (updatedCount.count !== 1) {
      return sendError(
        res,
        409,
        "PARTNER_BUSY",
        "Partner has an active assignment or is not in AVAILABLE status."
      );
    }

    const updated = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        userId: true,
        isAvailable: true,
        status: true,
      },
    });

    return res.json({
      data: updated,
      message: "Delivery partner availability updated.",
    });
  } catch (error) {
    console.error("Update partner availability error:", error);

    return sendError(
      res,
      500,
      "AVAILABILITY_UPDATE_FAILED",
      "Unable to update delivery partner availability."
    );
  }
});

// POST /api/v1/admin/delivery-partners/:partnerId/assign
// Assign an available delivery partner to a ready order.
router.post("/:partnerId/assign", async (req, res) => {
  const parsed = assignOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      400,
      "INVALID_INPUT",
      "A valid orderId is required."
    );
  }

  const partnerId = param(req.params.partnerId);
  const orderId = parsed.data.orderId;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const partner = await tx.deliveryPartner.findUnique({
          where: { id: partnerId },
          include: {
            user: {
              select: {
                role: true,
                status: true,
              },
            },
          },
        });

        if (!partner) {
          return {
            error: {
              status: 404,
              code: "PARTNER_NOT_FOUND",
              message: "Delivery partner not found.",
            },
          };
        }

        if (
          partner.user.role !== "DELIVERY_PARTNER" ||
          partner.user.status !== "ACTIVE" ||
          !partner.isAvailable ||
          partner.status !== "AVAILABLE"
        ) {
          return {
            error: {
              status: 409,
              code: "PARTNER_UNAVAILABLE",
              message: "Delivery partner is not available.",
            },
          };
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderStatus: true,
            deliveryPartnerId: true,
          },
        });

        if (!order) {
          return {
            error: {
              status: 404,
              code: "ORDER_NOT_FOUND",
              message: "Order not found.",
            },
          };
        }

        if (
          order.orderStatus !== "READY_FOR_PICKUP" ||
          order.deliveryPartnerId !== null
        ) {
          return {
            error: {
              status: 409,
              code: "ORDER_NOT_ASSIGNABLE",
              message:
                "Only unassigned READY_FOR_PICKUP orders can be assigned.",
            },
          };
        }

        // Reserve this partner atomically.
        const reserved = await tx.deliveryPartner.updateMany({
          where: {
            id: partnerId,
            isAvailable: true,
            status: "AVAILABLE",
            user: {
              role: "DELIVERY_PARTNER",
              status: "ACTIVE",
            },
          },
          data: {
            isAvailable: false,
            status: "ASSIGNED",
          },
        });

        if (reserved.count !== 1) {
          return {
            error: {
              status: 409,
              code: "PARTNER_UNAVAILABLE",
              message: "Partner is no longer available.",
            },
          };
        }

        const assigned = await tx.order.updateMany({
          where: {
            id: orderId,
            orderStatus: "READY_FOR_PICKUP",
            deliveryPartnerId: null,
          },
          data: {
            deliveryPartnerId: partnerId,
          },
        });

        if (assigned.count !== 1) {
          // Throwing rolls back the partner reservation.
          throw new Error("ORDER_ASSIGNMENT_CONFLICT");
        }

        await tx.deliveryTrackingEvent.create({
          data: {
            orderId,
            deliveryPartnerId: partnerId,
            status: "ASSIGNED",
            note: "Delivery partner assigned by admin.",
          },
        });

        const updatedOrder = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            deliveryPartnerId: true,
          },
        });

        return { order: updatedOrder };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
      data: result.order,
      message: "Delivery partner assigned successfully.",
    });
  } catch (error) {
    console.error("Assign delivery partner error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return sendError(
        res,
        409,
        "ASSIGNMENT_CONFLICT",
        "Assignment conflicted with another request. Try again."
      );
    }

    if (
      error instanceof Error &&
      error.message === "ORDER_ASSIGNMENT_CONFLICT"
    ) {
      return sendError(
        res,
        409,
        "ORDER_ASSIGNMENT_CONFLICT",
        "Order was already assigned or its status changed."
      );
    }

    return sendError(
      res,
      500,
      "ORDER_ASSIGNMENT_FAILED",
      "Unable to assign delivery partner."
    );
  }
});

export default router;


