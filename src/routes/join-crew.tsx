import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import CrewOnboarding from "@/components/workspace/CrewOnboarding";

export const Route = createFileRoute("/join-crew")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Join the crew — MoveFlew" },
      { name: "description", content: "Accept your invite to join your MoveFlew team workspace." },
      { property: "og:title", content: "Join the crew — MoveFlew" },
      { property: "og:description", content: "Accept your crew invite and set up your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinCrew,
});

function JoinCrew() {
  const { token = "" } = Route.useSearch();
  return <CrewOnboarding token={token} />;
}
