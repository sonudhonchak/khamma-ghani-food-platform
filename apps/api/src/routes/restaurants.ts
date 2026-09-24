import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

const restaurantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const createRestaurantSchema = z.object({
  name: z.string().trim().min(2).max(120),

  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain lowercase letters, numbers, and hyphens only."
    ),

  description: z.string().trim().max(1000).optional(),

  logo: z.string().url().optional(),

  coverImage: z.string().url().optional(),

  cuisine: z.string().trim().min(2).max(200),

  address: z.string().trim().min(5).max(300),

  city: z.string().trim().min(2).max(100),

  latitude: z.number().min(-90).max(90).optional(),

  longitude: z.number().min(-180).max(180).optional(),

  deliveryTime: z.number().int().min(1).max(240).default(30),

  deliveryFee: z.number().min(0).max(10000).default(0),

  minimumOrder: z.number().min(0).max(100000).default(0),

  openingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."),

  closingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."),
});

// Get active restaurants
router.get("/", async (req, res) => {
  const parsed = restaurantQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUERY",
        message: "Invalid pagination parameters.",
      },
    });
  }

  const { page, limit } = parsed.data;
  const skip = (page - 1) * limit;

  try {
    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          coverImage: true,
          cuisine: true,
          address: true,
          city: true,
          rating: true,
          deliveryTime: true,
          deliveryFee: true,
          minimumOrder: true,
          status: true,
          openingTime: true,
          closingTime: true,
          isAcceptingOrders: true,
          isBusy: true,
        },
      }),

      prisma.restaurant.count({
        where: {
          status: "ACTIVE",
        },
      }),
    ]);

    return res.json({
      data: restaurants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Restaurant list error:", error);

    return res.status(500).json({
      error: {
        code: "RESTAURANTS_FETCH_FAILED",
        message: "Unable to fetch restaurants.",
      },
    });
  }
});

// Create restaurant
router.post(
  "/",
  requireAuth,
  requireRole("RESTAURANT_OWNER"),
  async (req, res) => {
    const parsed = createRestaurantSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Please check the restaurant details.",
          details: parsed.error.flatten(),
        },
      });
    }

    const authenticatedReq = req as AuthenticatedRequest;

    const {
      name,
      slug,
      description,
      logo,
      coverImage,
      cuisine,
      address,
      city,
      latitude,
      longitude,
      deliveryTime,
      deliveryFee,
      minimumOrder,
      openingTime,
      closingTime,
    } = parsed.data;

    try {
      const existingRestaurant = await prisma.restaurant.findUnique({
        where: {
          slug,
        },
      });

      if (existingRestaurant) {
        return res.status(409).json({
          error: {
            code: "SLUG_EXISTS",
            message: "A restaurant with this slug already exists.",
          },
        });
      }

      const restaurant = await prisma.restaurant.create({
        data: {
          ownerId: authenticatedReq.user.id,
          name,
          slug,
          description: description ?? null,
          logo: logo ?? null,
          coverImage: coverImage ?? null,
          cuisine,
          address,
          city,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          deliveryTime,
          deliveryFee,
          minimumOrder,
          openingTime,
          closingTime,
        },

        select: {
          id: true,
          ownerId: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          coverImage: true,
          cuisine: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          rating: true,
          deliveryTime: true,
          deliveryFee: true,
          minimumOrder: true,
          status: true,
          openingTime: true,
          closingTime: true,
          isAcceptingOrders: true,
          isBusy: true,
          createdAt: true,
        },
      });

      return res.status(201).json({
        data: restaurant,
      });
    } catch (error) {
      console.error("Restaurant creation error:", error);

      return res.status(500).json({
        error: {
          code: "RESTAURANT_CREATE_FAILED",
          message: "Unable to create the restaurant.",
        },
      });
    }
  }
);

export default router;
