import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// All database operations are mocked. Nothing touches production.
const { db, tx } = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn(), create: vi.fn() },
    restaurant: { findUnique: vi.fn(), create: vi.fn() },
  };
  const db = {
    authSession: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    user: { create: vi.fn() },
    restaurant: { create: vi.fn() },
  };
  return { db, tx };
});

vi.mock("../src/db.js", () => ({ prisma: db }));
vi.mock("../src/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/auth.js")>()),
  hashPassword: vi.fn(),
}));

import { hashPassword } from "../src/auth.js";
import { Prisma } from "../src/generated/prisma/client.js";
import onboardingRouter from "../src/routes/adminRestaurantOnboardings.js";

const app = express();
app.use(express.json());
app.use("/api/v1/admin/restaurant-onboardings", onboardingRouter);

const path = "/api/v1/admin/restaurant-onboardings";
let server: Server;
let baseUrl: string;

const valid = {
  owner: {
    name: "Balaji Restaurant Owner",
    email: "balaji-owner@example.invalid",
    phone: "9876543210",
    password: "ExamplePassword123!",
  },
  restaurant: {
    name: "SHREE BALAJI RESTAURENT",
    slug: "shree-balaji-restaurent-nachana",
    cuisine: "North Indian",
    address: "Nachana, Jaisalmer, Rajasthan",
    city: "Nachana",
    openingTime: "09:00",
    closingTime: "22:00",
    deliveryTime: 30,
    deliveryFee: 0,
    minimumOrder: 0,
  },
};

const ownerRecord = {
  id: "test-owner-id",
  name: valid.owner.name,
  email: valid.owner.email,
  phone: valid.owner.phone,
  role: "RESTAURANT_OWNER",
  status: "ACTIVE",
  createdAt: new Date("2026-10-30T00:00:00Z"),
};
const restaurantRecord = {
  id: "test-restaurant-id",
  ownerId: ownerRecord.id,
  name: valid.restaurant.name,
  slug: valid.restaurant.slug,
  city: valid.restaurant.city,
  status: "PENDING",
  isAcceptingOrders: false,
  createdAt: new Date("2026-10-30T00:00:00Z"),
};

async function post(body: unknown, token: string | null = "test-token") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function session(role: string) {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "admin-id", name: "Admin Tester",
      email: "admin@example.invalid", phone: null,
      role, status: "ACTIVE", profileImage: null,
    },
  };
}

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

beforeEach(() => {
  vi.resetAllMocks();
  db.authSession.findUnique.mockResolvedValue(session("ADMIN"));
  vi.mocked(hashPassword).mockResolvedValue("mock-hash");
  tx.user.findFirst.mockResolvedValue(null);
  tx.restaurant.findUnique.mockResolvedValue(null);
  tx.user.create.mockResolvedValue(ownerRecord);
  tx.restaurant.create.mockResolvedValue(restaurantRecord);
  db.$transaction.mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
});

