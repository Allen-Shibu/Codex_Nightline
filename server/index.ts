import express from 'express'
import multer from 'multer'
import { Pool } from 'pg'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://civicpulse:civicpulse@localhost:5432/civicpulse' })
const port = Number(process.env.PORT ?? 3001)
const categories = (text: string) => /metro/i.test(text) ? 'METRO DELAY' : /train|railway|rail(?:\s|$)/i.test(text) ? 'TRAIN DELAY' : /flood|waterlog|overflow/i.test(text) ? 'FLOODING' : /power|electric/i.test(text) ? 'POWER CUT' : /pothole|road/i.test(text) ? 'POTHOLE' : /traffic|jam|block/i.test(text) ? 'TRAFFIC' : 'CIVIC ISSUE'
const rainRelated = (text: string) => /rain|flood|waterlog|overflow|drain/i.test(text)
const impactFrom = (text: string) => /fire|electrocut|collapse|trapped|injur|accident|life.threat/i.test(text) ? 'critical' : /flood|power cut|road block|stuck|stranded|major/i.test(text) ? 'high' : /delay|pothole|traffic|waterlog/i.test(text) ? 'medium' : 'low'
const communitySeverity = (count: number) => count >= 6 ? 'critical' : count >= 3 ? 'confirmed' : 'reported'
const upload = multer({ storage: multer.diskStorage({ destination: 'uploads/', filename: (_request, file, done) => done(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, done) => done(null, file.mimetype.startsWith('image/')) })
const row = (incident: Record<string, unknown>) => ({ id: incident.id, category: incident.category, description: incident.description, location: { label: incident.location_label, lat: incident.latitude, lng: incident.longitude }, imageUrl: incident.image_url, impactSeverity: incident.impact_severity, analysisConfidence: Number(incident.analysis_confidence ?? 0), reportCount: incident.report_count, firstReported: new Date(String(incident.first_reported)).getTime(), lastReported: new Date(String(incident.last_reported)).getTime() })

async function aiMatch(description: string, location: { label: string; lat: number; lng: number }, candidates: Record<string, unknown>[]) {
  if (!process.env.OPENAI_API_KEY || !candidates.length) return null
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Match civic reports only when they describe the same real-world event at the same station, road, or corridor. Do not merge merely because categories are alike. Kochi has both Kochi Metro and conventional Indian Railways trains: a report saying "train delayed" is not a metro delay unless it explicitly says metro; if the transport mode is ambiguous, return a new incident. Require both the transport mode and the named location/corridor to agree. Classify impact severity: low for minor inconvenience, medium for a normal disruption, high for a serious public disruption such as flooding or power loss, critical only for immediate danger to life or access.' },
        { role: 'user', content: JSON.stringify({ new_report: { description, location }, open_incidents: candidates.map(item => ({ id: item.id, category: item.category, description: item.description, location: { label: item.location_label, latitude: item.latitude, longitude: item.longitude } })) }) }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'incident_match', strict: true, schema: { type: 'object', properties: { match_id: { anyOf: [{ type: 'string' }, { type: 'null' }] }, category: { type: 'string' }, impact_severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, match_confidence: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['match_id', 'category', 'impact_severity', 'match_confidence'], additionalProperties: false } } }
    })
  })
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
  const result = await response.json() as { choices?: { message?: { content?: string } }[] }
  const decision = JSON.parse(result.choices?.[0]?.message?.content ?? '{}') as { match_id?: string | null; category?: string; impact_severity?: string; match_confidence?: number }
  return { matchId: candidates.some(item => item.id === decision.match_id) ? decision.match_id ?? null : null, category: typeof decision.category === 'string' && decision.category.length <= 50 ? decision.category : categories(description), impactSeverity: ['low', 'medium', 'high', 'critical'].includes(decision.impact_severity ?? '') ? decision.impact_severity! : impactFrom(description), matchConfidence: Number.isInteger(decision.match_confidence) ? decision.match_confidence! : 0 }
}

app.use(express.json())
app.use('/uploads', express.static('uploads'))

app.get('/api/incidents', async (_request, response, next) => {
  try { response.json((await pool.query('SELECT * FROM incidents WHERE NOT resolved ORDER BY report_count DESC, last_reported DESC')).rows.map(row)) } catch (error) { next(error) }
})

app.get('/api/predictions', async (_request, response, next) => {
  try {
    const result = await pool.query(`
      WITH rain_events AS (
        SELECT *, floor(latitude * 200) / 200 AS lat_cell, floor(longitude * 200) / 200 AS lng_cell
        FROM incident_reports
        WHERE rain_related AND reported_at > now() - interval '365 days'
      )
      SELECT min(location_label) AS location_label,
             count(DISTINCT reported_at::date) FILTER (WHERE category = 'FLOODING')::int AS flood_days,
             count(DISTINCT reported_at::date)::int AS rain_days
      FROM rain_events
      GROUP BY lat_cell, lng_cell
      HAVING count(DISTINCT reported_at::date) FILTER (WHERE category = 'FLOODING') >= 3
         AND count(*) FILTER (WHERE reported_at > now() - interval '6 hours') > 0
      ORDER BY flood_days DESC
      LIMIT 1
    `)
    response.json(result.rows.map(item => ({ location: item.location_label, floodDays: item.flood_days, rainDays: item.rain_days })))
  } catch (error) { next(error) }
})

