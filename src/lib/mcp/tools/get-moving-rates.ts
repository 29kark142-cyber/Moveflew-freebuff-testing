import { defineTool } from "@lovable.dev/mcp-js";
import { DEFAULT_PRICING } from "../../../shared/crm";

export default defineTool({
  name: "get_moving_rates",
  title: "Get moving rates",
  description: "List MoveFlew's public hourly rates by crew size, minimum hours, packing rate and box prices.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const p = DEFAULT_PRICING;
    const rates = p.rates.map((hourly, i) => ({ movers: i + 1, hourlyRate: hourly }));
    const text = [
      ...rates.map((r) => `${r.movers} mover${r.movers > 1 ? "s" : ""}: $${r.hourlyRate}/hour`),
      `Minimum order: ${p.minimumHours} hours`,
      `Packing help: $${p.packingRate}/hour`,
      ...p.materials.map((m) => `${m.name}: $${m.price}`),
    ].join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: {
        rates,
        minimumHours: p.minimumHours,
        packingRate: p.packingRate,
        materials: p.materials.map((m) => ({ name: m.name, price: m.price })),
      },
    };
  },
});
