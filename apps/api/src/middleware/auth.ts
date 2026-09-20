import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { hashSessionToken, type AuthUser } from "../auth.js";

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication token is missing.",
      },
    });
  }

  try {
    const tokenHash = hashSessionToken(token);

    const session = await prisma.authSession.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Invalid or expired session.",
        },
      });
    }

    if (session.revokedAt || session.expiresAt <= new Date()) {
      return res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Invalid or expired session.",
        },
      });
    }

    if (session.user.status !== "ACTIVE") {
      return res.status(403).json({
        error: {
          code: "ACCOUNT_UNAVAILABLE",
          message: "This account is not currently active.",
        },
      });
    }

    const user: AuthUser = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      role: session.user.role,
      status: session.user.status,
      profileImage: session.user.profileImage,
    };

    (req as AuthenticatedRequest).user = user;

    return next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(500).json({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to verify authentication.",
      },
    });
  }
}