app.post('/api/incidents/report', upload.single('image'), async (request, response, next) => {
  const description = request.body.description
  let location: { label?: unknown; lat?: unknown; lng?: unknown } | undefined
  try { location = JSON.parse(request.body.location) } catch { return response.status(400).json({ error: 'A valid location is required.' }) }
  if (typeof description !== 'string' || !description.trim() || description.length > 240 || !location || typeof location.label !== 'string' || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return response.status(400).json({ error: 'A description and valid location are required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const nearby = await client.query('SELECT * FROM incidents WHERE NOT resolved AND abs(latitude - $1) < .03 AND abs(longitude - $2) < .03 ORDER BY last_reported DESC LIMIT 30 FOR UPDATE', [location.lat, location.lng])
    let decision: { matchId: string | null; category: string; impactSeverity: string; matchConfidence: number } | null = null
    try { decision = await aiMatch(description, location as { label: string; lat: number; lng: number }, nearby.rows) } catch (error) { console.warn(error) }
    const category = decision?.category ?? categories(description)
    const impactSeverity = decision?.impactSeverity ?? impactFrom(description)
    const match = decision?.matchId ? nearby.rows.find(item => item.id === decision.matchId) : !process.env.OPENAI_API_KEY ? nearby.rows.find(item => item.category === category) : undefined
    const existing = match ? { rowCount: 1, rows: [match] } : { rowCount: 0, rows: [] }
    const previousCount = Number(match?.report_count ?? 0)
    const previousSeverity = communitySeverity(previousCount)
    const imageUrl = request.file ? `/uploads/${request.file.filename}` : null
    const confidence = decision?.matchConfidence ?? 0
    const result = existing.rowCount ? await client.query("UPDATE incidents SET report_count = report_count + 1, last_reported = now(), image_url = COALESCE(image_url, $2), analysis_confidence = GREATEST(analysis_confidence, $3), impact_severity = CASE WHEN array_position(ARRAY['low','medium','high','critical'], impact_severity) >= array_position(ARRAY['low','medium','high','critical'], $4) THEN impact_severity ELSE $4 END WHERE id = $1 RETURNING *", [existing.rows[0].id, imageUrl, confidence, impactSeverity]) : await client.query('INSERT INTO incidents (category, description, location_label, latitude, longitude, image_url, impact_severity, analysis_confidence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [category, description.trim(), location.label.slice(0, 100), location.lat, location.lng, imageUrl, impactSeverity, confidence])
    await client.query('INSERT INTO incident_reports (incident_id, category, description, location_label, latitude, longitude, rain_related, impact_severity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [result.rows[0].id, category, description.trim(), location.label.slice(0, 100), location.lat, location.lng, rainRelated(description), impactSeverity])
    await client.query('COMMIT')
    const incident = row(result.rows[0])
    response.status(existing.rowCount ? 200 : 201).json({ incident, analysis: { candidateCount: nearby.rowCount ?? 0, matched: Boolean(match), matchId: match?.id ?? null, matchDescription: match?.description ?? null, matchConfidence: match ? (decision?.matchConfidence ?? 80) : 0, previousCount, previousSeverity, currentSeverity: communitySeverity(Number(incident.reportCount)), location: incident.location, category: incident.category, impactSeverity: incident.impactSeverity } })
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

app.post('/api/incidents/:id/upvotes', async (request, response, next) => {
  const voterId = request.header('x-voter-id')
  if (!voterId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voterId)) return response.status(400).json({ error: 'A valid voter id is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM incidents WHERE id = $1 FOR UPDATE', [request.params.id])
    if (!existing.rowCount) { await client.query('ROLLBACK'); return response.status(404).json({ error: 'Incident not found.' }) }
    const vote = await client.query('INSERT INTO incident_votes (incident_id, voter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING incident_id', [request.params.id, voterId])
    const result = vote.rowCount ? await client.query('UPDATE incidents SET report_count = report_count + 1, last_reported = now() WHERE id = $1 RETURNING *', [request.params.id]) : await client.query('SELECT * FROM incidents WHERE id = $1', [request.params.id])
    await client.query('COMMIT')
    response.json({ incident: row(result.rows[0]), added: Boolean(vote.rowCount) })
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error(error); response.status(500).json({ error: 'Database request failed.' }) })

async function start() {
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS image_url text')
  await pool.query("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS impact_severity text NOT NULL DEFAULT 'medium'")
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS analysis_confidence integer NOT NULL DEFAULT 0')
  await pool.query("CREATE TABLE IF NOT EXISTS incident_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL, category text NOT NULL, description text NOT NULL, location_label text NOT NULL, latitude double precision NOT NULL, longitude double precision NOT NULL, rain_related boolean NOT NULL DEFAULT false, impact_severity text NOT NULL DEFAULT 'medium', reported_at timestamptz NOT NULL DEFAULT now())")
  await pool.query("ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS impact_severity text NOT NULL DEFAULT 'medium'")
  app.listen(port, () => console.log(`CivicPulse API listening on http://localhost:${port}`))
}

void start()
