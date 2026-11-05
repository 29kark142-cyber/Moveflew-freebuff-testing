import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { crmFetch } from '@/lib/crm';
import { canTestBook } from '@/lib/test-booking';
import { Modal } from './WorkspaceUI';

export default function TestBookingButton({ jobId, role, onBooked }: { jobId: number; role: string; onBooked: () => void | Promise<void> }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAvailable(canTestBook(window.location.hostname, role)); }, [role]);
  if (!available) return null;
  const book = async () => {
    setBusy(true);
    try {
      await crmFetch(`/jobs/${jobId}/test-approve`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
      setOpen(false);
      toast.success('Approved / Booked for testing — no deposit collected');
      await onBooked();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve test booking');
    } finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><Check />Approve / Book (Testing)</Button>
    {open && <Modal title="Approve test booking" onClose={() => { if (!busy) setOpen(false); }}>
      <div className="ws-modal__body">
        <p>This marks the estimate and any active proposal as approved for testing and books the job without collecting a deposit or customer signature.</p>
        <p className="ws-alert">Preview only. This changes the shared workspace job; no payment is recorded.</p>
        <div className="ops-form-actions">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => void book()}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}Confirm test booking</Button>
        </div>
      </div>
    </Modal>}
  </>;
}