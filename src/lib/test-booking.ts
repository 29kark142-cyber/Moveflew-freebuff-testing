import { isPreviewHost } from './payment-mode';

export function canTestBook(hostname: string, role: string | null): boolean {
  return isPreviewHost(hostname) && (role === 'admin' || role === 'office_admin');
}