
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

// Admin COD reconciliation
import adminCodRouter from "./routes/adminCod.js";

import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/auth.js";

const app = express();

app.disable("x-powered-by");

// CORS configuration
app.use(
  cors({
    origin:
      process.env.API_CORS_ORIGIN
        ?.split(",")
        .map((origin) => origin.trim()) ?? [
        "http://localhost:5173",
      ],
    credentials: true,
  })
);

// JSON body parser
app.use(express.json({ limit: "1mb" }));

// ======================================
// AUTHENTICATION
// ======================================

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

// ======================================
// RESTAURANTS
// ======================================

// Public restaurant listing and owner creation
app.use("/api/v1/restaurants", restaurantsRouter);

// Restaurant menu
app.use("/api/v1/restaurants", restaurantMenuRouter);

// Admin restaurant management
app.use(
  "/api/v1/admin/restaurants",
  adminRestaurantsRouter
);

// ======================================
// CUSTOMER
// ======================================

// Customer cart
app.use("/api/v1/cart", cartRouter);

// Delivery addresses
app.use("/api/v1/addresses", addressesRouter);

// Checkout and order history
app.use("/api/v1/orders", ordersRouter);

// ======================================
// RESTAURANT OWNER
// ======================================

// Restaurant order management
app.use(
  "/api/v1/restaurant/orders",
  restaurantOrdersRouter
);

// ======================================
// ADMIN
// ======================================

// Delivery partner management and assignment
app.use(
  "/api/v1/admin/delivery-partners",
  adminDeliveryPartnersRouter
);

// Read-only COD reconciliation
app.use("/api/v1/admin/cod", adminCodRouter);

// ======================================
// DELIVERY PARTNER
// ======================================

// Assigned delivery orders and status updates
app.use(
  "/api/v1/delivery/orders",
  deliveryOrdersRouter
);

// COD cash collection
app.use(
  "/api/v1/delivery/orders",
  deliveryCodRouter
);

// ======================================
// HEALTH CHECK
// ======================================

app.get("/health", (_req, res) => {
  return res.json({
    status: "ok",
    service: "khamma-ghani-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// ======================================
// API INFORMATION
// ======================================

app.get("/api/v1", (_req, res) => {
  return res.json({
    name: "Khamma Ghani API",
    version: "v1",
    status: "online",
  });
});

// ======================================
// 404 HANDLER
// ======================================

app.use((_req, res) => {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
});

export default app;
