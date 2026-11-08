import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, IndianRupee, Info, LoaderCircle, LockKeyhole, LogOut, MessageCircle, RefreshCw, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import type { DayBookings, Meta, Settings } from '../types';
import { addDays, api, ApiError, formatDate, formatTime, money, today } from '../lib';
import { Brand, StatusBadge, WhatsAppIcon } from './Shared';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Workspace = 'login' | 'demo' | 'real';

export function Admin({ meta, onMetaRefresh }: { meta: Meta; onMetaRefresh: () => Promise<void> }) {
  const [workspace, setWorkspace] = useState<Workspace>('login');
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'bookings' | 'settings'>('bookings');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState(today());
  const [day, setDay] = useState<DayBookings | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const isDemo = workspace === 'demo';
  const prefix = isDemo ? '/api/demo' : '/api/admin';

  useEffect(() => {
    document.title = 'Owner desk — Iconic';
    api<{ authenticated: boolean }>('/api/admin/session').then((data) => { if (data.authenticated) setWorkspace('real'); }).catch((err) => setError(err.message)).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (workspace === 'login' || tab !== 'bookings') return;
    let active = true;
    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api<DayBookings>(`${prefix}/bookings?date=${date}`);
        if (active) { setDay(data); setError(''); }
      } catch (err) {
        if (active) { setError(err instanceof Error ? err.message : 'Could not load bookings.'); if (err instanceof ApiError && err.status === 401) setWorkspace('login'); }
      } finally { if (active) setLoading(false); }
    };
    load();
    const timer = window.setInterval(() => load(true), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [workspace, tab, date, prefix, refresh]);
  useEffect(() => {
    if (workspace !== 'real' || tab !== 'settings') return;
    api<{ settings: Settings | null }>('/api/admin/settings').then((data) => setSettings(data.settings || { ...meta.settings, live: false })).catch((err) => setError(err.message));
  }, [workspace, tab, meta.settings]);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setLoggingIn(true); setError('');
    try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); setWorkspace('real'); setPassword(''); setTab('bookings'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); }
    finally { setLoggingIn(false); }
  };
  const logout = async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); setWorkspace('login'); setDay(null); setSettings(null); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign out.'); }
  };
  const changeStatus = async (id: number, status: string) => {
    if (status === 'cancelled' && !window.confirm('Cancel this booking? Its slot will become available. Tell the customer on WhatsApp before cancelling.')) return;
    setBusyId(id); setError('');
    try { await api(`${prefix}/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setRefresh((n) => n + 1); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update booking.'); }
    finally { setBusyId(null); }
  };
  const deleteRecord = async (id: number) => {
    if (!window.confirm('Permanently delete this cancelled booking and its personal details? Download any needed records first.')) return;
    setBusyId(id);
    try { await api(`${prefix}/bookings/${id}`, { method: 'DELETE' }); setRefresh((n) => n + 1); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete record.'); }
    finally { setBusyId(null); }
  };
  const shareList = async () => {
    setSharing(true); setShareUrl('');
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const data = await api<{ url: string }>(`/api/admin/whatsapp-list?date=${date}`);
      if (popup) popup.location.href = data.url; else setShareUrl(data.url);
    } catch (err) { popup?.close(); setError(err instanceof Error ? err.message : 'Could not prepare the list.'); }
    finally { setSharing(false); }
  };
  const copyList = async () => {
    setSharing(true);
    try { const data = await api<{ url: string }>(`/api/admin/whatsapp-list?date=${date}`); await navigator.clipboard.writeText(new URL(data.url).searchParams.get('text') || ''); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
    catch { setError('Could not copy automatically. Use the WhatsApp list button instead.'); }
    finally { setSharing(false); }
  };
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); if (!settings) return;
    setSaving(true); setSaved(false); setError(''); setFieldErrors({});
    try {
      const data = await api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(data.settings); setSaved(true); await onMetaRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save settings.'); if (err instanceof ApiError) setFieldErrors(err.fields); }
    finally { setSaving(false); }
  };
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => { setSettings((previous) => previous ? { ...previous, [key]: value } : previous); setSaved(false); setFieldErrors((previous) => ({ ...previous, [key]: '', ...(key === 'opening' || key === 'closing' ? { hours: '' } : {}) })); };

  return <div className="admin-app"><header className="admin-header"><div className="container"><Brand /><span className="admin-header-divider" /><span className="desk-label">OWNER DESK</span><a href="/" className="text-link ml-auto"><ArrowLeft size={16} /> Back to website</a>{workspace === 'real' && <button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={19} /></button>}</div></header>
    <main className="container admin-main">
      {checking ? <div className="admin-loading"><LoaderCircle className="spin" size={28} /> Opening the desk…</div> : workspace === 'login' ? <div className="login-layout"><div className="login-intro"><span className="eyebrow">FOR SANJU BHAIYA & TEAM</span><h1>Good care starts<br />with a good plan.</h1><p>Your bookings, your schedule, your centre.<br />Everything in one place.</p><div className="login-feature"><CalendarDays /><span><strong>A clearer day</strong>See every appointment by date and time.</span></div><div className="login-feature"><MessageCircle /><span><strong>A direct connection</strong>Confirm requests and share your booking list on WhatsApp.</span></div><div className="login-feature"><Settings2 /><span><strong>Your actual schedule</strong>Set shop hours and service durations before going live.</span></div></div>
        <div className="login-card"><span className="login-lock"><LockKeyhole size={27} /></span><h2>Welcome to your desk.</h2><p>Sign in to manage real bookings and shop settings.</p>{error && <div className="error-banner" role="alert"><Info size={18} />{error}</div>}
          {meta.adminEnabled ? <form onSubmit={login}><label className="field-label" htmlFor="owner-password">Owner password</label><input id="owner-password" className="form-input" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your private password" /><button className="button button-dark w-full mt-5" disabled={loggingIn}>{loggingIn ? <><LoaderCircle size={18} className="spin" /> Signing in…</> : <>Open my dashboard <ArrowRight size={18} /></>}</button></form> : <div className="setup-callout"><ShieldCheck size={21} /><div><strong>One-time owner setup</strong><p>Set a private <code>ADMIN_PASSWORD</code> (at least 12 characters) in the server’s <code>.env</code> file, then restart. See <code>SETUP.md</code>. There is no default password.</p></div></div>}
          <div className="login-or"><span />JUST LOOKING AROUND?<span /></div><button className="button button-outline w-full" onClick={() => { setWorkspace('demo'); setError(''); }}>Explore the demo dashboard <ArrowUpRightIcon /></button><small className="login-footnote">Demo bookings are fictional and separate from real appointments.</small>
        </div></div> : <>
        <div className="admin-title-row"><div><span className="eyebrow">{isDemo ? 'TAKE A LOOK AROUND' : 'LET’S MAKE TODAY A GOOD DAY'}</span><h1>{isDemo ? 'The demo desk.' : 'Your centre, at a glance.'}</h1></div><span className={`workspace-badge ${isDemo ? 'workspace-demo' : ''}`}><span />{isDemo ? 'DEMO WORKSPACE' : meta.live ? 'BOOKINGS LIVE' : 'BOOKINGS PAUSED'}</span></div>
        {isDemo && <div className="admin-demo-banner"><Info size={19} /><p><strong>Fictional bookings. Real feel.</strong> Try the controls and create a preview from the website. No messages are sent to the shop. Actual hours and durations still need owner setup.</p><button className="text-button" onClick={() => { setWorkspace('login'); setError(''); }}>Owner sign in <ArrowRight size={15} /></button></div>}
        <div className="admin-tabs"><button className={tab === 'bookings' ? 'active' : ''} onClick={() => { setTab('bookings'); setError(''); setSaved(false); }}><CalendarDays size={18} /> Bookings</button><button className={tab === 'settings' ? 'active' : ''} onClick={() => { setTab('settings'); setError(''); setSaved(false); }}><Settings2 size={18} /> Shop settings</button><span><ShieldCheck size={14} /> {isDemo ? 'Sandbox only' : 'Private owner access'}</span></div>
        {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span><button className="icon-button ml-auto" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {tab === 'bookings' ? <>
          <div className="admin-date-toolbar"><div className="date-navigation"><button className="icon-button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={19} /></button><label><CalendarDays size={18} /><input type="date" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} aria-label="Booking list date" /></label><button className="icon-button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={19} /></button><button className="today-button" onClick={() => setDate(today())}>Today</button></div><div className="admin-toolbar-actions"><button className="text-button" onClick={() => setRefresh((n) => n + 1)} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>{!isDemo && <><a className="button button-small button-outline" href={`/api/admin/export?date=${date}&format=csv`}><Download size={15} /> CSV</a><a className="button button-small button-outline" href={`/api/admin/export?date=${date}&format=ics`}><CalendarDays size={15} /> Calendar</a><button className="button button-small button-dark" onClick={shareList} disabled={sharing}><WhatsAppIcon size={16} /> WhatsApp list</button></>}</div></div>
          {shareUrl && <div className="info-banner">Your browser blocked the new tab. <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-link">Open the WhatsApp list <ArrowRight size={15} /></a></div>}
          <div className="stats-grid"><div><span><CalendarDays size={19} /> Active bookings</span><strong>{day?.stats.total ?? '—'}</strong><small>{formatDate(date, { day: 'numeric', month: 'long' })}</small></div><div><span><Clock3 size={19} /> Awaiting confirmation</span><strong>{day?.stats.pending ?? '—'}</strong><small>Check WhatsApp requests</small></div><div><span><CheckCircle2 size={19} /> Completed</span><strong>{day?.stats.completed ?? '—'}</strong><small>{day?.stats.confirmed ?? 0} still to come</small></div><div><span><IndianRupee size={19} /> Confirmed value</span><strong>{day ? money(day.stats.expectedRevenue) : '—'}</strong><small>Not a record of payments received</small></div></div>
          <div className="booking-list-panel"><div className="list-heading"><div><h2>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{isDemo ? 'Sample schedule · 9 AM–7 PM · one vehicle at a time' : 'All appointments in India Standard Time (IST)'}</p></div><span className="list-count">{day?.bookings.length || 0} records</span></div>
            {loading && !day ? <div className="admin-loading"><LoaderCircle size={24} className="spin" /> Loading the day…</div> : day?.bookings.length ? <div className="booking-records">{day.bookings.map((booking) => <article key={booking.id} className={`booking-record ${booking.status === 'cancelled' ? 'record-cancelled' : ''}`}>
              <div className="record-time"><strong>{formatTime(booking.time)}</strong><span>until {formatTime(booking.endTime)}</span><small>{booking.minutes} min</small></div>
              <div className="record-customer"><strong>{booking.name}</strong>{booking.phone ? <a href={`tel:${booking.phone}`}>{booking.phone}</a> : <span className="muted">Fictional customer</span>}<span>{booking.vehicle}</span>{booking.note && <small>{booking.note}</small>}</div>
              <div className="record-service"><strong>{booking.serviceName}</strong><span>{money(booking.price)} · pay at centre</span><small>{booking.reference}</small></div>
              <div className="record-status"><StatusBadge status={booking.status} /><div className="record-actions">{booking.status === 'awaiting_whatsapp' && <button className="mini-action confirm-action" disabled={busyId === booking.id} onClick={() => changeStatus(booking.id, 'confirmed')}><Check size={14} /> Confirm</button>}{booking.status === 'confirmed' && <button className="mini-action" disabled={busyId === booking.id} onClick={() => changeStatus(booking.id, 'completed')}><CheckCircle2 size={14} /> Complete</button>}{['awaiting_whatsapp', 'confirmed'].includes(booking.status) && <button className="mini-action cancel-action" disabled={busyId === booking.id} onClick={() => changeStatus(booking.id, 'cancelled')}><X size={14} /> Cancel</button>}{booking.status === 'cancelled' && !isDemo && <button className="mini-action cancel-action" disabled={busyId === booking.id} onClick={() => deleteRecord(booking.id)}><Trash2 size={14} /> Delete details</button>}{booking.phone && booking.status === 'confirmed' && <a className="mini-action" href={`https://wa.me/${booking.phone.slice(1)}?text=${encodeURIComponent(`Namaste ${booking.name}! Your Iconic booking ${booking.reference} for ${booking.serviceName} on ${formatDate(booking.date)} at ${formatTime(booking.time)} is confirmed. See you at the centre!`)}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={14} /> Reply</a>}</div></div>
            </article>)}</div> : <div className="empty-bookings"><CalendarDays size={37} strokeWidth={1.3} /><h3>A little breathing room.</h3><p>No bookings for this date{isDemo ? ' in the demo' : ''}. Try another day{isDemo ? ' or create a preview booking on the website' : ''}.</p><a href="/#book" className="text-link">{isDemo ? 'Try a demo booking' : 'Open booking page'} <ArrowRight size={16} /></a></div>}
          </div>
          <div className="admin-list-footer"><p><Info size={15} /> {isDemo ? 'Demo actions never affect real bookings.' : 'Confirm only after checking the customer’s WhatsApp message. Pending holds expire after 15 minutes.'}</p>{!isDemo && <button className="text-button" onClick={copyList} disabled={sharing}>{saved ? <Check size={15} /> : <MessageCircle size={15} />}{saved ? 'List copied' : 'Copy day list'}</button>}</div>
        </> : isDemo ? <div className="demo-settings-card"><Settings2 size={35} /><h2>Real timings belong to the centre.</h2><p>This demo uses 9 AM–7 PM and example service durations. It is not Sanju bhaiya’s confirmed schedule. Sign in as the owner to enter actual hours, service durations, capacity and weekly offs.</p><div className="demo-duration-list">{meta.services.map((s) => <div key={s.id}><span>{s.name}</span><strong>{s.minutes} min <small>example</small></strong></div>)}</div><button className="button button-dark" onClick={() => setWorkspace('login')}>Owner sign in <LockKeyhole size={17} /></button></div> : settings ? <form className="settings-panel" onSubmit={saveSettings}>
          <div className="settings-heading"><div><h2>Your real-world schedule</h2><p>These settings control live availability. Existing bookings keep their original times and prices.</p></div><span className="settings-private"><LockKeyhole size={15} /> Owner only</span></div>
          {!meta.live && <div className="info-banner"><Info size={18} /><span>Replace any example values below with the centre’s actual timings. Saving with “Accept live bookings” enabled opens real appointments and closes the public demo.</span></div>}
          {Object.values(fieldErrors).some(Boolean) && <div className="error-banner" role="alert"><Info size={18} /><div>{Object.entries(fieldErrors).filter(([, value]) => value).map(([key, value]) => <p key={key}>{value}</p>)}</div></div>}
          <fieldset><legend><Clock3 size={18} /> Working hours</legend><div className="settings-grid"><div className="form-field"><label htmlFor="opening">Opening time (IST)</label><input id="opening" type="time" className="form-input" required value={settings.opening} onChange={(e) => updateSetting('opening', e.target.value)} /></div><div className="form-field"><label htmlFor="closing">Closing time (IST)</label><input id="closing" type="time" className="form-input" required value={settings.closing} onChange={(e) => updateSetting('closing', e.target.value)} /></div><div className="form-field"><label htmlFor="interval">Slot start interval</label><select id="interval" className="form-input" value={settings.slotMinutes} onChange={(e) => updateSetting('slotMinutes', Number(e.target.value))}><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every 60 minutes</option></select></div><div className="form-field"><label htmlFor="capacity">Vehicles at the same time</label><select id="capacity" className="form-input" value={settings.capacity} onChange={(e) => updateSetting('capacity', Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'vehicle — no overlapping bookings' : 'vehicles'}</option>)}</select></div></div><p className="settings-help">Same hours every day. The last start time leaves enough room to finish before closing. Allow at least 15 minutes’ notice.</p></fieldset>
          <fieldset><legend><CalendarDays size={18} /> Weekly offs</legend><div className="weekday-options">{days.map((dayName, index) => <label key={dayName} className={settings.weeklyOff.includes(index) ? 'checked' : ''}><input type="checkbox" checked={settings.weeklyOff.includes(index)} onChange={(e) => updateSetting('weeklyOff', e.target.checked ? [...settings.weeklyOff, index] : settings.weeklyOff.filter((d) => d !== index))} />{dayName.slice(0, 3)}</label>)}</div><p className="settings-help">Checked days are closed. Leave all unchecked if the centre is open every day.</p></fieldset>
          <fieldset><legend><Settings2 size={18} /> Actual service durations</legend><div className="settings-grid durations-grid">{meta.services.map((s) => <div className="form-field" key={s.id}><label htmlFor={`duration-${s.id}`}>{s.name} <span className="muted">{money(s.price)}</span></label><div className="minutes-input"><input id={`duration-${s.id}`} className="form-input" type="number" min={5} max={480} step={1} required value={settings.durations[s.id] || ''} onChange={(e) => updateSetting('durations', { ...settings.durations, [s.id]: Number(e.target.value) })} /><span>minutes</span></div></div>)}</div><p className="settings-help">Ask the team how long each service actually takes. These are blocking times, including preparation and cleanup.</p></fieldset>
          <label className="live-toggle"><input type="checkbox" checked={settings.live} onChange={(e) => updateSetting('live', e.target.checked)} /><span><strong>Accept live bookings</strong><small>I confirm these are the centre’s actual hours and durations. Customers can reserve real slots and send booking requests to {meta.business.displayPhone}.</small></span></label>
          <div className="settings-save"><span role="status">{saved ? <><CheckCircle2 size={18} /> Settings saved successfully</> : <><ShieldCheck size={17} /> No changes are applied until you save.</>}</span><button className="button button-dark" disabled={saving}>{saving ? <><LoaderCircle size={18} className="spin" /> Saving…</> : <>Save shop settings <ArrowRight size={18} /></>}</button></div>
        </form> : <div className="admin-loading"><LoaderCircle className="spin" /> Loading settings…</div>}
      </>}
    </main><footer className="admin-footer container"><span>ICONIC · CARE BEHIND THE SCENES</span><span>{isDemo ? 'Demo data only. No real appointments.' : 'Customer details are private. Share booking lists responsibly.'}</span></footer>
  </div>;
}

function ArrowUpRightIcon() { return <ArrowRight size={18} className="-rotate-45" />; }
