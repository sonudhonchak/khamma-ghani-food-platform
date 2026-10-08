import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();
router.use(requireAuth, requireRole("CUSTOMER"));

const addSchema = z.object({
  foodItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
});
const updateSchema = z.object({ quantity: z.number().int().min(1).max(99) });
const itemParams = z.object({ itemId: z.string().min(1) });

function error(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

async function getCart(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      restaurant: { select: { id: true, name: true, deliveryFee: true, minimumOrder: true } },
      items: { include: { foodItem: { select: { id: true, name: true, image: true, availability: true } } }, orderBy: { id: "asc" } },
    },
  });
  if (!cart) return { cart: null, subtotal: 0 };
  const subtotal = cart.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return { cart, subtotal: Math.round(subtotal * 100) / 100 };
}

router.get("/", async (req, res) => {
  try {
    return res.json({ data: await getCart((req as AuthenticatedRequest).user.id) });
  } catch {
    return error(res, 500, "INTERNAL_ERROR", "Unable to load cart.");
  }
});

router.post("/items", async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "VALIDATION_ERROR", "Provide a valid foodItemId and quantity (1–99).");
  const userId = (req as AuthenticatedRequest).user.id;
  const { foodItemId, quantity } = parsed.data;
  try {
    const food = await prisma.foodItem.findUnique({
      where: { id: foodItemId },
      include: { restaurant: { select: { status: true, isAcceptingOrders: true } } },
    });
    if (!food || !food.availability || food.restaurant.status !== "ACTIVE" || !food.restaurant.isAcceptingOrders) {
      return error(res, 400, "FOOD_UNAVAILABLE", "This food is not available for ordering.");
    }
    const result = await prisma.$transaction(async (tx) => {
      let cart = await tx.cart.findUnique({ where: { userId } });
      if (cart && cart.restaurantId !== food.restaurantId) return "DIFFERENT_RESTAURANT" as const;
      if (!cart) cart = await tx.cart.create({ data: { userId, restaurantId: food.restaurantId } });
      const existing = await tx.cartItem.findFirst({ where: { cartId: cart.id, foodItemId, selectedOptions: { equals: null } } });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > 99) return "QUANTITY_LIMIT" as const;
      const price = food.discountedPrice ?? food.price;
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity, price } });
      else await tx.cartItem.create({ data: { cartId: cart.id, foodItemId, quantity, price } });
      return "OK" as const;
    });
    if (result === "DIFFERENT_RESTAURANT") return error(res, 409, "DIFFERENT_RESTAURANT", "Clear your cart before ordering from another restaurant.");
    if (result === "QUANTITY_LIMIT") return error(res, 400, "QUANTITY_LIMIT", "Maximum quantity per item is 99.");
    return res.status(201).json({ data: await getCart(userId) });
  } catch {
    return error(res, 500, "INTERNAL_ERROR", "Unable to add food to cart.");
  }
});

router.patch("/items/:itemId", async (req, res) => {
  const params = itemParams.safeParse(req.params);
  const parsed = updateSchema.safeParse(req.body);
  if (!params.success || !parsed.success) return error(res, 400, "VALIDATION_ERROR", "Provide a valid item ID and quantity (1–99).");
  const userId = (req as AuthenticatedRequest).user.id;
  try {
    const item = await prisma.cartItem.findFirst({ where: { id: params.data.itemId, cart: { userId } } });
    if (!item) return error(res, 404, "NOT_FOUND", "Cart item not found.");
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity } });
    return res.json({ data: await getCart(userId) });
  } catch {
    return error(res, 500, "INTERNAL_ERROR", "Unable to update cart item.");
  }
});

router.delete("/items/:itemId", async (req, res) => {
  const params = itemParams.safeParse(req.params);
  if (!params.success) return error(res, 400, "VALIDATION_ERROR", "Invalid item ID.");
  const userId = (req as AuthenticatedRequest).user.id;
  try {
    const item = await prisma.cartItem.findFirst({ where: { id: params.data.itemId, cart: { userId } } });
    if (!item) return error(res, 404, "NOT_FOUND", "Cart item not found.");
    await prisma.cartItem.delete({ where: { id: item.id } });
    return res.json({ data: await getCart(userId) });
  } catch {
    return error(res, 500, "INTERNAL_ERROR", "Unable to remove cart item.");
  }
});

router.delete("/", async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.id;
  try {
    await prisma.cart.deleteMany({ where: { userId } });
    return res.json({ data: { cart: null, subtotal: 0 } });
  } catch {
    return error(res, 500, "INTERNAL_ERROR", "Unable to clear cart.");
  }
});

export default router;
