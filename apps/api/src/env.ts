import { z } from "zod";

export const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z.string().default("http://localhost:5173")
}).parse(process.env);
