import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/payment-complete")({
  head: () => ({
    meta: [
      { title: "Payment received | MoveFlew" },
      { name: "description", content: "Thank you — your moving payment was submitted." },
      { property: "og:title", content: "Payment received | MoveFlew" },
      { property: "og:description", content: "Thank you for moving with MoveFlew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold text-card-foreground">Thank you!</h1>
        <p className="mt-2 text-muted-foreground">Your payment was submitted. You can hand the phone back to your crew.</p>
      </div>
    </main>
  ),
});
