-- Prevent overlapping scheduled invocations from sending the same broadcast delivery twice.
-- The delivery remains `pending` while it is leased, so the existing status constraint remains intact.
ALTER TABLE broadcast_deliveries ADD COLUMN claim_token TEXT;
ALTER TABLE broadcast_deliveries ADD COLUMN lease_until TEXT;

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_claim
  ON broadcast_deliveries(campaign_id, status, lease_until, updated_at);
