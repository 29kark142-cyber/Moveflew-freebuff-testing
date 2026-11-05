import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/v1/quotes')({ server:{ handlers:{
  POST:async ({request}) => (await import('@/lib/quote-intake.server')).handleWebsiteQuote(request),
  OPTIONS:async ({request}) => (await import('@/lib/quote-intake.server')).handleWebsiteQuote(request),
} } });