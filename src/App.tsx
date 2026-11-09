import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import type { Meta } from './types';
import { api } from './lib';
import { Brand, PrivacyDialog } from './components/Shared';
import { Site } from './components/Site';
import { Admin } from './components/Admin';

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const isAdmin = window.location.pathname.replace(/\/$/, '') === '/admin';
  const load = useCallback(async () => {
    setError('');
    try { setMeta(await api<Meta>('/api/meta')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the centre. Please try again.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!meta) return <div className="app-loading"><Brand /><div className="loading-card">{error ? <><WifiOff size={29} /><h1>Let’s reconnect.</h1><p role="alert">{error}</p><button className="button button-dark" onClick={load}><RefreshCw size={17} /> Try again</button></> : <><LoaderCircle className="spin" size={27} /><p>Getting your next pit stop ready…</p></>}</div><span>ICONIC CAR WASHING CENTRE</span></div>;
  return <>{isAdmin ? <Admin meta={meta} onMetaRefresh={load} /> : <Site meta={meta} onPrivacy={() => setPrivacy(true)} />}{privacy && <PrivacyDialog phone={meta.business.displayPhone} onClose={() => setPrivacy(false)} />}</>;
}
