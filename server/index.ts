import express from 'express'
import multer from 'multer'
import { Pool } from 'pg'

const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://civicpulse:civicpulse@localhost:5432/civicpulse' })
const port = Number(process.env.PORT ?? 3001)
const categories = (text: string) => /metro|train|station|rail/i.test(text) ? 'METRO DELAY' : /power|electric/i.test(text) ? 'POWER CUT' : /pothole|road|flood/i.test(text) ? 'POTHOLE' : /traffic|jam|block/i.test(text) ? 'TRAFFIC' : 'CIVIC ISSUE'
const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, done) => done(null, file.mimetype.startsWith('image/')) })
const row = (incident: Record<string, unknown>) => ({ id: incident.id, category: incident.category, description: incident.description, location: { label: incident.location_label, lat: incident.latitude, lng: incident.longitude }, imageUrl: incident.image_url, reportCount: incident.report_count, firstReported: new Date(String(incident.first_reported)).getTime(), lastReported: new Date(String(incident.last_reported)).getTime() })

app.use(express.json())
app.use('/uploads', express.static('uploads'))

app.get('/api/incidents', async (_request, response, next) => {
  try { response.json((await pool.query('SELECT * FROM incidents WHERE NOT resolved ORDER BY report_count DESC, last_reported DESC')).rows.map(row)) } catch (error) { next(error) }
})

app.post('/api/incidents/report', upload.single('image'), async (request, response, next) => {
  const description = request.body.description
  let location: { label?: unknown; lat?: unknown; lng?: unknown } | undefined
  try { location = JSON.parse(request.body.location) } catch { return response.status(400).json({ error: 'A valid location is required.' }) }
  if (typeof description !== 'string' || !description.trim() || description.length > 240 || !location || typeof location.label !== 'string' || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return response.status(400).json({ error: 'A description and valid location are required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const category = categories(description)
    const existing = await client.query('SELECT * FROM incidents WHERE NOT resolved AND category = $1 AND abs(latitude - $2) < .02 AND abs(longitude - $3) < .02 ORDER BY last_reported DESC LIMIT 1 FOR UPDATE', [category, location.lat, location.lng])
    const imageUrl = request.file ? `/uploads/${request.file.filename}` : null
    const result = existing.rowCount ? await client.query('UPDATE incidents SET report_count = report_count + 1, last_reported = now(), image_url = COALESCE(image_url, $2) WHERE id = $1 RETURNING *', [existing.rows[0].id, imageUrl]) : await client.query('INSERT INTO incidents (category, description, location_label, latitude, longitude, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [category, description.trim(), location.label.slice(0, 100), location.lat, location.lng, imageUrl])
    await client.query('COMMIT')
    response.status(existing.rowCount ? 200 : 201).json(row(result.rows[0]))
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
  app.listen(port, () => console.log(`CivicPulse API listening on http://localhost:${port}`))
}

void start()
