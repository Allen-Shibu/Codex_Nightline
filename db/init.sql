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
  analysis_confidence integer NOT NULL DEFAULT 0,
  resolution_status text NOT NULL DEFAULT 'open',
  resolution_proposed_at timestamptz,
  resolved_at timestamptz,
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

CREATE TABLE incident_resolutions (
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  note text,
  image_url text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, voter_id)
);
