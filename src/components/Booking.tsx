import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronLeft, Clock3, Info, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import type { Availability, BookingResult, Meta } from '../types';
import { addDays, api, ApiError, chatLink, durationLabel, formatDate, formatTime, money, newRequestId, scrollTo, today, validDate } from '../lib';
import { CopyButton, ServiceIcon, WhatsAppIcon } from './Shared';

type Details = { name: string; phone: string; vehicle: string; note: string; consent: boolean; company: string };
const emptyDetails: Details = { name: '', phone: '', vehicle: '', note: '', consent: false, company: '' };

export function Booking({ meta, serviceId, onChangeService, onPrivacy }: { meta: Meta; serviceId: string; onChangeService: (id: string) => void; onPrivacy: () => void }) {
  const [date, setDate] = useState(today);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const service = meta.services.find((s) => s.id === serviceId) || meta.services[0];
  const isDemo = !meta.live;
  const prefix = isDemo ? '/api/demo' : '/api';
  const selectedSlot = availability?.slots.find((s) => s.time === selectedTime && s.available);
  const maxDate = addDays(today(), meta.windowDays);

  useEffect(() => { setSelectedTime(''); setStep(1); setResult(null); setError(''); setFields({}); requestId.current = null; }, [serviceId]);
  useEffect(() => {
    if (!validDate(date) || date < today() || date > maxDate) { setAvailability(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    api<Availability>(`${prefix}/availability?date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`, { signal: controller.signal })
      .then((data) => { setAvailability(data); setSelectedTime((previous) => data.slots.some((s) => s.time === previous && s.available) ? previous : ''); })
      .catch((err) => { if (!(err instanceof DOMException && err.name === 'AbortError')) { setError(err.message); setAvailability(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, serviceId, prefix, refresh, maxDate]);
  useEffect(() => { if (step === 2 || result) heading.current?.focus({ preventScroll: true }); }, [step, result]);

  const update = (key: keyof Details, value: string | boolean) => { setDetails((previous) => ({ ...previous, [key]: value })); setFields((previous) => ({ ...previous, [key]: '' })); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSlot || submitting) return;
    const nextFields: Record<string, string> = {};
    if (!isDemo && details.name.trim().length < 2) nextFields.name = 'Please enter your name.';
    if (!isDemo && !/^(\+91|91)?[6-9]\d{9}$/.test(details.phone.replace(/[\s()\-]/g, ''))) nextFields.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (!isDemo && details.vehicle.trim().length < 2) nextFields.vehicle = 'Please enter your car model or number.';
    if (!details.consent) nextFields.consent = 'Please agree before continuing.';
    if (Object.keys(nextFields).length) { setFields(nextFields); return; }
    setSubmitting(true); setError(''); setFields({});
    requestId.current ||= newRequestId();
    try {
      const response = await api<BookingResult>(`${prefix}/bookings`, { method: 'POST', body: JSON.stringify({ ...details, phone: isDemo && !details.phone.trim() ? '' : details.phone, date, time: selectedTime, serviceId, requestId: requestId.current }) });
      setResult(response); setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the booking. Please try again.');
      if (err instanceof ApiError) { setFields(err.fields); if (err.status === 409) { requestId.current = null; setSelectedTime(''); setStep(1); setRefresh((n) => n + 1); } }
    } finally { setSubmitting(false); }
  };
  const startOver = () => { setResult(null); setStep(1); setSelectedTime(''); setDetails(emptyDetails); setFields({}); setError(''); requestId.current = null; setRefresh((n) => n + 1); };

  return <section className="booking-section" id="book"><div className="container">
    <div className="booking-heading"><div><span className="eyebrow eyebrow-yellow">YOUR CAR CALLED. IT’S TIME.</span><h2>Make room for a little shine.</h2><p>Choose your day. Pick your time. We’ll take care of the details.</p></div><span className="booking-heading-icon"><CalendarDays size={37} strokeWidth={1.3} /></span></div>
    {isDemo && <div className="demo-notice"><Info size={19} /><p><strong>You’re trying the demo.</strong> Hours and durations are examples, not the shop’s confirmed schedule. Demo bookings don’t reserve a real slot or message the centre.</p><span>PREVIEW MODE</span></div>}
    <div className="booking-shell">
      <aside className="booking-summary">
        <span className="eyebrow">YOUR PIT STOP</span>
        <div className="summary-service-icon"><ServiceIcon name={service.icon} size={35} /></div>
        <h3>{service.name}</h3><span className="summary-hindi">{service.hindi}</span>
        <ul>{service.includes.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
        <div className="summary-meta"><span><Clock3 size={16} />{durationLabel(service.minutes)}{isDemo && <small>demo estimate</small>}</span><span><CalendarDays size={16} />{formatDate(date)}{selectedTime && <small>{formatTime(selectedTime)}{selectedSlot ? ` – ${formatTime(selectedSlot.endTime)}` : ''}</small>}</span></div>
        <div className="summary-total"><span>Pay at the centre</span><strong>{money(service.price)}</strong></div>
        <p className="summary-note"><ShieldCheck size={16} /> No online payment. No booking fee.</p>
        <div className="summary-bottom"><Sparkles size={21} /><span>A little care.<br />A lot of difference.</span></div>
      </aside>
      <div className="booking-main">
        {result ? <div className="booking-success">
          <span className={`success-icon ${result.demo ? 'success-demo' : ''}`}>{result.demo ? <Sparkles size={32} /> : <CheckCheck size={32} />}</span>
          <span className="eyebrow">{result.demo ? 'LOOKING GOOD — IN DEMO MODE' : 'ONE LAST STEP'}</span>
          <h3 ref={heading} tabIndex={-1}>{result.demo ? 'That’s how easy it is.' : 'Your slot is on hold.'}</h3>
          <p>{result.demo ? 'Your preview booking is in the demo dashboard. No real appointment was made, and nothing was sent to Sanju bhaiya.' : <>Now open WhatsApp and <strong>tap Send</strong>. Sanju bhaiya will check your request and confirm your booking.</>}</p>
          <div className="confirmation-ticket"><div><span>{result.demo ? 'DEMO REFERENCE' : 'BOOKING REFERENCE'}</span><strong>{result.booking.reference}</strong><CopyButton text={result.booking.reference} label="Copy reference" /></div><dl><div><dt>Service</dt><dd>{result.booking.serviceName}</dd></div><div><dt>Date</dt><dd>{formatDate(result.booking.date, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt>Time</dt><dd>{formatTime(result.booking.time)} – {formatTime(result.booking.endTime)} IST</dd></div><div><dt>Price</dt><dd>{money(result.booking.price)}</dd></div></dl></div>
          {!result.demo && <><div className="hold-note"><Clock3 size={17} /><span>Held for {meta.holdMinutes} minutes. Sending the message alone isn’t confirmation — wait for the centre to reply.</span></div><a className="button button-whatsapp w-full" href={result.whatsappUrl!} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={22} /> Open WhatsApp & send <ArrowUpRight size={20} /></a><a className="success-help" href={chatLink(meta.business.whatsapp, `Namaste, I need help with booking ${result.booking.reference}.`)} target="_blank" rel="noopener noreferrer">Having trouble? Contact the centre <ArrowUpRight size={14} /></a></>}
          {result.demo && <a className="button button-dark w-full" href="/admin">Explore the demo dashboard <ArrowUpRight size={19} /></a>}
          <button className="text-button start-over" onClick={startOver}><RefreshCw size={15} /> {result.demo ? 'Try another booking' : 'Make another request'}</button>
        </div> : <>
          <div className="booking-steps" aria-label="Booking progress"><button className={step === 1 ? 'active' : 'done'} onClick={() => setStep(1)} aria-current={step === 1 ? 'step' : undefined}><span>{step > 1 ? <Check size={14} /> : '1'}</span> Date & time</button><div /><button className={step === 2 ? 'active' : ''} disabled={!selectedSlot} onClick={() => setStep(2)} aria-current={step === 2 ? 'step' : undefined}><span>2</span> Your details</button></div>
          {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span></div>}
          {step === 1 ? <div className="booking-step-content">
            <div className="booking-field-heading"><h3 ref={heading} tabIndex={-1}>When works for you?</h3><span>All times in IST</span></div>
            <label className="field-label" htmlFor="booking-service">Your service</label><select id="booking-service" className="form-input" value={serviceId} onChange={(e) => onChangeService(e.target.value)}>{meta.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.price)}</option>)}</select>
            <div className="date-label-row"><label className="field-label" htmlFor="booking-date">Pick a date</label><div className="date-input-wrap"><CalendarDays size={15} /><input id="booking-date" type="date" value={date} min={today()} max={maxDate} onChange={(e) => { setDate(e.target.value); setSelectedTime(''); }} aria-label="Choose booking date" /></div></div>
            <div className="date-strip">{Array.from({ length: 7 }, (_, i) => addDays(today(), i)).map((day, i) => <button key={day} className={date === day ? 'selected' : ''} onClick={() => { setDate(day); setSelectedTime(''); }} aria-pressed={date === day} aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}><span>{i === 0 ? 'TODAY' : formatDate(day, { weekday: 'short' }).toUpperCase()}</span><strong>{Number(day.slice(-2))}</strong><small>{formatDate(day, { month: 'short' })}</small></button>)}</div>
            <div className="slots-heading"><span className="field-label">Available start times</span><button className="text-button" disabled={loading} onClick={() => setRefresh((n) => n + 1)} aria-label="Refresh available slots"><RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh</button></div>
            <div className="slots-area" aria-busy={loading}>
              {loading ? <div className="slots-loading"><LoaderCircle size={24} className="spin" /><span>Finding your next pit stop…</span></div> : !validDate(date) || date < today() || date > maxDate ? <div className="no-slots"><CalendarDays size={25} /><p>Please choose a date within the next {meta.windowDays} days.</p></div> : availability?.closedReason ? <div className="no-slots"><CalendarDays size={25} /><p>{availability.closedReason}</p></div> : availability?.slots.length ? <><div className="slots-grid">{availability.slots.map((slot) => <button key={slot.time} className={`slot ${selectedTime === slot.time ? 'selected' : ''}`} disabled={!slot.available} aria-pressed={selectedTime === slot.time} aria-label={`${formatTime(slot.time)} to ${formatTime(slot.endTime)}${!slot.available ? slot.reason === 'full' ? ', fully booked' : ', unavailable' : ''}`} onClick={() => setSelectedTime(slot.time)}>{formatTime(slot.time)}{selectedTime === slot.time && <Check size={12} />}{!slot.available && <small>{slot.reason === 'full' ? 'Full' : 'Unavailable'}</small>}</button>)}</div><div className="slot-legend"><span><i />Available</span><span><i className="legend-full" />Unavailable / full</span><span><i className="legend-selected" />Your pick</span></div>{availability.slots.every((s) => !s.available) && <p className="all-full">No slots left for this day. Try another date or <a href={`tel:${meta.business.phone}`}>call the centre</a>.</p>}</> : <div className="no-slots"><p>No schedule available. Please contact the centre.</p></div>}
            </div>
            <div className="booking-step-footer"><span><Clock3 size={16} /> {durationLabel(service.minutes)} reserved for your service{isDemo && ' (demo)'}</span><button className="button button-dark" disabled={!selectedSlot || loading} onClick={() => { setStep(2); setError(''); }}>Your details <ArrowRight size={18} /></button></div>
          </div> : <form className="booking-step-content details-form" onSubmit={submit} noValidate>
            <div className="booking-field-heading"><h3 ref={heading} tabIndex={-1}>Who’s bringing the car?</h3><button type="button" className="text-button" onClick={() => setStep(1)}><ChevronLeft size={15} /> Edit slot</button></div>
            <p className="form-intro">{isDemo ? 'Use made-up details, or leave these optional fields blank. Personal details are discarded in demo mode.' : 'Just a few details, so your visit feels personal.'}</p>
            <div className="form-grid"><div className="form-field"><label htmlFor="customer-name">Your name {!isDemo && <span>*</span>}</label><input id="customer-name" className="form-input" autoComplete="name" placeholder={isDemo ? 'Optional — not stored' : 'e.g. Rahul Sharma'} maxLength={60} value={details.name} onChange={(e) => update('name', e.target.value)} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined} />{fields.name && <small id="name-error" className="field-error">{fields.name}</small>}</div>
            <div className="form-field"><label htmlFor="customer-phone">WhatsApp number {!isDemo && <span>*</span>}</label><div className="phone-input"><span>+91</span><input id="customer-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder={isDemo ? 'Optional — not stored' : '10-digit mobile number'} maxLength={16} value={details.phone} onChange={(e) => update('phone', e.target.value)} aria-invalid={!!fields.phone} aria-describedby={fields.phone ? 'phone-error' : undefined} /></div>{fields.phone && <small id="phone-error" className="field-error">{fields.phone}</small>}</div></div>
            <div className="form-field"><label htmlFor="customer-vehicle">Car model / registration number {!isDemo && <span>*</span>}</label><input id="customer-vehicle" className="form-input" autoComplete="off" placeholder={isDemo ? 'Optional — not stored' : 'e.g. Swift · MP04 AB 1234'} maxLength={40} value={details.vehicle} onChange={(e) => update('vehicle', e.target.value)} aria-invalid={!!fields.vehicle} aria-describedby={fields.vehicle ? 'vehicle-error' : undefined} />{fields.vehicle && <small id="vehicle-error" className="field-error">{fields.vehicle}</small>}</div>
            <div className="form-field"><label htmlFor="customer-note">Anything we should know? <span className="optional">Optional</span></label><textarea id="customer-note" className="form-input" rows={2} maxLength={240} placeholder={isDemo ? 'Demo note — not stored' : 'A request for the team…'} value={details.note} onChange={(e) => update('note', e.target.value)} /><small className="character-count">{details.note.length}/240</small></div>
            <div className="hidden-field" aria-hidden="true"><label htmlFor="company">Leave this empty</label><input id="company" name="company" tabIndex={-1} autoComplete="off" value={details.company} onChange={(e) => update('company', e.target.value)} /></div>
            <label className="consent-label"><input type="checkbox" checked={details.consent} onChange={(e) => update('consent', e.target.checked)} /><span>{isDemo ? 'I understand this is a demo, not a real appointment.' : <>I agree to share these details with the centre and send my booking on WhatsApp. <button type="button" onClick={onPrivacy}>Privacy & terms</button></>}</span></label>{fields.consent && <small className="field-error">{fields.consent}</small>}
            <div className="booking-step-footer"><span><ShieldCheck size={16} /> {isDemo ? 'No message sent to the shop' : 'Pay at the centre. Always.'}</span><button type="submit" className="button button-dark" disabled={submitting || !selectedSlot}>{submitting ? <><LoaderCircle size={18} className="spin" /> Creating…</> : <>{isDemo ? 'Create demo booking' : 'Reserve & continue'} <ArrowRight size={18} /></>}</button></div>
          </form>}
        </>}
      </div>
    </div>
    <div className="booking-under"><span><Info size={15} /> {isDemo ? 'Live bookings open after the owner saves actual shop hours and service durations.' : 'A request is not a confirmed appointment. Please wait for the centre’s reply on WhatsApp.'}</span><button onClick={() => scrollTo('services')}>Change service <ArrowLeft size={14} /></button></div>
  </div></section>;
}
