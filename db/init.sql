CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  location_label text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  report_count integer NOT NULL DEFAULT 1 CHECK (report_count > 0),
  impact_severity text NOT NULL DEFAULT 'medium',
  first_reported timestamptz NOT NULL DEFAULT now(),
  last_reported timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false
);

CREATE TABLE incident_votes (
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, voter_id)
);

CREATE TABLE incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  location_label text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  rain_related boolean NOT NULL DEFAULT false,
  impact_severity text NOT NULL DEFAULT 'medium',
  reported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO incidents (id, category, description, location_label, latitude, longitude, report_count, first_reported)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'POTHOLE', 'Large pothole causing two-wheelers to swerve near Kaloor Junction.', 'Kaloor Junction', 10.0005, 76.2996, 7, now() - interval '12 days'),
  ('00000000-0000-4000-8000-000000000002', 'METRO DELAY', 'Metro delayed near Aluva station.', 'Aluva Metro', 10.1097, 76.3497, 2, now() - interval '24 minutes'),
  ('00000000-0000-4000-8000-000000000003', 'POWER CUT', 'Power cut around Vyttila mobility hub.', 'Vyttila', 9.9674, 76.3183, 3, now() - interval '3 hours');
