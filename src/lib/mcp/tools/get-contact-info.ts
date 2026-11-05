import { defineTool } from "@lovable.dev/mcp-js";

const info = {
  email: "support@moveflew.com",
  product: "MoveFlew — moving operations CRM",
};

export default defineTool({
  name: "get_contact_info",
  title: "Get contact info",
  description: "Return MoveFlew's public support email and product summary.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: `Email: ${info.email}\nProduct: ${info.product}` }],
    structuredContent: { ...info },
  }),
});
