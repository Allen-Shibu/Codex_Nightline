import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Severity = 'reported' | 'confirmed' | 'critical'
type Incident = { id: string; category: string; description: string; location: Location; reportCount: number; firstReported: number; lastReported: number }
type Location = { label: string; lat: number; lng: number }
type LeafletMap = { setView: (position: [number, number], zoom?: number) => LeafletMap; remove: () => void }

declare global { interface Window { L?: any } }

const KEY = 'civicpulse-incidents-v1'
const AREA_KEY = 'civicpulse-area-v1'
const kochi: Location = { label: 'Kochi Metro corridor', lat: 9.9816, lng: 76.2999 }
const seed: Incident[] = [
  { id: 'pothole-kaloor', category: 'POTHOLE', description: 'Large pothole causing two-wheelers to swerve near Kaloor Junction.', location: { label: 'Kaloor Junction', lat: 10.0005, lng: 76.2996 }, reportCount: 7, firstReported: Date.now() - 1_036_800_000, lastReported: Date.now() },
  { id: 'delay-aluva', category: 'METRO DELAY', description: 'Metro delayed near Aluva station.', location: { label: 'Aluva Metro', lat: 10.1097, lng: 76.3497 }, reportCount: 2, firstReported: Date.now() - 1_440_000, lastReported: Date.now() },
  { id: 'power-vyttila', category: 'POWER CUT', description: 'Power cut around Vyttila mobility hub.', location: { label: 'Vyttila', lat: 9.9674, lng: 76.3183 }, reportCount: 3, firstReported: Date.now() - 10_800_000, lastReported: Date.now() },
]

const severity = (count: number): Severity => count >= 6 ? 'critical' : count >= 3 ? 'confirmed' : 'reported'
const age = (time: number) => { const days = Math.floor((Date.now() - time) / 86_400_000); return days ? `open ${days} day${days === 1 ? '' : 's'}` : 'reported today' }
const category = (text: string) => /metro|train|station|rail/i.test(text) ? 'METRO DELAY' : /power|electric/i.test(text) ? 'POWER CUT' : /pothole|road|flood/i.test(text) ? 'POTHOLE' : /traffic|jam|block/i.test(text) ? 'TRAFFIC' : 'CIVIC ISSUE'
const readIncidents = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Incident[] | null ?? seed
const readArea = () => JSON.parse(localStorage.getItem(AREA_KEY) ?? 'null') as Location | null ?? kochi

function Map({ incidents, area, onSelect }: { incidents: Incident[]; area: Location; onSelect: (id: string) => void }) {
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<{ clearLayers: () => void; addLayer: (marker: unknown) => void } | null>(null)
  useEffect(() => { if (!window.L || map.current) return; map.current = window.L.map('map', { zoomControl: false }).setView([area.lat, area.lng], 12); window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map.current); layer.current = window.L.layerGroup().addTo(map.current) }, [])
  useEffect(() => { if (!window.L || !map.current || !layer.current) return; map.current.setView([area.lat, area.lng]); layer.current.clearLayers(); incidents.forEach(incident => { const marker = window.L!.marker([incident.location.lat, incident.location.lng], { icon: window.L!.divIcon({ className: '', html: `<div class="marker ${severity(incident.reportCount)}"></div>`, iconSize: [35, 35], iconAnchor: [17, 17] }) }).addTo(layer.current!); marker.bindPopup(`<b>${incident.category}</b><br>${incident.description}`).on('click', () => onSelect(incident.id)) }) }, [incidents, area, onSelect])
  return <div id="map">{!window.L && <p className="map-error">Map tiles are unavailable. Your reports still work.</p>}</div>
}

function letterFor(incident: Incident) { const authority = incident.category === 'METRO DELAY' ? 'Kochi Metro Rail Limited' : incident.category === 'POWER CUT' ? 'Kerala State Electricity Board' : 'Kochi Municipal Corporation'; return `To: ${authority}\n\nSubject: Request to address ${incident.category.toLowerCase()} at ${incident.location.label}\n\nDear Sir/Madam,\n\nI am writing to report ${incident.description} This issue has been ${age(incident.firstReported)} and has received ${incident.reportCount} community reports. I request that it be inspected and addressed at the earliest.\n\nSincerely,\nA concerned commuter` }

