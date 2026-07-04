/**
 * Pre-flight cost estimator. Meta charges per template conversation;
 * the India marketing-template rate is configurable so the CEO is never
 * surprised by a bill. Update NEXT_PUBLIC_COST_PER_MESSAGE_INR when Meta
 * revises pricing.
 */
export const COST_PER_MESSAGE_INR = Number(
  process.env.NEXT_PUBLIC_COST_PER_MESSAGE_INR || "0.88"
);

export function estimateCostInr(messageCount: number): number {
  return Math.round(messageCount * COST_PER_MESSAGE_INR * 100) / 100;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}
