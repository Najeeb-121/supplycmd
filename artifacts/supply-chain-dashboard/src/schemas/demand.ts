import { z } from "zod";

export const demandSchema = z.object({
  productName: z.string().min(2, "Product name is required."),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Must match YYYY-MM (e.g. 2026-07)"),
  actualDemand: z.coerce.number().min(0),
  forecastedDemand: z.coerce.number().min(0),
});

export type DemandFormValues = z.infer<typeof demandSchema>;
