
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

// Mock Prisma before importing the route.
// No connection to the production database.
const mockDb = vi.hoisted(() => ({
  authSession: {
    findUnique: vi.fn(),
  },
  order: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../src/db.js", () => ({
  prisma: mockDb,
}));

import adminCodRouter from "../src/routes/adminCod.js";

// Mock transaction methods.
const tx = {
  order: {
    findUnique: vi.fn(),
  },
  orderFinancialClassification: {
    create: vi.fn(),
  },
  financialClassificationAudit: {
    create: vi.fn(),
  },
};

const app = express();

app.use(express.json());

app.use(
  "/api/v1/admin/cod",
  adminCodRouter,
);

let server: Server;
let baseUrl: string;

// Simulated test order.
// These values are fixtures, not live database records.
const body = {
  orderNumber: "KG-689D67E54D0D43CA",
  expectedOrderTotal: "916.00",
  expectedPaymentStatus: "PAID",
  reason:
    "Confirmed simulated test transaction; no physical cash was collected.",
  confirmation: "I_CONFIRM_TEST_ORDER_NO_REAL_CASH",
};

// POST test helper.
async function postClassification(
  override: Record<string, unknown> = {},
  token: string | null = "test-token",
) {
  return fetch(
    `${baseUrl}/api/v1/admin/cod/test-orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      body: JSON.stringify({
        ...body,
        ...override,
      }),
    },
  );
}

// GET reconciliation helper.
async function getReport(
  urlSuffix = "",
  token: string | null = "test-token",
) {
  return fetch(
    `${baseUrl}/api/v1/admin/cod/reconciliation${urlSuffix}`,
    {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    },
  );
}

// Mock Prisma Decimal values.
const money = (amount: string) => ({
  toString: () => amount,
  equals: (other: { toString: () => string }) =>
    Number(amount) ===
    Number(other.toString()),
});

// Mock delivered COD order.
const fakeOrder = () => ({
  id: "order-test-916",
  orderNumber: body.orderNumber,
  total: money("916.00"),
  orderStatus: "DELIVERED",
  paymentMethod: "COD",
  paymentStatus: "PAID",
  financialClassification: null as
    | null
    | { type: "TEST" | "REAL" },
});

// Start local test server.
beforeAll(async () => {
  server = await new Promise<Server>(
    (resolve) => {
      const listener = app.listen(
        0,
        "127.0.0.1",
        () => resolve(listener),
      );
    },
  );

  baseUrl =
    `http://127.0.0.1:${
      (server.address() as AddressInfo).port
    }`;
});

// Stop test server.
afterAll(async () => {
  await new Promise<void>(
    (resolve, reject) =>
      server.close((error) =>
        error ? reject(error) : resolve(),
      ),
  );
});

// Reset the mocked database for every test.
beforeEach(() => {
  vi.resetAllMocks();

  mockDb.authSession.findUnique.mockResolvedValue({
    revokedAt: null,
    expiresAt: new Date(
      Date.now() + 60_000,
    ),
    user: {
      id: "admin-user",
      name: "Admin Test",
      email: null,
      phone: null,
      role: "ADMIN",
      status: "ACTIVE",
      profileImage: null,
    },
  });

  mockDb.$transaction.mockImplementation(
    async (
      fn: (
        client: typeof tx,
      ) => Promise<unknown>,
    ) => fn(tx),
  );

  tx.order.findUnique.mockResolvedValue(
    fakeOrder(),
  );

  tx.orderFinancialClassification.create
    .mockResolvedValue({
      id: "classification-test",
    });

  tx.financialClassificationAudit.create
    .mockResolvedValue({
      id: "audit-test",
    });

  mockDb.order.findMany.mockResolvedValue([]);
  mockDb.order.count.mockResolvedValue(0);
});

describe(
  "Admin COD financial classification (mocked, isolated)",
  () => {

    // ================================
    // SECURITY TESTS
    // ================================

    it(
      "rejects unauthenticated write without database mutation",
      async () => {
        const res =
          await postClassification({}, null);

        expect(res.status).toBe(401);

        expect(
          mockDb.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects non-admin write",
      async () => {
        mockDb.authSession.findUnique
          .mockResolvedValue({
            revokedAt: null,
            expiresAt: new Date(
              Date.now() + 60_000,
            ),
            user: {
              id: "customer",
              role: "CUSTOMER",
              status: "ACTIVE",
              name: "Customer",
              email: null,
              phone: null,
              profileImage: null,
            },
          });

        const res =
          await postClassification();

        expect(res.status).toBe(403);

        expect(
          mockDb.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    // ================================
    // VALIDATION TESTS
    // ================================

    it.each([
      { reason: "short" },
      { confirmation: "YES" },
      { expectedOrderTotal: "916.999" },
      { expectedPaymentStatus: "AUTHORIZED" },
      { unexpectedField: "not allowed" },
    ])(
      "rejects invalid confirmation payload %j",
      async (override) => {
        const res =
          await postClassification(override);

        expect(res.status).toBe(400);

        expect(
          mockDb.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not classify a nonexistent order",
      async () => {
        tx.order.findUnique
          .mockResolvedValue(null);

        const res =
          await postClassification();

        expect(res.status).toBe(404);

        expect(
          tx.orderFinancialClassification.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses non-COD order",
      async () => {
        tx.order.findUnique
          .mockResolvedValue({
            ...fakeOrder(),
            paymentMethod: "UPI",
          });

        const res =
          await postClassification();

        expect(res.status).toBe(409);

        expect(
          tx.orderFinancialClassification.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses orders not delivered",
      async () => {
        tx.order.findUnique
          .mockResolvedValue({
            ...fakeOrder(),
            orderStatus: "PLACED",
          });

        const res =
          await postClassification();

        expect(res.status).toBe(409);

        expect(
          tx.orderFinancialClassification.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requires confirmed order amount to match",
      async () => {
        const res =
          await postClassification({
            expectedOrderTotal: "915.00",
          });

        expect(res.status).toBe(409);

        expect(
          tx.orderFinancialClassification.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requires confirmed existing payment status to match",
      async () => {
        const res =
          await postClassification({
            expectedPaymentStatus: "PENDING",
          });

        expect(res.status).toBe(409);

        expect(
          tx.orderFinancialClassification.create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "blocks classification of already classified orders",
      async () => {
        tx.order.findUnique
          .mockResolvedValue({
            ...fakeOrder(),
            financialClassification: {
              type: "REAL",
            },
          });

        const res =
          await postClassification();

        expect(res.status).toBe(409);

        expect(
          tx.financialClassificationAudit.create,
        ).not.toHaveBeenCalled();
      },
    );

    // ================================
    // SUCCESSFUL CLASSIFICATION
    // ================================

    it(
      "records an explicit test classification and audit without changing payment",
      async () => {
        const res =
          await postClassification();

        expect(res.status).toBe(201);

        const json = await res.json();

        expect(
          json.data.financialType,
        ).toBe("TEST");

        expect(
          json.data.paymentStatus,
        ).toBe("PAID");

        expect(
          json.data.paymentChanged,
        ).toBe(false);

        expect(
          tx.orderFinancialClassification.create,
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            type: "TEST",
            classifiedById: "admin-user",
          }),
        });

        expect(
          tx.financialClassificationAudit.create,
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            actorId: "admin-user",
            beforeType: null,
            afterType: "TEST",
          }),
        });

        // Payment records must not be modified.
        expect(
          Object.keys(tx),
        ).not.toContain("payment");
      },
    );

    // ================================
    // RECONCILIATION SECURITY
    // ================================

    it(
      "rejects unauthenticated reconciliation report",
      async () => {
        const res =
          await getReport("", null);

        expect(res.status).toBe(401);

        expect(
          mockDb.order.findMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects invalid pagination",
      async () => {
        const res =
          await getReport("?page=0");

        expect(res.status).toBe(400);

        expect(
          mockDb.order.findMany,
        ).not.toHaveBeenCalled();
      },
    );

    // ================================
    // FINANCIAL REPORT SAFETY
    // ================================

    it(
      "excludes TEST and UNREVIEWED orders from real collection counts",
      async () => {
        const base = {
          createdAt: new Date(),
          updatedAt: new Date(),
          orderStatus: "DELIVERED",
          paymentMethod: "COD",
          deliveryPartner: null,
        };

        mockDb.order.findMany
          .mockResolvedValue([
            {
              ...base,
              id: "test1",
              orderNumber: "KG-TEST-1",
              paymentStatus: "PAID",
              total: money("916.00"),
              financialClassification: {
                type: "TEST",
                reason: "Simulated",
              },
              payment: {
                id: "p1",
                provider: "COD",
                status: "PAID",
                amount: money("916.00"),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },

            {
              ...base,
              id: "unreviewed1",
              orderNumber: "KG-UNREVIEWED",
              paymentStatus: "PENDING",
              total: money("259.00"),
              financialClassification: null,
              payment: null,
            },

            {
              ...base,
              id: "real1",
              orderNumber: "KG-REAL",
              paymentStatus: "PENDING",
              total: money("100.00"),
              financialClassification: {
                type: "REAL",
                reason: "Verified",
              },
              payment: null,
            },
          ]);

        mockDb.order.count
          .mockResolvedValue(3);

        const res = await getReport();

        expect(res.status).toBe(200);

        const json = await res.json();

        expect(
          json.data.pageSummary,
        ).toEqual({
          pendingCollection: 1,
          recordedNotReconciled: 0,
          reviewRequired: 0,
          testExcluded: 1,
          unreviewed: 1,
        });

        expect(
          json.data.records.map(
            (r: {
              reconciliationState: string;
            }) => r.reconciliationState,
          ),
        ).toEqual([
          "TEST_EXCLUDED",
          "UNREVIEWED",
          "PENDING_COLLECTION",
        ]);

        expect(
          json.data.records[0].paymentStatus,
        ).toBe("PAID");

        expect(
          json.data.records[0]
            .excludedFromRealCashSummary,
        ).toBe(true);
      },
    );
  },
);
