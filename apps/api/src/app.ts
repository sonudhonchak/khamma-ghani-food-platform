

import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import restaurantsRouter from "./routes/restaurants.js";
import adminRestaurantsRouter from "./routes/adminRestaurants.js";
import restaurantMenuRouter from "./routes/restaurantMenu.js";
import cartRouter from "./routes/cart.js";
import addressesRouter from "./routes/addresses.js";
import ordersRouter from "./routes/orders.js";
import restaurantOrdersRouter from "./routes/restaurantOrders.js";
import adminDeliveryPartnersRouter from "./routes/adminDeliveryPartners.js";
import deliveryOrdersRouter from "./routes/deliveryOrders.js";
import deliveryCodRouter from "./routes/deliveryCod.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/auth.js";

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin:
      process.env.API_CORS_ORIGIN?.split(",").map((origin) => origin.trim()) ?? [
        "http://localhost:5173",
      ],
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Authentication routes
app.use("/api/v1/auth", authRouter);

// Protected current-user route
app.get("/api/v1/auth/me", requireAuth, (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;

  return res.json({
    data: {
      user: authenticatedReq.user,
    },
  });
});

// Public restaurant and restaurant-owner creation routes
app.use("/api/v1/restaurants", restaurantsRouter);

// Restaurant menu routes
app.use("/api/v1/restaurants", restaurantMenuRouter);

// Admin restaurant management routes
app.use("/api/v1/admin/restaurants", adminRestaurantsRouter);

// Customer cart routes
app.use("/api/v1/cart", cartRouter);

// Customer delivery address routes
app.use("/api/v1/addresses", addressesRouter);

// Customer order and checkout routes
app.use("/api/v1/orders", ordersRouter);

// Restaurant owner order management routes
app.use("/api/v1/restaurant/orders", restaurantOrdersRouter);

// Admin delivery partner management routes
app.use("/api/v1/admin/delivery-partners", adminDeliveryPartnersRouter);

// Delivery partner assigned-order routes
app.use("/api/v1/delivery/orders", deliveryOrdersRouter);

// Delivery partner COD cash collection routes
app.use("/api/v1/delivery/orders", deliveryCodRouter);

// Health check
app.get("/health", (_req, res) => {
  return res.json({
    status: "ok",
    service: "khamma-ghani-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// API information
app.get("/api/v1", (_req, res) => {
  return res.json({
    name: "Khamma Ghani API",
    version: "v1",
    status: "online",
  });
});

// 404 handler
app.use((_req, res) => {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
});

export default app;
