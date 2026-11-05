import { createFileRoute } from "@tanstack/react-router";
import CrewOnboarding from "@/components/workspace/CrewOnboarding";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Your team invitation — MoveFlew" },
    { name: "description", content: "Complete your crew registration and join your MoveFlew field workspace." },
    { property: "og:title", content: "Your team invitation — MoveFlew" },
    { property: "og:description", content: "Accept your workspace invitation and register as a crew member." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  return <CrewOnboarding token={token} />;
}