describe("Admin restaurant onboarding (isolated)", () => {
  it("requires authentication", async () => {
    expect((await post(valid, null)).status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "RESTAURANT_OWNER", "DELIVERY_PARTNER"])(
    "rejects role %s", async (role) => {
      db.authSession.findUnique.mockResolvedValue(session(role));
      expect((await post(valid)).status).toBe(403);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["short owner name", { ...valid, owner: { ...valid.owner, name: "A" } }],
    ["bad email", { ...valid, owner: { ...valid.owner, email: "invalid" } }],
    ["bad phone", { ...valid, owner: { ...valid.owner, phone: "123" } }],
    ["short password", { ...valid, owner: { ...valid.owner, password: "short" } }],
    ["no owner contact", { ...valid, owner: { name: valid.owner.name, password: valid.owner.password } }],
    ["client ADMIN role", { ...valid, owner: { ...valid.owner, role: "ADMIN" } }],
    ["extra root field", { ...valid, isAdmin: true }],
    ["invalid slug", { ...valid, restaurant: { ...valid.restaurant, slug: "bad slug!" } }],
    ["bad city", { ...valid, restaurant: { ...valid.restaurant, city: "" } }],
    ["invalid opening time", { ...valid, restaurant: { ...valid.restaurant, openingTime: "25:90" } }],
    ["zero delivery time", { ...valid, restaurant: { ...valid.restaurant, deliveryTime: 0 } }],
    ["negative delivery fee", { ...valid, restaurant: { ...valid.restaurant, deliveryFee: -1 } }],
    ["insecure cover URL", { ...valid, restaurant: { ...valid.restaurant, coverImage: "http://example.com/x.jpg" } }],
    ["client ACTIVE status", { ...valid, restaurant: { ...valid.restaurant, status: "ACTIVE" } }],
  ])("rejects %s without writing", async (_name, request) => {
    const response = await post(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("blocks duplicate owner email/phone", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "existing-user" });
    const response = await post(valid);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("OWNER_EXISTS");
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.restaurant.create).not.toHaveBeenCalled();
  });

  it("blocks duplicate restaurant slug", async () => {
    tx.restaurant.findUnique.mockResolvedValue({ id: "existing-restaurant" });
    const response = await post(valid);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("RESTAURANT_EXISTS");
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("creates owner and pending restaurant only within one transaction", async () => {
    const response = await post(valid);
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(tx.restaurant.create).toHaveBeenCalledOnce();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.restaurant.create).not.toHaveBeenCalled();
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: "RESTAURANT_OWNER", status: "ACTIVE",
        passwordHash: "mock-hash",
      }),
    }));
    expect(tx.restaurant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: ownerRecord.id, status: "PENDING",
        isAcceptingOrders: false,
      }),
    }));
    expect(json.data.owner.role).toBe("RESTAURANT_OWNER");
    expect(json.data.restaurant.ownerId).toBe(json.data.owner.id);
    expect(json.data.restaurant.isAcceptingOrders).toBe(false);
    expect(JSON.stringify(json)).not.toContain(valid.owner.password);
    expect(JSON.stringify(json)).not.toContain("mock-hash");
  });

  it("supports phone-only registration", async () => {
    const response = await post({
      ...valid,
      owner: { name: valid.owner.name, phone: valid.owner.phone, password: valid.owner.password },
    });
    expect(response.status).toBe(201);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: null, phone: valid.owner.phone }),
    }));
  });

  it("normalizes email and slug", async () => {
    const response = await post({
      ...valid,
      owner: { ...valid.owner, email: "  BALAJI-OWNER@EXAMPLE.INVALID  " },
      restaurant: { ...valid.restaurant, slug: "  SHREE-BALAJI-RESTAURENT-NACHANA  " },
    });
    expect(response.status).toBe(201);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: valid.owner.email }),
    }));
    expect(tx.restaurant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: valid.restaurant.slug }),
    }));
  });

  it("aborts on restaurant insert failure (mock transaction rollback)", async () => {
    const committed: string[] = [];
    db.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const staged: string[] = [];
      tx.user.create.mockImplementation(async () => {
        staged.push(ownerRecord.id);
        return ownerRecord;
      });
      tx.restaurant.create.mockRejectedValue(new Error("simulated restaurant failure"));
      const result = await callback(tx);
      committed.push(...staged); // Only commit on success.
      return result;
    });
    const response = await post(valid);
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("RESTAURANT_ONBOARDING_FAILED");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(tx.restaurant.create).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });

  it("handles Prisma unique-constraint collisions as 409", async () => {
    tx.restaurant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed", { code: "P2002", clientVersion: "7.0.0" },
    ));
    const response = await post(valid);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_OWNER_OR_RESTAURANT");
  });

  it("never starts a transaction when hashing fails", async () => {
    vi.mocked(hashPassword).mockRejectedValue(new Error("simulated hashing failure"));
    expect((await post(valid)).status).toBe(500);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
