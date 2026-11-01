
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Isolated tests: no database connection and no real password changes.
const { db, tx } = vi.hoisted(() => {
  const tx = {
    user: { updateMany: vi.fn() },
    authSession: { updateMany: vi.fn() },
  };
  const db = {
    authSession: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    restaurant: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, tx };
});

vi.mock("../src/db.js", () => ({ prisma: db }));
vi.mock("../src/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/auth.js")>()),
  hashPassword: vi.fn(),
}));

import { hashPassword } from "../src/auth.js";
import resetRouter from "../src/routes/adminRestaurantOwnerPasswordReset.js";

const app = express();
app.use(express.json());
app.use("/api/v1/admin/restaurant-owners", resetRouter);

const OWNER_ID = "restaurant-owner-test-id";
const RESTAURANT_ID = "balaji-restaurant-test-id";
const NEW_PASSWORD = "NewSecureOwnerPassword123!";

const validBody = {
  restaurantId: RESTAURANT_ID,
  newPassword: NEW_PASSWORD,
  ownerIdentityAndConsentVerified: true,
};

let server: Server;
let baseUrl: string;

function sessionForRole(role: string, status = "ACTIVE") {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "admin-test-id",
      name: "Admin Tester",
      email: "admin@example.invalid",
      phone: null,
      role,
      status,
      profileImage: null,
    },
  };
}

