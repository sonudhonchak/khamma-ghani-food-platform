import cors from "cors";
import express from "express";
import helmet from "helmet";
import { z } from "zod";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.API_CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "khamma-ghani-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0"
  });
});

app.get("/api/v1", (_req, res) => {
  res.json({
    name: "Khamma Ghani API",
    version: "v1",
    status: "online"
  });
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

app.get("/api/v1/restaurants", (req, res) => {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUERY",
        message: "Invalid pagination parameters."
      }
    });
  }

  return res.json({
    data: [],
    pagination: {
      page: parsed.data.page,
      limit: parsed.data.limit,
      total: 0
    }
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found."
    }
  });
});

export { app };
