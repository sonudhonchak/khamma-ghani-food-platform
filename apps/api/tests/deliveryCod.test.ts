
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

// This is a mock. The real db.ts module is never executed.
const mockDb = vi.hoisted(() => ({
  authSession: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../src/db.js", () => ({
  prisma: mockDb,
}));

import deliveryCodRouter from "../src/routes/deliveryCod.js";

const tx = {
  deliveryPartner: {
    findUnique: vi.fn(),
  },
  order: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  payment: {
    upsert: vi.fn(),
  },
};

const app = express();

app.use(express.json());

app.use(
  "/api/v1/delivery/orders",
  deliveryCodRouter,
);

let server: Server;
let baseUrl: string;

const route =
  "/api/v1/delivery/orders/order-test/cod-collection";

async function postCollection(
  amount: unknown,
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
    body: JSON.stringify({ amount }),
  });
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

  mockDb.authSession.findUnique.mockResolvedValue({
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "delivery-user",
      name: "Delivery Tester",
      email: "delivery@example.invalid",
      phone: null,
      role: "DELIVERY_PARTNER",
      status: "ACTIVE",
      profileImage: null,
    },
  });

  mockDb.$transaction.mockImplementation(
    async (
      callback: (
        client: typeof tx,
      ) => Promise<unknown>,
    ) => callback(tx),
  );

  tx.deliveryPartner.findUnique.mockResolvedValue({
    id: "partner-test",
    user: {
      status: "ACTIVE",
    },
  });

  tx.order.findFirst.mockResolvedValue({
    id: "order-test",
    orderNumber: "KG-TEST-ONLY",
    deliveryPartnerId: "partner-test",
    orderStatus: "DELIVERED",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    total: "259.00",
    payment: null,
  });

  tx.order.updateMany.mockResolvedValue({
    count: 1,
  });

  tx.payment.upsert.mockResolvedValue({
    id: "payment-test",
    amount: "259.00",
    status: "PAID",
    provider: "COD",
  });
});

describe(
  "COD collection API (isolated, mocked database)",
  () => {

    it(
      "rejects unauthenticated requests before touching database",
      async () => {
        const res = await postCollection(
          "259.00",
          null,
        );

        expect(res.status).toBe(401);

        expect(
          mockDb.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it("rejects customer role", async () => {
      mockDb.authSession.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: "customer-user",
          name: "Customer Tester",
          email: null,
          phone: null,
          role: "CUSTOMER",
          status: "ACTIVE",
          profileImage: null,
        },
      });

      const res = await postCollection("259.00");

      expect(res.status).toBe(403);

      expect(
        mockDb.$transaction,
      ).not.toHaveBeenCalled();
    });

    it.each([
      0,
      -10,
      "259.999",
      "nonsense",
    ])(
      "rejects invalid amount %s before payment transaction",
      async (amount) => {
        const res = await postCollection(amount);

        expect(res.status).toBe(400);

        expect(
          (await res.json()).error.code,
        ).toBe("VALIDATION_ERROR");

        expect(
          mockDb.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not allow collecting for an unassigned order",
      async () => {
        tx.order.findFirst.mockResolvedValue(null);

        const res = await postCollection("259.00");

        expect(res.status).toBe(404);

        expect(
          (await res.json()).error.code,
        ).toBe("ORDER_NOT_FOUND");

        expect(
          tx.order.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses COD before delivery completion",
      async () => {
        tx.order.findFirst.mockResolvedValue({
          id: "order-test",
          orderStatus: "OUT_FOR_DELIVERY",
          paymentMethod: "COD",
          paymentStatus: "PENDING",
          total: "259.00",
          payment: null,
        });

        const res = await postCollection("259.00");

        expect(res.status).toBe(409);

        expect(
          (await res.json()).error.code,
        ).toBe("ORDER_NOT_DELIVERED");

        expect(
          tx.order.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses mismatched cash amounts",
      async () => {
        const res = await postCollection("258.00");

        expect(res.status).toBe(409);

        expect(
          (await res.json()).error.code,
        ).toBe("AMOUNT_MISMATCH");

        expect(
          tx.order.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses an already-paid order",
      async () => {
        tx.order.findFirst.mockResolvedValue({
          id: "order-test",
          orderStatus: "DELIVERED",
          paymentMethod: "COD",
          paymentStatus: "PAID",
          total: "259.00",
          payment: {
            status: "PAID",
          },
        });

        const res = await postCollection("259.00");

        expect(res.status).toBe(409);

        expect(
          (await res.json()).error.code,
        ).toBe("PAYMENT_ALREADY_PROCESSED");

        expect(
          tx.order.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    // ====================================
    // TWO CONFIRMED TEST ORDERS
    // ====================================

    it.each([
      [
        "KG-4D4E113C63214C97",
        "259.00",
        "PENDING",
      ],
      [
        "KG-689D67E54D0D43CA",
        "916.00",
        "PAID",
      ],
    ])(
      "blocks confirmed test order %s without writing payment records",
      async (
        orderNumber,
        amount,
        paymentStatus,
      ) => {
        tx.order.findFirst.mockResolvedValue({
          id: "order-test",
          orderNumber,
          deliveryPartnerId: "partner-test",
          orderStatus: "DELIVERED",
          paymentMethod: "COD",
          paymentStatus,
          total: amount,
          payment:
            paymentStatus === "PAID"
              ? { status: "PAID" }
              : null,
        });

        const res = await postCollection(amount);

        expect(res.status).toBe(409);

        expect(
          (await res.json()).error.code,
        ).toBe("TEST_ORDER_COD_BLOCKED");

        expect(
          tx.order.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          tx.payment.upsert,
        ).not.toHaveBeenCalled();
      },
    );

    // ====================================
    // SIMULATED SUCCESSFUL COLLECTION
    // ====================================

    it(
      "simulates successful collection entirely in memory",
      async () => {
        const res = await postCollection("259.00");

        expect(res.status).toBe(200);

        expect(
          (await res.json()).data.order.paymentStatus,
        ).toBe("PAID");

        expect(
          tx.order.updateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              paymentStatus: "PAID",
            },
          }),
        );

        expect(
          tx.payment.upsert,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);
