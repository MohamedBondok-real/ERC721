/**
 * @breastcare/shared — domain types, validation, the pluggable risk-assessment engine,
 * the nutrition knowledge base, educational content and canonical hashing.
 *
 * Imported by the backend, the frontend and the contract scripts so that clinical rules,
 * wording and hash derivations can never diverge between layers.
 */

export * from "./types";
export * from "./schemas";
export * from "./crypto";
export * from "./disclaimer";

export * from "./risk";
export * from "./nutrition";
export * from "./nutritionPlan";
export * from "./knowledge";
export * from "./redFlags";
