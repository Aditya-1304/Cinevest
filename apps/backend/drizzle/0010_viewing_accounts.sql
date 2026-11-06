CREATE TABLE viewing_accounts (
  arc_chain_id text NOT NULL,
  campaign_address text NOT NULL,
  wallet text NOT NULL,
  playback_id text NOT NULL,
  film_hash text NOT NULL,
  price numeric(78, 0) NOT NULL,
  total_blocks integer NOT NULL,
  watched jsonb NOT NULL DEFAULT '[]'::jsonb,
  reserved jsonb NOT NULL DEFAULT '[]'::jsonb,
  unreported jsonb NOT NULL DEFAULT '[]'::jsonb,
  charged_units numeric(78, 0) NOT NULL DEFAULT 0,
  onchain_balance numeric(78, 0) NOT NULL DEFAULT 0,
  onchain_charged numeric(78, 0) NOT NULL DEFAULT 0,
  onchain_sequence integer NOT NULL DEFAULT 0,
  exit_at timestamptz,
  chain_read_at timestamptz NOT NULL DEFAULT now(),
  sequence integer NOT NULL DEFAULT 0,
  final_sequence integer,
  final_until timestamptz,
  session_id uuid,
  lease_until timestamptz,
  position_seconds integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (arc_chain_id, campaign_address, wallet)
);
--> statement-breakpoint
CREATE INDEX viewing_accounts_lease_idx ON viewing_accounts (lease_until);
--> statement-breakpoint
CREATE INDEX viewing_accounts_unsettled_idx ON viewing_accounts (charged_units, onchain_charged);
