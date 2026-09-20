import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  createSessionToken,
  getSessionExpiry,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../auth.js";

const router = Router();

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.")
      .optional(),
    password: z.string().min(8).max(128),
  })
  .refine((data) => data.email || data.phone, {
    message: "Email or phone is required.",
    path: ["email"],
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

function publicUser(user: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  profileImage: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    profileImage: user.profileImage,
  };
}

// Register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please check the registration details.",
        details: parsed.error.flatten(),
      },
    });
  }

  const { name, email, phone, password } = parsed.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message: "An account with this email or phone already exists.",
        },
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
      },
    });

    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    await prisma.authSession.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: getSessionExpiry(),
      },
    });

    return res.status(201).json({
      data: {
        user: publicUser(user),
        token,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      error: {
        code: "REGISTER_FAILED",
        message: "Unable to create the account.",
      },
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Please provide a valid login identifier and password.",
        details: parsed.error.flatten(),
      },
    });
  }

  const { identifier, password } = parsed.data;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
        ],
      },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email/phone or password.",
        },
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        error: {
          code: "ACCOUNT_UNAVAILABLE",
          message: "This account is not currently active.",
        },
      });
    }

    const passwordValid = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email/phone or password.",
        },
      });
    }

    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    await prisma.authSession.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: getSessionExpiry(),
      },
    });

    return res.json({
      data: {
        user: publicUser(user),
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: {
        code: "LOGIN_FAILED",
        message: "Unable to log in.",
      },
    });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.json({
      data: {
        success: true,
      },
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.json({
      data: {
        success: true,
      },
    });
  }

  try {
    const tokenHash = hashSessionToken(token);

    await prisma.authSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      error: {
        code: "LOGOUT_FAILED",
        message: "Unable to log out.",
      },
    });
  }
});

export default router;
