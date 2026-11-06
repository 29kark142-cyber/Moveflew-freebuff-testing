export const moveflewFaq = [
  { q: "How much does MoveFlew cost?", a: "MoveFlew is free during beta, with every module and unlimited users. Paid pricing will be shared with beta companies before beta closes." },
  { q: "Do I need a credit card or a contract to start?", a: "No. You can create a workspace without a credit card, and there is no annual contract." },
  { q: "Does the crew app work without cell service?", a: "Yes. The field app saves signatures, photos and timestamps on the phone and syncs them automatically when the connection returns." },
  { q: "Can customers sign proposals and pay a deposit online?", a: "Yes. You send a proposal link, the customer signs it online and pays the deposit by card; the job is booked once payment is confirmed." },
  { q: "How are travel time and fuel charges calculated?", a: "MoveFlew uses Google Maps routes from your dispatch base to calculate miles and drive time, then applies the travel and fuel rules you set." },
  { q: "Can I switch from SmartMoving?", a: "Yes. You can set up your trucks, crew and pricing in a new workspace and run your next move on MoveFlew while you evaluate it." },
  { q: "Is my company's data kept separate?", a: "Yes. Every workspace is isolated at the database level, and crew members only see the jobs they are assigned to." },
  { q: "How do I sign in to MoveFlew?", a: "Open the Team login page. Depending on what your workspace has enabled, you can use an email/password, Google, an email sign-in link, a phone verification code, or Manus. New companies can create an account and workspace from the same page." },
  { q: "Can I invite my crew?", a: "Yes. Admins and office admins can invite crew from Settings → Membership with a secure share link or email. The invitee completes onboarding before they can see workspace records." },
];

export function faqJsonLd() {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: moveflewFaq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
  };
}
