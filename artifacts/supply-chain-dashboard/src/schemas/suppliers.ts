import { z } from "zod";

// on-time delivery rate, quality score, and fill rate all use the same
// 0-100 percentage scale, matching the API validation and how they're
// displayed everywhere in the UI.
export const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  country: z.string().min(1, "Country is required"),
  leadTimeDays: z.coerce.number().int().min(0).max(365, "Lead time must be 0-365 days"),
  onTimeDeliveryRate: z.coerce.number().min(0).max(100, "Must be 0-100"),
  qualityScore: z.coerce.number().min(0).max(100, "Must be 0-100"),
  fillRate: z.coerce.number().min(0).max(100, "Must be 0-100"),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
