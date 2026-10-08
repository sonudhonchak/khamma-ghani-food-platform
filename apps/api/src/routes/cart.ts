
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("CUSTOMER"));

const addItemSchema = z.object({
  foodItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
  selectedOptions: z.record(z.string(), z.unknown()).optional(),
});

const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

function getUserId(req: Parameters<typeof requireAuth>[0] extends never ? never : any): string {
  const authenticatedReq = req as unknown as AuthenticatedRequest;
  return authenticatedReq.user.id;
}

const cartInclude = {
  restaurant: {
    select: {
      id: true,
      name: true,
      deliveryFee: true,
      minimumOrder: true,
    },
  },
  items: {
    include: {
      foodItem: {
        select: {
          id: true,
          name: true,
          image: true,
          availability: true,
          price: true,
          discountedPrice: true,
          foodType: true,
        },
      },
    },
    orderBy: {
      id: "asc" as const,
    },
  },
};

async function getCart(userId: string) {
  return prisma.cart.findUnique({
    where: { userId },
    include: cartInclude,
  });
}

function formatCart(cart: Awaited<ReturnType<typeof getCart>>) {
  if (!cart) {
    return {
      cart: null,
      items: [],
      itemCount: 0,
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
    };
  }

  const items = cart.items.map((item) => ({
    id: item.id,
    foodItemId: item.foodItemId,
    quantity: item.quantity,
    price: Number(item.price),
    lineTotal: Number(
      (Number(item.price) * item.quantity).toFixed(2)
    ),
    selectedOptions: item.selectedOptions,
    foodItem: item.foodItem,
  }));

  const subtotal = Number(
    items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
  );

  const deliveryFee = Number(cart.restaurant.deliveryFee);

  return {
    cart: {
      id: cart.id,
      restaurantId: cart.restaurantId,
      restaurant: cart.restaurant,
      updatedAt: cart.updatedAt,
    },
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    deliveryFee,
    total: Number((subtotal + deliveryFee).toFixed(2)),
  };
}

// GET /api/v1/cart
router.get("/", async (req, res) => {
  try {
    const cart = await getCart(getUserId(req));
    return res.json({ data: formatCart(cart) });
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to load cart.",
      },
    });
  }
});

// POST /api/v1/cart/items
router.post("/items", async (req, res) => {
  const parsed = addItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid cart item details.",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const userId = getUserId(req);
    const { foodItemId, quantity, selectedOptions } = parsed.data;

    // Customizations require validated option IDs and prices.
    // Until that feature is implemented, reject them safely.
    if (selectedOptions && Object.keys(selectedOptions).length > 0) {
      return res.status(400).json({
        error: {
          code: "OPTIONS_NOT_SUPPORTED",
          message: "Food customizations are not available yet.",
        },
      });
    }

    const food = await prisma.foodItem.findUnique({
      where: { id: foodItemId },
      include: {
        restaurant: {
          select: {
            id: true,
            status: true,
            isAcceptingOrders: true,
          },
        },
      },
    });

    if (!food || !food.availability) {
      return res.status(404).json({
        error: {
          code: "FOOD_NOT_AVAILABLE",
          message: "This food item is not available.",
        },
      });
    }

    if (
      food.restaurant.status !== "ACTIVE" ||
      !food.restaurant.isAcceptingOrders
    ) {
      return res.status(400).json({
        error: {
          code: "RESTAURANT_UNAVAILABLE",
          message: "This restaurant is not accepting orders.",
        },
      });
    }

    const price = food.discountedPrice ?? food.price;

    await prisma.$transaction(async (tx) => {
      let cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: true },
      });

      if (cart && cart.restaurantId !== food.restaurantId) {
        if (cart.items.length > 0) {
          throw new Error("DIFFERENT_RESTAURANT");
        }

        cart = await tx.cart.update({
          where: { id: cart.id },
          data: { restaurantId: food.restaurantId },
          include: { items: true },
        });
      }

      if (!cart) {
        cart = await tx.cart.create({
          data: {
            userId,
            restaurantId: food.restaurantId,
          },
          include: { items: true },
        });
      }

      const existing = cart.items.find(
        (item) =>
          item.foodItemId === foodItemId &&
          (item.selectedOptions === null ||
            JSON.stringify(item.selectedOptions) === "{}")
      );

      if (existing) {
        const newQuantity = existing.quantity + quantity;

        if (newQuantity > 99) {
          throw new Error("QUANTITY_LIMIT");
        }

        await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            price,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            foodItemId,
            quantity,
            price,
          },
        });
      }

      await tx.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date() },
      });
    });

    const updatedCart = await getCart(userId);

    return res.status(201).json({
      data: formatCart(updatedCart),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "DIFFERENT_RESTAURANT") {
        return res.status(409).json({
          error: {
            code: "DIFFERENT_RESTAURANT",
            message:
              "Clear your existing cart before adding food from another restaurant.",
          },
        });
      }

      if (error.message === "QUANTITY_LIMIT") {
        return res.status(400).json({
          error: {
            code: "QUANTITY_LIMIT",
            message: "Maximum quantity is 99.",
          },
        });
      }
    }

    console.error("Add cart item error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to add food to cart.",
      },
    });
  }
});

// PATCH /api/v1/cart/items/:itemId
router.patch("/items/:itemId", async (req, res) => {
  const parsed = updateQuantitySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Quantity must be between 1 and 99.",
      },
    });
  }

  try {
    const userId = getUserId(req);
    const itemId = String(req.params.itemId);

    const item = await prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
    });

    if (!item) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Cart item not found.",
        },
      });
    }

    await prisma.$transaction([
      prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: parsed.data.quantity },
      }),
      prisma.cart.update({
        where: { id: item.cartId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return res.json({
      data: formatCart(await getCart(userId)),
    });
  } catch (error) {
    console.error("Update cart item error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to update cart item.",
      },
    });
  }
});

// DELETE /api/v1/cart/items/:itemId
router.delete("/items/:itemId", async (req, res) => {
  try {
    const userId = getUserId(req);
    const itemId = String(req.params.itemId);

    const item = await prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
    });

    if (!item) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Cart item not found.",
        },
      });
    }

    await prisma.$transaction([
      prisma.cartItem.delete({
        where: { id: item.id },
      }),
      prisma.cart.update({
        where: { id: item.cartId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return res.json({
      data: formatCart(await getCart(userId)),
    });
  } catch (error) {
    console.error("Remove cart item error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to remove cart item.",
      },
    });
  }
});

// DELETE /api/v1/cart
router.delete("/", async (req, res) => {
  try {
    const userId = getUserId(req);

    await prisma.cart.deleteMany({
      where: { userId },
    });

    return res.json({
      data: formatCart(null),
    });
  } catch (error) {
    console.error("Clear cart error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to clear cart.",
      },
    });
  }
});

export default router;
