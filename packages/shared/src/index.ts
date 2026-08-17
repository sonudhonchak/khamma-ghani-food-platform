export const APP_NAME = "Khamma Ghani";
export const APP_TAGLINE = "Padharo Sa";

export type UserRole =
  | "CUSTOMER"
  | "RESTAURANT_OWNER"
  | "DELIVERY_PARTNER"
  | "ADMIN";

export type ApiHealthResponse = {
  status: "ok";
  service: string;
  timestamp: string;
  version: string;
};

export const API_VERSION = "v1";
