import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { DEFAULT_PRICING } from "../../../shared/crm";

export default defineTool({
  name: "estimate_move_cost",
  title: "Estimate move cost",
  description: "Estimate labor cost for a move from crew size and hours, using the same math as the public pricing calculator.",
  inputSchema: {
    movers: z.number().int().min(1).max(DEFAULT_PRICING.rates.length).describe("Number of movers (1-6)."),
    hours: z.number().positive().max(24).describe("Expected hours; the 2.5-hour minimum is applied."),
    packing: z.boolean().optional().describe("Add standard packing help."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ movers, hours, packing }) => {
    const rate = DEFAULT_PRICING.rates[movers - 1];
    if (rate === undefined) throw new ToolError("Unsupported crew size");
    const billed = Math.max(DEFAULT_PRICING.minimumHours, hours);
    const hourly = rate + (packing ? DEFAULT_PRICING.packingRate : 0);
    const total = hourly * billed;
    return {
      content: [{ type: "text", text: `${movers} movers × ${billed} hours at $${hourly}/hour ≈ $${total.toFixed(2)} (estimate, before materials).` }],
      structuredContent: { movers, billedHours: billed, hourlyRate: hourly, total },
    };
  },
});
