import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Severity = 'reported' | 'confirmed' | 'critical'
type Incident = { id: string; category: string; description: string; location: Location; imageUrl?: string | null; reportCount: number; firstReported: number; lastReported: number }
type Location = { label: string; lat: number; lng: number }
type LeafletMap = { setView: (position: [number, number], zoom?: number) => LeafletMap; remove: () => void }

declare global { interface Window { L?: any } }

const AREA_KEY = 'civicpulse-area-v1'
const kochi: Location = { label: 'Kochi Metro corridor', lat: 9.9816, lng: 76.2999 }

const severity = (count: number): Severity => count >= 6 ? 'critical' : count >= 3 ? 'confirmed' : 'reported'
const age = (time: number) => { const days = Math.floor((Date.now() - time) / 86_400_000); return days ? `open ${days} day${days === 1 ? '' : 's'}` : 'reported today' }
const readArea = () => { try { return JSON.parse(localStorage.getItem(AREA_KEY) ?? 'null') as Location | null ?? kochi } catch { localStorage.removeItem(AREA_KEY); return kochi } }
const voterId = () => localStorage.getItem('civicpulse-voter-id') ?? (() => { const id = crypto.randomUUID(); localStorage.setItem('civicpulse-voter-id', id); return id })()

function Map({ incidents, area, onSelect }: { incidents: Incident[]; area: Location; onSelect: (id: string) => void }) {
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<{ clearLayers: () => void; addLayer: (marker: unknown) => void } | null>(null)
  useEffect(() => { if (!window.L || map.current) return; map.current = window.L.map('map', { zoomControl: false }).setView([area.lat, area.lng], 12); window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map.current); layer.current = window.L.layerGroup().addTo(map.current) }, [])
  useEffect(() => { if (!window.L || !map.current || !layer.current) return; map.current.setView([area.lat, area.lng]); layer.current.clearLayers(); incidents.forEach(incident => { const marker = window.L!.marker([incident.location.lat, incident.location.lng], { icon: window.L!.divIcon({ className: '', html: `<div class="marker ${severity(incident.reportCount)}"></div>`, iconSize: [35, 35], iconAnchor: [17, 17] }) }).addTo(layer.current!); marker.bindPopup(`<b>${incident.category}</b><br>${incident.description}`).on('click', () => onSelect(incident.id)) }) }, [incidents, area, onSelect])
  return <div className="map-shell"><div id="map">{!window.L && <p className="map-error">Map tiles are unavailable. Your reports still work.</p>}</div><div className="map-hud"><span className="live-dot" /> Live incident map · {incidents.length} open</div><div className="legend"><span><i className="reported" />Reported</span><span><i className="confirmed" />Confirmed</span><span><i className="critical" />Critical</span></div></div>
}

function letterFor(incident: Incident) { const authority = incident.category === 'METRO DELAY' ? 'Kochi Metro Rail Limited' : incident.category === 'POWER CUT' ? 'Kerala State Electricity Board' : 'Kochi Municipal Corporation'; return `To: ${authority}\n\nSubject: Request to address ${incident.category.toLowerCase()} at ${incident.location.label}\n\nDear Sir/Madam,\n\nI am writing to report ${incident.description} This issue has been ${age(incident.firstReported)} and has received ${incident.reportCount} community reports. I request that it be inspected and addressed at the earliest.\n\nSincerely,\nA concerned commuter` }

