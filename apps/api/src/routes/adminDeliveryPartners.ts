
import { Router } from "express";
import { z } from "zod";
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

// POST /api/v1/admin/delivery-partners
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
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message: "An account with this email or phone already exists.",
        },
      });
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

    return res.status(500).json({
      error: {
        code: "DELIVERY_PARTNER_CREATE_FAILED",
        message: "Unable to create delivery partner.",
      },
    });
  }
});

// GET /api/v1/admin/delivery-partners
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

    return res.status(500).json({
      error: {
        code: "DELIVERY_PARTNERS_FETCH_FAILED",
        message: "Unable to fetch delivery partners.",
      },
    });
  }
});

export default router;
