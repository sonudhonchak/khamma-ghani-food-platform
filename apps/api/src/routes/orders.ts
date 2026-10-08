
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.use(requireAuth, requireRole("CUSTOMER"));

const checkoutSchema = z.object({
  addressId: z.string().trim().min(1),
  paymentMethod: z.literal("COD"),
  notes: z.string().trim().max(500).optional(),
}).strict();

function getUserId(req: Request): string {
  return (req as unknown as AuthenticatedRequest).user.id;
}

function money(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value);
}

function errorResponse(
  res: any,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({
    error: { code, message },
  });
}

// POST /api/v1/orders
// Create a Cash on Delivery order from the customer's cart.
router.post("/", async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid checkout information.",
        details: parsed.error.flatten(),
      },
    });
  }

  const userId = getUserId(req);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const address = await tx.address.findFirst({
          where: {
            id: parsed.data.addressId,
            userId,
          },
        });

        if (!address) {
          return {
            error: {
              status: 404,
              code: "ADDRESS_NOT_FOUND",
              message: "Delivery address not found.",
            },
          };
        }

        const cart = await tx.cart.findUnique({
          where: { userId },
          include: {
            items: {
              include: { foodItem: true },
            },
            restaurant: true,
          },
        });

        if (!cart || cart.items.length === 0) {
          return {
            error: {
              status: 400,
              code: "EMPTY_CART",
              message: "Add food to your cart before checkout.",
            },
          };
        }

        const restaurant = cart.restaurant;

        if (
          restaurant.status !== "ACTIVE" ||
          !restaurant.isAcceptingOrders ||
          restaurant.isBusy
        ) {
          return {
            error: {
              status: 409,
              code: "RESTAURANT_UNAVAILABLE",
              message: "Restaurant is not accepting orders.",
            },
          };
        }

        let subtotal = money(0);

        const orderItems = [];

        for (const item of cart.items) {
          const food = item.foodItem;

          if (
            !food.availability ||
            food.restaurantId !== restaurant.id
          ) {
            return {
              error: {
                status: 409,
                code: "FOOD_UNAVAILABLE",
                message: `${food.name} is currently unavailable.`,
              },
            };
          }

          if (item.selectedOptions !== null) {
            return {
              error: {
                status: 409,
                code: "OPTIONS_NOT_SUPPORTED",
                message:
                  "Customized items are not yet supported at checkout.",
              },
            };
          }

          if (item.quantity < 1 || item.quantity > 99) {
            return {
              error: {
                status: 400,
                code: "INVALID_QUANTITY",
                message: "Invalid item quantity.",
              },
            };
          }

          const currentPrice = money(
            food.discountedPrice ?? food.price
          );

          if (currentPrice.lessThan(0)) {
            return {
              error: {
                status: 409,
                code: "INVALID_PRICE",
                message: "A food item has an invalid price.",
              },
            };
          }

          subtotal = subtotal.plus(
            currentPrice.mul(item.quantity)
          );

          orderItems.push({
            foodItemId: food.id,
            nameSnapshot: food.name,
            priceSnapshot: currentPrice,
            quantity: item.quantity,
          });
        }

        if (subtotal.lessThan(restaurant.minimumOrder)) {
          return {
            error: {
              status: 409,
              code: "MINIMUM_ORDER_NOT_MET",
              message: `Minimum order amount is ₹${restaurant.minimumOrder}.`,
            },
          };
        }

        const deliveryFee = money(restaurant.deliveryFee);
        const taxes = money(0);
        const discount = money(0);

        const total = subtotal
          .plus(deliveryFee)
          .plus(taxes)
          .minus(discount);

        const orderNumber =
          "KG-" + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            restaurantId: restaurant.id,
            addressId: address.id,

            subtotal,
            deliveryFee,
            taxes,
            discount,
            total,

            paymentMethod: "COD",
            paymentStatus: "PENDING",
            orderStatus: "PLACED",

            notes: parsed.data.notes,

            addressNameSnapshot: address.name,
            addressPhoneSnapshot: address.phone,
            addressLineSnapshot: address.addressLine,
            addressLandmarkSnapshot: address.landmark,
            addressCitySnapshot: address.city,
            addressStateSnapshot: address.state,
            addressPincodeSnapshot: address.pincode,
            addressLatitudeSnapshot: address.latitude,
            addressLongitudeSnapshot: address.longitude,

            items: {
              create: orderItems,
            },

            statusHistory: {
              create: {
                status: "PLACED",
                note: "Order placed by customer.",
              },
            },
          },
          include: {
            items: true,
            statusHistory: true,
          },
        });

        await tx.cart.delete({
          where: { id: cart.id },
        });

        return { order };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      }
    );

    if ("error" in result && result.error) {
      return errorResponse(
        res,
        result.error.status,
        result.error.code,
        result.error.message
      );
    }

    if (!("order" in result)) {
      return errorResponse(
        res,
        500,
        "ORDER_ERROR",
        "Unable to create order."
      );
    }

    return res.status(201).json({
      data: {
        order: result.order,
        message: "Order placed successfully.",
      },
    });
  } catch (error) {
    console.error("Create order error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return errorResponse(
        res,
        409,
        "CHECKOUT_CONFLICT",
        "Cart changed during checkout. Please try again."
      );
    }

    return errorResponse(
      res,
      500,
      "INTERNAL_ERROR",
      "Failed to place order."
    );
  }
});

// GET /api/v1/orders
// List orders belonging to the signed-in customer.
router.get("/", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        items: true,
      },
    });

    return res.json({ data: orders });
  } catch (error) {
    console.error("List orders error:", error);

    return errorResponse(
      res,
      500,
      "INTERNAL_ERROR",
      "Failed to load orders."
    );
  }
});

// GET /api/v1/orders/:orderId
// Retrieve a single order with status history.
router.get("/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: getUserId(req),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        items: true,
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return errorResponse(
        res,
        404,
        "ORDER_NOT_FOUND",
        "Order not found."
      );
    }

    return res.json({ data: order });
  } catch (error) {
    console.error("Get order error:", error);

    return errorResponse(
      res,
      500,
      "INTERNAL_ERROR",
      "Failed to load order."
    );
  }
});

export default router;
