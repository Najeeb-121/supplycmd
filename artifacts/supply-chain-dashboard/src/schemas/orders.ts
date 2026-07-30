import { z } from "zod";

export const orderSchema = z
  .object({
    supplierId: z.coerce.number().min(1, "Please select a supplier"),
    totalValue: z.coerce.number().min(0, "Order value must be ≥ 0"),
    orderDate: z.string().min(10, "Order date is required"),
    expectedDelivery: z.string().min(10, "Expected delivery is required"),
    itemCount: z.coerce.number().int().min(1, "Item count must be at least 1"),
  })
  .refine((d) => d.expectedDelivery >= d.orderDate, {
    message: "Delivery date must be on or after the order date",
    path: ["expectedDelivery"],
  });

export type OrderFormValues = z.infer<typeof orderSchema>;
