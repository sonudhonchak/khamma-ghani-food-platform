import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import restaurantsRouter from "./routes/restaurants.js";
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

  res.json({
    data: {
      user: authenticatedReq.user,
    },
  });
});

// Restaurant routes
app.use("/api/v1/restaurants", restaurantsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "khamma-ghani-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// API information
app.get("/api/v1", (_req, res) => {
  res.json({
    name: "Khamma Ghani API",
    version: "v1",
    status: "online",
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
});

export default app;
