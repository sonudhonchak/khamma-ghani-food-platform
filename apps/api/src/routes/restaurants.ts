import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

const router = Router();

const restaurantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

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

export default router;
