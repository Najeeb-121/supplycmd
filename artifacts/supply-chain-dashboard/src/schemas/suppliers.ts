import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  value === "" || value == null ? undefined : value;

// Supplier performance values are optional because missing evidence must
// remain unknown rather than becoming fabricated defaults or zero.
export const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  country: z.string().min(1, "Country is required"),
  leadTimeDays: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int()
      .min(0)
      .max(365, "Lead time must be 0-365 days")
      .optional(),
  ),
  onTimeDeliveryRate: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(100, "Must be 0-100").optional(),
  ),
  qualityScore: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(100, "Must be 0-100").optional(),
  ),
  fillRate: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(100, "Must be 0-100").optional(),
  ),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;