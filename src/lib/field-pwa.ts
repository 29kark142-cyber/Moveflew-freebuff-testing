export function refusesFieldWorker(host: string, production: boolean, framed: boolean, disabled: boolean) {
  const h = host.toLowerCase();
  const label = h.split('.')[0];
  return !production || framed || disabled || h === 'localhost' || h === '127.0.0.1'
    || ((h.endsWith('.lovable.app') || h.endsWith('.gpt-eng.com') || h.endsWith('.gptengineer.run')) && (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label) || /^project--.+-dev$/.test(label)))
    || ['lovableproject.com','lovableproject-dev.com','beta.lovable.dev'].some(d => h === d || h.endsWith(`.${d}`));
}
export async function registerFieldWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (refusesFieldWorker(window.location.hostname, import.meta.env.PROD, window.self !== window.top, new URLSearchParams(window.location.search).get('sw') === 'off')) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(r => [r.active, r.waiting, r.installing].some(w => w && new URL(w.scriptURL).pathname === '/sw.js')).map(r => r.unregister()));
    return;
  }
  if (!window.location.pathname.startsWith('/app/field')) return;
  await navigator.serviceWorker.register('/sw.js', { scope: '/app/field' });
}