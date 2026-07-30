import { z } from "zod";

export const productionSchema = z
  .object({
    productName: z.string().min(2, "Product name is required."),
    plannedUnits: z.coerce.number().int().min(0),
    actualUnits: z.coerce.number().int().min(0),
    plannedTimeMin: z.coerce.number().int().min(1),
    actualTimeMin: z.coerce.number().int().min(0),
    defects: z.coerce.number().int().min(0),
    downtimeMin: z.coerce.number().int().min(0),
    runDate: z.string().min(10, "Date is required"),
  })
  .refine((d) => d.defects <= d.actualUnits, {
    message: "Defects cannot exceed Actual Units Produced",
    path: ["defects"],
  });

export type ProductionFormValues = z.infer<typeof productionSchema>;
