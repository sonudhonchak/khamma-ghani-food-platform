# Khamma Ghani Food Delivery Platform

A production-oriented food-delivery platform being built from scratch with a zero-budget development constraint.

## Product standard

This is not a demo. The architecture is designed for a real local food-delivery business:

- Customer application
- Restaurant partner portal
- Delivery partner portal
- Admin portal
- REST API
- PostgreSQL database
- Authentication and RBAC
- Cart and order workflows
- Coupons, reviews and notifications
- Secure payment architecture
- Image storage abstraction
- Analytics
- Responsive/mobile-first UI

## Zero-budget rule

Initial development must use free/open-source tooling and free tiers. No paid service is required for the foundation.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Node.js + TypeScript + Express
- PostgreSQL
- Prisma ORM
- npm workspaces

## Repository structure

```text
apps/
  web/       Customer-facing React application
  api/       Node/Express API
packages/
  shared/    Shared TypeScript contracts
prisma/      Database schema
```

## Android workflow

This repository is designed to be manageable from Android using GitHub's web editor and free browser-based development environments.

For local/browser development with a Node environment:

```bash
npm install
npm run typecheck
npm run build
```

## Important

- Never commit `.env`.
- Never place database/payment/auth secrets in frontend code.
- Payment success must be verified server-side when real payments are connected.
- Prices, discounts and totals must be recalculated by the server.
- Features are added incrementally and tested before the next phase.

## Current stage

**Phase 1 — Foundation**

Implemented:
- Monorepo structure
- React/Vite/TypeScript frontend
- Tailwind CSS
- Routing
- Responsive professional shell
- Node/Express API
- Health endpoint
- Shared API types
- PostgreSQL/Prisma schema foundation
- Environment configuration
- GitHub-safe `.gitignore`

Next:
- Authentication
- Database migration/seed
- Customer location
- Restaurant discovery
- Search/filtering
