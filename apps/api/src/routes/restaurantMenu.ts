import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  image: z.string().url().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const createFoodItemSchema = z
  .object({
    categoryId: z.string().trim().min(1).optional(),

    name: z.string().trim().min(2).max(150),

    slug: z
      .string()
      .trim()
      .min(2)
      .max(150)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must contain lowercase letters, numbers, and hyphens only."
      ),

    description: z.string().trim().max(1000).optional(),

    price: z.number().positive().max(100000),

    discountedPrice: z.number().positive().max(100000).optional(),

    image: z.string().url().optional(),

    foodType: z.enum(["VEG", "NON_VEG", "EGG"]),

    availability: z.boolean().default(true),

    preparationTime: z.number().int().min(1).max(240).default(15),
  })
  .refine(
    (data) =>
      data.discountedPrice === undefined ||
      data.discountedPrice <= data.price,
    {
      message: "Discounted price cannot be greater than the regular price.",
      path: ["discountedPrice"],
    }
  );

async function getOwnedRestaurant(
  restaurantId: string,
  ownerId: string
) {
  return prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      ownerId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });
}

// Get restaurant menu.
// Public only for ACTIVE restaurants.
// The owner can also view their own restaurant while it is PENDING.
router.get("/:restaurantId", async (req, res) => {
  const restaurantId = Array.isArray(req.params.restaurantId)
    ? req.params.restaurantId[0]
    : req.params.restaurantId;

  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        categories: {
          orderBy: {
            sortOrder: "asc",
          },
          select: {
            id: true,
            name: true,
            image: true,
            sortOrder: true,
            foods: {
              where: {
                availability: true,
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                price: true,
                discountedPrice: true,
                image: true,
                foodType: true,
                availability: true,
                preparationTime: true,
                rating: true,
                images: {
                  orderBy: {
                    sortOrder: "asc",
                  },
                  select: {
                    id: true,
                    url: true,
                    altText: true,
                    sortOrder: true,
                    isPrimary: true,
                  },
                },
                options: {
                  select: {
                    id: true,
                    name: true,
                    isRequired: true,
                    minSelect: true,
                    maxSelect: true,
                    choices: {
                      select: {
                        id: true,
                        name: true,
                        price: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return res.status(404).json({
        error: {
          code: "RESTAURANT_NOT_FOUND",
          message: "Restaurant not found or is not active.",
        },
      });
    }

    return res.json({
      data: restaurant,
    });
  } catch (error) {
    console.error("Restaurant menu fetch error:", error);

    return res.status(500).json({
      error: {
        code: "MENU_FETCH_FAILED",
        message: "Unable to fetch the restaurant menu.",
      },
    });
  }
});

// Create a category for an owned restaurant
router.post(
  "/:restaurantId/categories",
  requireAuth,
  requireRole("RESTAURANT_OWNER"),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest;

    const restaurantId = Array.isArray(req.params.restaurantId)
      ? req.params.restaurantId[0]
      : req.params.restaurantId;

    const parsed = createCategorySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Please check the category details.",
          details: parsed.error.flatten(),
        },
      });
    }

    try {
      const restaurant = await getOwnedRestaurant(
        restaurantId,
        authenticatedReq.user.id
      );

      if (!restaurant) {
        return res.status(404).json({
          error: {
            code: "RESTAURANT_NOT_FOUND",
            message: "Restaurant not found or you do not own it.",
          },
        });
      }

      const category = await prisma.category.create({
        data: {
          restaurantId,
          name: parsed.data.name,
          image: parsed.data.image ?? null,
          sortOrder: parsed.data.sortOrder,
        },
        select: {
          id: true,
          restaurantId: true,
          name: true,
          image: true,
          sortOrder: true,
        },
      });

      return res.status(201).json({
        data: category,
      });
    } catch (error) {
      console.error("Category creation error:", error);

      return res.status(500).json({
        error: {
          code: "CATEGORY_CREATE_FAILED",
          message: "Unable to create the category.",
        },
      });
    }
  }
);

// Create a food item for an owned restaurant
router.post(
  "/:restaurantId/foods",
  requireAuth,
  requireRole("RESTAURANT_OWNER"),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest;

    const restaurantId = Array.isArray(req.params.restaurantId)
      ? req.params.restaurantId[0]
      : req.params.restaurantId;

    const parsed = createFoodItemSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Please check the food item details.",
          details: parsed.error.flatten(),
        },
      });
    }

    const {
      categoryId,
      name,
      slug,
      description,
      price,
      discountedPrice,
      image,
      foodType,
      availability,
      preparationTime,
    } = parsed.data;

    try {
      const restaurant = await getOwnedRestaurant(
        restaurantId,
        authenticatedReq.user.id
      );

      if (!restaurant) {
        return res.status(404).json({
          error: {
            code: "RESTAURANT_NOT_FOUND",
            message: "Restaurant not found or you do not own it.",
          },
        });
      }

      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: {
            id: categoryId,
            restaurantId,
          },
          select: {
            id: true,
          },
        });

        if (!category) {
          return res.status(400).json({
            error: {
              code: "INVALID_CATEGORY",
              message: "The selected category does not belong to this restaurant.",
            },
          });
        }
      }

      const existingFood = await prisma.foodItem.findFirst({
        where: {
          restaurantId,
          slug,
        },
        select: {
          id: true,
        },
      });

      if (existingFood) {
        return res.status(409).json({
          error: {
            code: "FOOD_SLUG_EXISTS",
            message: "A food item with this slug already exists in this restaurant.",
          },
        });
      }

      const foodItem = await prisma.foodItem.create({
        data: {
          restaurantId,
          categoryId: categoryId ?? null,
          name,
          slug,
          description: description ?? null,
          price,
          discountedPrice: discountedPrice ?? null,
          image: image ?? null,
          foodType,
          availability,
          preparationTime,
        },
        select: {
          id: true,
          restaurantId: true,
          categoryId: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          discountedPrice: true,
          image: true,
          foodType: true,
          availability: true,
          preparationTime: true,
          rating: true,
          createdAt: true,
        },
      });

      return res.status(201).json({
        data: foodItem,
      });
    } catch (error) {
      console.error("Food item creation error:", error);

      return res.status(500).json({
        error: {
          code: "FOOD_CREATE_FAILED",
          message: "Unable to create the food item.",
        },
      });
    }
  }
);

export default router;
