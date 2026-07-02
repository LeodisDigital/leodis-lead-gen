-- BCT fundraising campaign context integration.
-- Stores a reference to a BCT admin fundraising campaign and a point-in-time context snapshot.

ALTER TABLE campaigns
  ADD COLUMN bct_fundraising_campaign_id text,
  ADD COLUMN bct_context_snapshot jsonb,
  ADD COLUMN bct_context_retrieved_at timestamptz;
