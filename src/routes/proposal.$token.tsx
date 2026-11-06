import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { PageLoader } from '@/components/loaders/MoveFlewLoader';
const ProposalPage = lazy(() => import('@/pages/app/ProposalPage'));
export const Route = createFileRoute('/proposal/$token')({
  head:()=>({meta:[
    {title:'Your moving proposal | MoveFlew'},
    {name:'description',content:'Review your moving estimate and securely sign your customer proposal.'},
    {property:'og:title',content:'Moving proposal | MoveFlew'},
    {property:'og:description',content:'Review and accept your MoveFlew estimate.'},
    {property:'og:type',content:'website'},
    {name:'twitter:card',content:'summary_large_image'},
    {name:'robots',content:'noindex, nofollow'},
    {name:'referrer',content:'no-referrer'},
  ]}),
  component:ProposalRoute,
});
function ProposalRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<PageLoader label="Loading proposal…" />}>
      <Suspense fallback={<PageLoader label="Loading proposal…" />}>
        <ProposalPage token={token} />
      </Suspense>
    </ClientOnly>
  );
}