function App() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [area, setArea] = useState(readArea)
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Incident | null>(null)
  const [letter, setLetter] = useState<Incident | null>(null)
  const open = useMemo(() => [...incidents].sort((a, b) => b.reportCount - a.reportCount), [incidents])
  const load = async () => { try { const response = await fetch('/api/incidents'); if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return setApiError('Live data is unavailable. Start the CivicPulse API to load reports.'); setIncidents(await response.json() as Incident[]); setApiError(null) } catch { setApiError('Live data is unavailable. Start the CivicPulse API to load reports.') } }
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 5_000); return () => clearInterval(timer) }, [])
  useEffect(() => { navigator.geolocation?.getCurrentPosition(position => { const next = { label: 'Your current area', lat: position.coords.latitude, lng: position.coords.longitude }; localStorage.setItem(AREA_KEY, JSON.stringify(next)); setArea(next) }, undefined, { timeout: 5000 }) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); const description = text.trim(); if (!description) return; const body = new FormData(); body.append('description', description); body.append('location', JSON.stringify(area)); if (image) body.append('image', image); const response = await fetch('/api/incidents/report', { method: 'POST', body }); if (response.ok) { setText(''); setImage(null); await load() } }
  const upvote = async (incident: Incident) => { const response = await fetch(`/api/incidents/${incident.id}/upvotes`, { method: 'POST', headers: { 'x-voter-id': voterId() } }); if (response.ok) { const result = await response.json() as { incident: Incident }; setIncidents(current => current.map(item => item.id === incident.id ? result.incident : item)); setSelected(result.incident) } }
  const changeArea = () => { const label = prompt('Your area in Kochi:', area.label); if (!label) return; const next = { ...kochi, label }; localStorage.setItem(AREA_KEY, JSON.stringify(next)); setArea(next) }
  const critical = open.filter(incident => severity(incident.reportCount) === 'critical').length
  const confirmations = open.reduce((total, incident) => total + incident.reportCount, 0)
  return <>
    <header><div><h1>Civic<span>Pulse</span></h1><p>Community-powered civic intelligence</p></div><span className="tag"><i className="live-dot" /> Kochi civic board</span></header>
    <main className="dashboard">
      <aside className="sidebar">
        <p className="notice"><b>How it works</b><br />Report once, confirm together. Critical issues become impossible to ignore.</p>
        {apiError && <p className="api-error">{apiError}</p>}
        <p className="pulse">{critical ? `${critical} critical issue${critical > 1 ? 's' : ''} need attention; ${open.length - critical} other live reports nearby.` : `${open.length} live community reports across Kochi.`}</p>
        <p className="prediction"><b>Predictive warning</b><br />Heavy rain expected — Kaloor has flooded in 4 of the last 5 similar days.</p>
        <section className="stats"><div><b>{open.length}</b><span>Open now</span></div><div><b>{critical}</b><span>Critical</span></div><div><b>{confirmations}</b><span>Reports</span></div></section>
        <section className="composer"><div className="section-title"><h2>Report an issue</h2><span>Near {area.label}</span></div><form onSubmit={submit}><input value={text} onChange={event => setText(event.target.value)} maxLength={240} placeholder="What's happening? e.g. Metro stuck near Kaloor" aria-label="Describe a civic issue" /><label className="upload">⌁ {image ? image.name : 'Add a photo (optional)'}<input type="file" accept="image/*" onChange={event => setImage(event.target.files?.[0] ?? null)} /></label><button>Submit report</button><button type="button" className="secondary" onClick={changeArea}>Change area</button></form></section>
        <div className="section-title"><h2>Open incidents</h2><span className="meta">Live updates</span></div>
        <section className="feed">{open.length ? open.map(incident => <article className="card incident" key={incident.id} onClick={() => setSelected(incident)}><span className={`dot ${severity(incident.reportCount)}`} /><div><h3>{incident.category} · {incident.location.label}</h3><p>{incident.description}</p>{incident.imageUrl && <img className="incident-image" src={incident.imageUrl} alt="Report evidence" />}<p className="meta">{age(incident.firstReported)} · {severity(incident.reportCount)}</p></div><span className="count">{'│'.repeat(Math.min(incident.reportCount, 8))} {incident.reportCount}</span></article>) : <div className="empty"><b>No reports yet</b><span>Be the first commuter to report an issue nearby.</span></div>}</section>
      </aside>
      <section className="map-panel"><Map incidents={open} area={area} onSelect={id => setSelected(incidents.find(incident => incident.id === id) ?? null)} /></section>
    </main>
    {selected && <div className="backdrop"><section className="modal"><p className="tag">{severity(selected.reportCount)} · {age(selected.firstReported)}</p><h2>{selected.category}</h2><p>{selected.description}</p>{selected.imageUrl && <img className="modal-image" src={selected.imageUrl} alt="Report evidence" />}<p className="meta">{selected.location.label} · {selected.reportCount} community confirmations</p><div className="actions"><button onClick={() => void upvote(selected)}>Confirm issue</button>{severity(selected.reportCount) === 'critical' && <button onClick={() => setLetter(selected)}>View draft letter</button>}<button className="secondary" onClick={() => setSelected(null)}>Close</button></div></section></div>}
    {letter && <div className="backdrop"><section className="modal"><h2>Draft complaint</h2><pre>{letterFor(letter)}</pre><div className="actions"><button className="secondary" onClick={() => setLetter(null)}>Close</button><button onClick={() => navigator.clipboard.writeText(letterFor(letter))}>Copy letter</button></div></section></div>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
