
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// Only authenticated administrators can use these endpoints.
router.use(requireAuth, requireRole("ADMIN"));

const optionalHttpsImage = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Use a secure HTTPS image URL.",
  })
  .optional();

const timeSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Use HH:MM in 24-hour format."
  );

const createOnboardingSchema = z
  .object({
    owner: z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email()
          .optional(),
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
      .refine(
        (value) => Boolean(value.email || value.phone),
        {
          message: "Owner email or phone is required.",
          path: ["email"],
        }
      ),

    restaurant: z
      .object({
        name: z.string().trim().min(2).max(120),

        slug: z
          .string()
          .trim()
          .toLowerCase()
          .min(2)
          .max(120)
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Invalid restaurant slug."
          ),

        description: z
          .string()
          .trim()
          .max(1000)
          .optional(),

        cuisine: z.string().trim().min(2).max(160),
        address: z.string().trim().min(3).max(500),
        city: z.string().trim().min(2).max(100),

        openingTime: timeSchema,
        closingTime: timeSchema,

        deliveryTime: z.number().int().min(1).max(240),
        deliveryFee: z.number().finite().min(0).max(10000),
        minimumOrder: z.number().finite().min(0).max(100000),

        logo: optionalHttpsImage,
        coverImage: optionalHttpsImage,
      })
      .strict(),
  })
  .strict();

// POST /api/v1/admin/restaurant-onboardings
// Both records are created together or rolled back together.
router.post("/", async (req, res) => {
  const parsed = createOnboardingSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please check the owner and restaurant details.",
        details: parsed.error.flatten(),
      },
    });
  }

  const {
    owner: inputOwner,
    restaurant: inputRestaurant,
  } = parsed.data;

  try {
    // Hash before opening the transaction.
    const passwordHash = await hashPassword(
      inputOwner.password
    );

    const result = await prisma.$transaction(async (tx) => {
      const existingOwner = await tx.user.findFirst({
        where: {
          OR: [
            ...(inputOwner.email
              ? [{ email: inputOwner.email }]
              : []),
            ...(inputOwner.phone
              ? [{ phone: inputOwner.phone }]
              : []),
          ],
        },
        select: { id: true },
      });

      if (existingOwner) {
        return { conflict: "OWNER_EXISTS" as const };
      }

      const existingRestaurant =
        await tx.restaurant.findUnique({
          where: { slug: inputRestaurant.slug },
          select: { id: true },
        });

      if (existingRestaurant) {
        return {
          conflict: "RESTAURANT_EXISTS" as const,
        };
      }

      const owner = await tx.user.create({
        data: {
          name: inputOwner.name,
          email: inputOwner.email ?? null,
          phone: inputOwner.phone ?? null,
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

      const restaurant = await tx.restaurant.create({
        data: {
          ownerId: owner.id,

          name: inputRestaurant.name,
          slug: inputRestaurant.slug,
          description: inputRestaurant.description ?? null,
          cuisine: inputRestaurant.cuisine,

          address: inputRestaurant.address,
          city: inputRestaurant.city,

          openingTime: inputRestaurant.openingTime,
          closingTime: inputRestaurant.closingTime,

          deliveryTime: inputRestaurant.deliveryTime,
          deliveryFee: inputRestaurant.deliveryFee,
          minimumOrder: inputRestaurant.minimumOrder,

          logo: inputRestaurant.logo ?? null,
          coverImage: inputRestaurant.coverImage ?? null,

          status: "PENDING",
          isAcceptingOrders: false,
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          slug: true,
          city: true,
          status: true,
          isAcceptingOrders: true,
          createdAt: true,
        },
      });

      return { owner, restaurant };
    });

    if ("conflict" in result) {
      return res.status(409).json({
        error: {
          code: result.conflict,

          message:
            result.conflict === "OWNER_EXISTS"
              ? "An account with this email or phone already exists. No restaurant was created."
              : "A restaurant with this slug already exists. No owner was created.",
        },
      });
    }

    return res.status(201).json({
      data: result,
      message:
        "Restaurant Owner and pending restaurant created successfully.",
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_OWNER_OR_RESTAURANT",
          message:
            "Email, phone, or restaurant slug already exists. No new onboarding was saved.",
        },
      });
    }

    console.error(
      "Admin restaurant onboarding error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "RESTAURANT_ONBOARDING_FAILED",
        message:
          "Unable to register restaurant and owner. No partial onboarding should be saved.",
      },
    });
  }
});

export default router;