async function postReset(
  body: unknown = validBody,
  options: { token?: string | null; ownerId?: string } = {},
) {
  const token = options.token === undefined ? "test-token" : options.token;
  const ownerId = options.ownerId ?? OWNER_ID;

  return fetch(
    `${baseUrl}/api/v1/admin/restaurant-owners/${encodeURIComponent(ownerId)}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
});

beforeEach(() => {
  vi.resetAllMocks();

  vi.spyOn(console, "info").mockImplementation(
    () => undefined,
  );
  vi.spyOn(console, "error").mockImplementation(
    () => undefined,
  );

  db.authSession.findUnique.mockResolvedValue(
    sessionForRole("ADMIN"),
  );

  db.user.findUnique.mockResolvedValue({
    id: OWNER_ID,
    role: "RESTAURANT_OWNER",
    status: "ACTIVE",
  });

  db.restaurant.findFirst.mockResolvedValue({
    id: RESTAURANT_ID,
    name: "SHREE BALAJI RESTAURENT",
  });

  vi.mocked(hashPassword).mockResolvedValue(
    "safe-test-password-hash",
  );

  tx.user.updateMany.mockResolvedValue({ count: 1 });
  tx.authSession.updateMany.mockResolvedValue({ count: 2 });

  db.$transaction.mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin Restaurant Owner password reset (isolated)", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await postReset(validBody, {
      token: null,
    });

    expect(response.status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "CUSTOMER",
    "DELIVERY_PARTNER",
    "RESTAURANT_OWNER",
  ])("rejects signed-in %s users", async (role) => {
    db.authSession.findUnique.mockResolvedValue(
      sessionForRole(role),
    );

    expect((await postReset()).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an inactive admin session", async () => {
    db.authSession.findUnique.mockResolvedValue(
      sessionForRole("ADMIN", "BLOCKED"),
    );

    const response = await postReset();

    expect([401, 403]).toContain(response.status);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "missing restaurant ID",
      {
        newPassword: NEW_PASSWORD,
        ownerIdentityAndConsentVerified: true,
      },
    ],
    [
      "empty restaurant ID",
      { ...validBody, restaurantId: "" },
    ],
    [
      "missing password",
      {
        restaurantId: RESTAURANT_ID,
        ownerIdentityAndConsentVerified: true,
      },
    ],
    [
      "short password",
      { ...validBody, newPassword: "ShortPass1!" },
    ],
    [
      "overlong password",
      { ...validBody, newPassword: "x".repeat(129) },
    ],
    [
      "missing consent",
      {
        restaurantId: RESTAURANT_ID,
        newPassword: NEW_PASSWORD,
      },
    ],
    [
      "unverified consent",
      {
        ...validBody,
        ownerIdentityAndConsentVerified: false,
      },
    ],
    [
      "client-supplied role",
      { ...validBody, role: "ADMIN" },
    ],
    [
      "unexpected owner field",
      { ...validBody, ownerId: "another-user" },
    ],
  ])(
    "rejects %s before hashing or writing",
    async (_name, body) => {
      const response = await postReset(body);

      expect(response.status).toBe(400);
      expect(
        (await response.json()).error.code,
      ).toBe("INVALID_INPUT");

      expect(hashPassword).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects an overlong owner ID", async () => {
    const response = await postReset(validBody, {
      ownerId: "x".repeat(101),
    });

    expect(response.status).toBe(400);
    expect(
      (await response.json()).error.code,
    ).toBe("INVALID_OWNER_ID");

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    [
      "customer account",
      {
        id: OWNER_ID,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    ],
    [
      "admin account",
      {
        id: OWNER_ID,
        role: "ADMIN",
        status: "ACTIVE",
      },
    ],
    [
      "rider account",
      {
        id: OWNER_ID,
        role: "DELIVERY_PARTNER",
        status: "ACTIVE",
      },
    ],
    [
      "inactive owner",
      {
        id: OWNER_ID,
        role: "RESTAURANT_OWNER",
        status: "SUSPENDED",
      },
    ],
  ])(
    "refuses %s instead of an active Restaurant Owner",
    async (_name, owner) => {
      db.user.findUnique.mockResolvedValue(owner);

      const response = await postReset();

      expect(response.status).toBe(404);
      expect(
        (await response.json()).error.code,
      ).toBe("ACTIVE_OWNER_NOT_FOUND");

      expect(
        db.restaurant.findFirst,
      ).not.toHaveBeenCalled();

      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it(
    "rejects a restaurant that is not linked to the owner",
    async () => {
      db.restaurant.findFirst.mockResolvedValue(null);

      const response = await postReset();

      expect(response.status).toBe(409);

      expect(
        (await response.json()).error.code,
      ).toBe("OWNER_RESTAURANT_MISMATCH");

      expect(
        db.restaurant.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          id: RESTAURANT_ID,
          ownerId: OWNER_ID,
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(hashPassword).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it(
    "updates only the owner password and revokes only that owner's sessions",
    async () => {
      const response = await postReset();

      expect(response.status).toBe(200);

      expect(hashPassword).toHaveBeenCalledWith(
        NEW_PASSWORD,
      );

      expect(db.$transaction).toHaveBeenCalledTimes(1);

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: OWNER_ID,
          role: "RESTAURANT_OWNER",
          status: "ACTIVE",
        },
        data: {
          passwordHash: "safe-test-password-hash",
        },
      });

      expect(
        tx.authSession.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: OWNER_ID,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      const result = await response.json();

      expect(result.data).toEqual({
        ownerId: OWNER_ID,
        restaurantId: RESTAURANT_ID,
        sessionsRevoked: 2,
      });

      expect(
        response.headers.get("cache-control"),
      ).toBe("no-store");

      const text = JSON.stringify(result);

      expect(text).not.toContain(NEW_PASSWORD);
      expect(text).not.toContain(
        "safe-test-password-hash",
      );
      expect(text).not.toContain("test-token");
    },
  );

  it(
    "succeeds when there are no old sessions to revoke",
    async () => {
      tx.authSession.updateMany.mockResolvedValue({
        count: 0,
      });

      const response = await postReset();

      expect(response.status).toBe(200);

      expect(
        (await response.json()).data.sessionsRevoked,
      ).toBe(0);
    },
  );

  it(
    "does not revoke sessions if the owner update affects no account",
    async () => {
      tx.user.updateMany.mockResolvedValue({
        count: 0,
      });

      const response = await postReset();

      expect(response.status).toBe(500);

      expect(
        (await response.json()).error.code,
      ).toBe("OWNER_PASSWORD_RESET_FAILED");

      expect(
        tx.authSession.updateMany,
      ).not.toHaveBeenCalled();
    },
  );

  it(
    "returns a safe error when session revocation fails",
    async () => {
      tx.authSession.updateMany.mockRejectedValue(
        new Error("simulated session failure"),
      );

      const response = await postReset();

      expect(response.status).toBe(500);

      expect(
        (await response.json()).error.code,
      ).toBe("OWNER_PASSWORD_RESET_FAILED");

      expect(
        tx.user.updateMany,
      ).toHaveBeenCalledTimes(1);

      expect(db.$transaction).toHaveBeenCalledTimes(1);

      // A real Prisma interactive transaction should
      // roll back both writes.
      // This mock does not prove actual PostgreSQL rollback.
    },
  );

  it(
    "does not enter a transaction when password hashing fails",
    async () => {
      vi.mocked(hashPassword).mockRejectedValue(
        new Error("simulated hashing failure"),
      );

      const response = await postReset();

      expect(response.status).toBe(500);

      expect(
        (await response.json()).error.code,
      ).toBe("OWNER_PASSWORD_RESET_FAILED");

      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it(
    "does not expose passwords or hashes in audit logs",
    async () => {
      const info = vi.mocked(console.info);

      const response = await postReset();

      expect(response.status).toBe(200);

      const auditText = JSON.stringify(info.mock.calls);

      expect(auditText).toContain("admin-test-id");
      expect(auditText).not.toContain(NEW_PASSWORD);
      expect(auditText).not.toContain(
        "safe-test-password-hash",
      );
      expect(auditText).not.toContain("test-token");
    },
  );
});
           
