WITH demo AS (
  INSERT INTO incidents (category, description, location_label, latitude, longitude, report_count, impact_severity, analysis_confidence, first_reported, last_reported)
  VALUES ('POTHOLE', 'Large pothole near Kaloor Metro station is forcing vehicles into the adjacent lane.', 'Kaloor Metro station', 9.9947, 76.2926, 16, 'high', 95, now() - interval '9 days', now())
  RETURNING id
)
INSERT INTO incident_reports (incident_id, category, description, location_label, latitude, longitude, impact_severity)
SELECT demo.id, 'POTHOLE', 'Large pothole near Kaloor Metro station is forcing vehicles into the adjacent lane.', 'Kaloor Metro station', 9.9947, 76.2926, 'high'
FROM demo, generate_series(1, 16);
