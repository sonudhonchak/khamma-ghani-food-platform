import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// View restaurants awaiting approval
router.get(
  "/pending",
  requireAuth,
  requireRole("ADMIN"),
  async (_req, res) => {
    try {
      const restaurants = await prisma.restaurant.findMany({
        where: {
          status: "PENDING",
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          slug: true,
          description: true,
          cuisine: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
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

      return res.json({
        data: restaurants,
        total: restaurants.length,
      });
    } catch (error) {
      console.error("Pending restaurants error:", error);

      return res.status(500).json({
        error: {
          code: "PENDING_RESTAURANTS_FETCH_FAILED",
          message: "Unable to fetch pending restaurants.",
        },
      });
    }
  }
);

// Approve a restaurant
router.patch(
  "/:restaurantId/approve",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    const { restaurantId } = req.params;

    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: {
          id: restaurantId,
        },
      });

      if (!restaurant) {
        return res.status(404).json({
          error: {
            code: "RESTAURANT_NOT_FOUND",
            message: "Restaurant not found.",
          },
        });
      }

      if (restaurant.status !== "PENDING") {
        return res.status(409).json({
          error: {
            code: "RESTAURANT_NOT_PENDING",
            message: "Only pending restaurants can be approved.",
          },
        });
      }

      const updatedRestaurant = await prisma.restaurant.update({
        where: {
          id: restaurantId,
        },
        data: {
          status: "ACTIVE",
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          slug: true,
          status: true,
          updatedAt: true,
        },
      });

      return res.json({
        data: updatedRestaurant,
      });
    } catch (error) {
      console.error("Restaurant approval error:", error);

      return res.status(500).json({
        error: {
          code: "RESTAURANT_APPROVAL_FAILED",
          message: "Unable to approve the restaurant.",
        },
      });
    }
  }
);

export default router;
