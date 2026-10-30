
import {
  afterAll,
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

// Use a mocked database. No production database connection.
const mockDb = vi.hoisted(() => ({
  authSession: {
    findUnique: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../src/db.js", () => ({
  prisma: mockDb,
}));

// Keep real session-token utilities, mock password hashing.
vi.mock("../src/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/auth.js")>();

  return {
    ...actual,
    hashPassword: vi.fn(),
  };
});

import { hashPassword } from "../src/auth.js";
import adminRestaurantOwnersRouter from "../src/routes/adminRestaurantOwners.js";

const app = express();

app.use(express.json());

app.use(
  "/api/v1/admin/restaurant-owners",
  adminRestaurantOwnersRouter,
);

let server: Server;
let baseUrl: string;

const route = "/api/v1/admin/restaurant-owners";

const validOwner = {
  name: "Balaji Restaurant Owner",
  email: "balaji-owner@example.invalid",
  phone: "9876543210",
  password: "ExamplePassword123!",
};

async function postOwner(
  body: unknown,
  token: string | null = "test-token",
) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionForRole(
  role: string,
  status = "ACTIVE",
) {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "admin-test-user",
      name: "Admin Tester",
      email: "admin@example.invalid",
      phone: null,
      role,
      status,
      profileImage: null,
    },
  };
}

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(
      0,
      "127.0.0.1",
      () => resolve(listener),
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

  mockDb.authSession.findUnique.mockResolvedValue(
    sessionForRole("ADMIN"),
  );

  mockDb.user.findFirst.mockResolvedValue(null);

  vi.mocked(hashPassword).mockResolvedValue(
    "secure-hash-for-isolated-test",
  );

  mockDb.user.create.mockImplementation(
    async ({ data }) => ({
      id: "new-owner-test-id",
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      status: data.status,
      createdAt: new Date(
        "2026-10-30T00:00:00.000Z",
      ),
    }),
  );
});

describe(
  "Restaurant Owner provisioning (isolated, mocked database)",
  () => {
    it(
      "rejects unauthenticated requests",
      async () => {
        const res = await postOwner(
          validOwner,
          null,
        );

        expect(res.status).toBe(401);

        expect(
          mockDb.user.findFirst,
        ).not.toHaveBeenCalled();

        expect(
          mockDb.user.create,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      "CUSTOMER",
      "DELIVERY_PARTNER",
      "RESTAURANT_OWNER",
    ])(
      "rejects a signed-in %s role",
      async (role) => {
        mockDb.authSession.findUnique.mockResolvedValue(
          sessionForRole(role),
        );

        const res = await postOwner(validOwner);

        expect(res.status).toBe(403);

        expect(
          mockDb.user.create,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "short name",
        { ...validOwner, name: "A" },
      ],
      [
        "invalid email",
        { ...validOwner, email: "not-an-email" },
      ],
      [
        "invalid phone",
        { ...validOwner, phone: "123" },
      ],
      [
        "short password",
        { ...validOwner, password: "short" },
      ],
      [
        "missing email and phone",
        {
          name: validOwner.name,
          password: validOwner.password,
        },
      ],
      [
        "client-supplied ADMIN role",
        { ...validOwner, role: "ADMIN" },
      ],
      [
        "unexpected extra field",
        { ...validOwner, isAdmin: true },
      ],
    ])(
      "rejects %s",
      async (_caseName, body) => {
        const res = await postOwner(body);

        expect(res.status).toBe(400);

        expect(
          (await res.json()).error.code,
        ).toBe("INVALID_INPUT");

        expect(
          mockDb.user.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a duplicate email or phone",
      async () => {
        mockDb.user.findFirst.mockResolvedValue({
          id: "existing-user",
        });

        const res = await postOwner(validOwner);

        expect(res.status).toBe(409);

        expect(
          (await res.json()).error.code,
        ).toBe("USER_EXISTS");

        expect(
          mockDb.user.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "allows admin to create Restaurant Owner",
      async () => {
        const res = await postOwner(validOwner);

        expect(res.status).toBe(201);

        expect(
          mockDb.user.create,
        ).toHaveBeenCalledWith({
          data: {
            name: validOwner.name,
            email: validOwner.email,
            phone: validOwner.phone,
            passwordHash:
              "secure-hash-for-isolated-test",
            role: "RESTAURANT_OWNER",
            status: "ACTIVE",
          },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          },
        });

        const body = await res.json();

        expect(body.data.role).toBe(
          "RESTAURANT_OWNER",
        );

        expect(body.data).not.toHaveProperty(
          "passwordHash",
        );

        expect(body.data).not.toHaveProperty(
          "password",
        );

        expect(body.data).not.toHaveProperty(
          "token",
        );
      },
    );

    it(
      "permits phone-only registration",
      async () => {
        const res = await postOwner({
          name: validOwner.name,
          phone: validOwner.phone,
          password: validOwner.password,
        });

        expect(res.status).toBe(201);

        expect(
          mockDb.user.create,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: null,
              phone: validOwner.phone,
              role: "RESTAURANT_OWNER",
            }),
          }),
        );
      },
    );

    it(
      "handles database failures safely",
      async () => {
        mockDb.user.create.mockRejectedValue(
          new Error("simulated database failure"),
        );

        const res = await postOwner(validOwner);

        expect(res.status).toBe(500);

        expect(
          (await res.json()).error.code,
        ).toBe(
          "RESTAURANT_OWNER_CREATE_FAILED",
        );
      },
    );
  },
);
