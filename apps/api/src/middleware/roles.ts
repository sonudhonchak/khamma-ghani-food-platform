import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.js";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        },
      });
    }

    if (!allowedRoles.includes(authenticatedReq.user.role)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      });
    }

    return next();
  };
}
