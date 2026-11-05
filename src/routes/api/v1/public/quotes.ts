import { createFileRoute } from '@tanstack/react-router';
// Compatibility alias; published external callers must use the auth-bypassed /api/public/v1/quotes.
export const Route = createFileRoute('/api/v1/public/quotes')({ server:{ handlers:{
  POST:async ({request}) => (await import('@/lib/quote-intake.server')).handleWebsiteQuote(request),
  OPTIONS:async ({request}) => (await import('@/lib/quote-intake.server')).handleWebsiteQuote(request),
} } });