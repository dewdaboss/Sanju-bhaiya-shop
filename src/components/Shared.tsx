import { useEffect, useRef, useState } from 'react';
import { CarFront, Wind, Gauge, Sparkles, Layers3, Crown, ArrowUpRight, MessageCircle, X, Check, Copy } from 'lucide-react';
import type { BookingStatus } from '../types';
import { statusLabel } from '../lib';

export function ServiceIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = ({ car: CarFront, wind: Wind, dashboard: Gauge, sparkles: Sparkles, layers: Layers3, crown: Crown } as Record<string, typeof CarFront>)[name] || CarFront;
  return <Icon size={size} strokeWidth={1.7} className={className} aria-hidden="true" />;
}

export function Brand({ light = false, onClick }: { light?: boolean; onClick?: () => void }) {
  return <a href="#home" onClick={onClick} className={`brand ${light ? 'brand-light' : ''}`} aria-label="Iconic Car Washing Centre — home">
    <span className="brand-mark" aria-hidden="true"><i /><i /></span>
    <span><span className="brand-name">ICONIC<span className="brand-dot">.</span></span><span className="brand-sub">CAR WASHING CENTRE</span></span>
  </a>;
}

export function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return <MessageCircle size={size} strokeWidth={1.9} aria-hidden="true" />;
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`status-badge status-${status}`}><span />{statusLabel(status)}</span>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => { if (state === 'idle') return; const timer = window.setTimeout(() => setState('idle'), 2500); return () => clearTimeout(timer); }, [state]);
  return <button type="button" className="text-button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('error'); }
  }}>{state === 'copied' ? <Check size={15} /> : <Copy size={15} />}{state === 'copied' ? 'Copied' : state === 'error' ? 'Select & copy manually' : label}</button>;
}

export function PrivacyDialog({ onClose, phone }: { onClose: () => void; phone: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="privacy-dialog" onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }} aria-labelledby="privacy-title">
    <div className="dialog-inner">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close privacy notice"><X size={22} /></button>
      <span className="eyebrow">CLEAR & SIMPLE</span>
      <h2 id="privacy-title">Your details. Your trust.</h2>
      <p>For a live booking, we store your name, mobile number, vehicle details, optional note, service, date and time on the centre’s booking server. The owner uses these to manage your appointment.</p>
      <h3>WhatsApp is a separate step</h3><p>Opening WhatsApp does not send a message. You review the details and tap Send. WhatsApp’s own privacy terms then apply. The owner must confirm your booking; this website does not send automatic WhatsApp notifications.</p>
      <h3>Holds, changes & deletion</h3><p>New requests hold a slot for 15 minutes while you send the WhatsApp message. Unconfirmed holds expire. The owner confirms requests after checking them. To change, cancel or delete your booking details, contact the centre at {phone}. Deleting an active booking may free its slot.</p>
      <h3>Demo mode</h3><p>Preview bookings are fictional and separate from real bookings. Personal fields are optional and discarded by the server. Demo messages are never sent to the shop.</p>
      <h3>At the centre</h3><p>Pay directly at the centre. Service durations are estimates until the owner confirms actual timings. The centre’s displayed notice states that it does not accept responsibility for breakage or damage; please discuss your vehicle’s condition before service.</p>
      <button className="button button-dark w-full mt-6" onClick={onClose}>Got it <Check size={18} /></button>
    </div>
  </dialog>;
}

export function ExternalArrow() { return <ArrowUpRight size={17} aria-hidden="true" />; }
