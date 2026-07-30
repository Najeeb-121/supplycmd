import { z } from "zod";

export const itemSchema = z
  .object({
    name: z.string().min(2),
    sku: z.string().min(1),
    barcode: z.string().optional(),
    description: z.string().optional(),
    category: z.string().min(1),
    subcategory: z.string().optional(),
    brand: z.string().optional(),
    unitOfMeasure: z.string().min(1).default("units"),
    warehouse: z.string().optional(),
    binLocation: z.string().optional(),
    supplierName: z.string().optional(),
    unitCost: z.coerce.number().min(0),
    sellingPrice: z.coerce.number().min(0).optional(),
    currentStock: z.coerce.number().int().min(0),
    reservedQuantity: z.coerce.number().int().min(0).default(0),
    minStock: z.coerce.number().int().min(0).default(0),
    maxStock: z.coerce.number().int().min(0).optional(),
    annualDemand: z.coerce.number().min(0),
    leadTimeDays: z.coerce.number().int().min(0),
    orderingCost: z.coerce.number().min(0),
    holdingCostRate: z.coerce.number().min(0).max(1),
  })
  .refine((d) => d.maxStock == null || d.maxStock >= d.minStock, {
    message: "Max Stock must be ≥ Min Stock",
    path: ["maxStock"],
  });

export type ItemForm = z.infer<typeof itemSchema>;

export const movementSchema = z.object({
  movementType: z.string().min(1, "Movement type is required"),
  action: z.string().min(2, "Action description is required"),
  quantityChanged: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .refine((v) => v !== 0, { message: "Quantity must be non-zero" }),
  referenceNumber: z.string().optional(),
  reason: z.string().optional(),
  warehouse: z.string().optional(),
  user: z.string().min(1).default("operator"),
});

export type MovementForm = z.infer<typeof movementSchema>;