function App() {
  const [incidents, setIncidents] = useState(readIncidents)
  const [area, setArea] = useState(readArea)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Incident | null>(null)
  const [letter, setLetter] = useState<Incident | null>(null)
  const open = useMemo(() => [...incidents].sort((a, b) => b.reportCount - a.reportCount), [incidents])
  const update = (next: Incident[]) => { localStorage.setItem(KEY, JSON.stringify(next)); setIncidents(next) }
  useEffect(() => { const sync = (event: StorageEvent) => { if (event.key === KEY) setIncidents(readIncidents()); if (event.key === AREA_KEY) setArea(readArea()) }; addEventListener('storage', sync); return () => removeEventListener('storage', sync) }, [])
  useEffect(() => { navigator.geolocation?.getCurrentPosition(position => { const next = { label: 'Your current area', lat: position.coords.latitude, lng: position.coords.longitude }; localStorage.setItem(AREA_KEY, JSON.stringify(next)); setArea(next) }, undefined, { timeout: 5000 }) }, [])
  const submit = (event: FormEvent) => { event.preventDefault(); const report = text.trim(); if (!report) return; const type = category(report); const same = incidents.find(incident => incident.category === type && type !== 'CIVIC ISSUE'); const next = same ? incidents.map(incident => incident.id === same.id ? { ...incident, reportCount: incident.reportCount + 1, lastReported: Date.now() } : incident) : [...incidents, { id: `report-${Date.now()}`, category: type, description: report, location: { label: area.label, lat: area.lat + .006, lng: area.lng - .006 }, reportCount: 1, firstReported: Date.now(), lastReported: Date.now() }]; update(next); setText('') }
  const changeArea = () => { const label = prompt('Your area in Kochi:', area.label); if (!label) return; const next = { ...kochi, label }; localStorage.setItem(AREA_KEY, JSON.stringify(next)); setArea(next) }
  const critical = open.filter(incident => severity(incident.reportCount) === 'critical').length
  return <>
    <header><h1>Civic<span>Pulse</span></h1><span className="tag">Kochi civic board</span></header>
    <main>
      <p className="notice">Proof of concept — reports sync between this browser’s tabs, not civic authorities.</p>
      <p className="pulse">{critical ? `${critical} critical issue${critical > 1 ? 's' : ''} need attention; ${open.length - critical} other live reports nearby.` : `${open.length} live community reports across Kochi.`}</p>
      <p className="prediction"><b>Predictive warning</b><br />Heavy rain expected — Kaloor has flooded in 4 of the last 5 similar days.</p>
      <Map incidents={open} area={area} onSelect={id => setSelected(incidents.find(incident => incident.id === id) ?? null)} />
      <form onSubmit={submit}><input value={text} onChange={event => setText(event.target.value)} maxLength={240} placeholder="What’s happening? e.g. Metro stuck near Kaloor" aria-label="Describe a civic issue" /><button>Report</button><button type="button" className="secondary" onClick={changeArea}>Change area</button></form>
      <div className="section-title"><h2>Open incidents</h2><span className="meta">{area.label}</span></div>
      <section>{open.map(incident => <article className="card incident" key={incident.id} onClick={() => setSelected(incident)}><span className={`dot ${severity(incident.reportCount)}`} /><div><h3>{incident.category} · {incident.location.label}</h3><p>{incident.description}</p><p className="meta">{age(incident.firstReported)} · {severity(incident.reportCount)}</p></div><span className="count">{'│'.repeat(Math.min(incident.reportCount, 8))} {incident.reportCount}</span></article>)}</section>
    </main>
    {selected && <div className="backdrop"><section className="modal"><p className="tag">{severity(selected.reportCount)} · {age(selected.firstReported)}</p><h2>{selected.category}</h2><p>{selected.description}</p><p className="meta">{selected.location.label} · {selected.reportCount} community confirmations</p><div className="actions">{severity(selected.reportCount) === 'critical' && <button onClick={() => setLetter(selected)}>View draft letter</button>}<button className="secondary" onClick={() => setSelected(null)}>Close</button></div></section></div>}
    {letter && <div className="backdrop"><section className="modal"><h2>Draft complaint</h2><pre>{letterFor(letter)}</pre><div className="actions"><button className="secondary" onClick={() => setLetter(null)}>Close</button><button onClick={() => navigator.clipboard.writeText(letterFor(letter))}>Copy letter</button></div></section></div>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
