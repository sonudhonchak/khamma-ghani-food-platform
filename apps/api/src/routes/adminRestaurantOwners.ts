
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// All endpoints require administrator access.
router.use(requireAuth, requireRole("ADMIN"));

const createOwnerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    email: z.string().trim().email().optional(),

    phone: z
      .string()
      .trim()
      .regex(
        /^[6-9]\d{9}$/,
        "Enter a valid 10-digit Indian mobile number."
      )
      .optional(),

    password: z.string().min(8).max(128),
  })
  .strict()
  .refine((data) => Boolean(data.email || data.phone), {
    message: "Email or phone is required.",
    path: ["email"],
  });

// Create a Restaurant Owner account.
// Intended mount:
// POST /api/v1/admin/restaurant-owners
router.post("/", async (req, res) => {
  const parsed = createOwnerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please check restaurant owner details.",
        details: parsed.error.flatten(),
      },
    });
  }

  const { name, email, phone, password } = parsed.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message:
            "An account with this email or phone already exists.",
        },
      });
    }

    const passwordHash = await hashPassword(password);

    // The role is assigned by the server.
    // Never accept a role from the request body.
    const owner = await prisma.user.create({
      data: {
        name,
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
        role: "RESTAURANT_OWNER",
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      data: owner,
      message: "Restaurant Owner account created successfully.",
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message:
            "An account with this email or phone already exists.",
        },
      });
    }

    console.error(
      "Restaurant Owner creation error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "RESTAURANT_OWNER_CREATE_FAILED",
        message: "Unable to create Restaurant Owner account.",
      },
    });
  }
});

export default router;
