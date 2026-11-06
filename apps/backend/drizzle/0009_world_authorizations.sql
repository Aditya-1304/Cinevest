ALTER TABLE proof_challenges ADD COLUMN verification_id uuid REFERENCES world_verifications(id);
--> statement-breakpoint
ALTER TABLE proof_challenges ADD COLUMN credential_expires_at timestamptz;
--> statement-breakpoint
CREATE TABLE world_authorizations (
  challenge_nonce_hash text PRIMARY KEY REFERENCES proof_challenges(nonce_hash),
  digest text NOT NULL,
  nonce text NOT NULL,
  signer text NOT NULL,
  deadline timestamptz NOT NULL,
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX world_authorizations_digest_unique ON world_authorizations (digest);
--> statement-breakpoint
CREATE UNIQUE INDEX world_authorizations_nonce_unique ON world_authorizations (nonce);
--> statement-breakpoint
-- Preserve a challenge-specific credential bound; a later proof must not extend an older challenge.
CREATE OR REPLACE FUNCTION consume_world_proof(
  p_nonce_hash text, p_context_hash text, p_wallet text, p_chain_id text,
  p_campaign text, p_environment text, p_nullifier_hash text, p_proof_hash text,
  p_credential_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_verification_id uuid;
BEGIN
  IF p_credential_expires_at IS NULL OR p_credential_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'world_credential_expired';
  END IF;
  UPDATE proof_challenges SET consumed_at = clock_timestamp(), proof_hash = p_proof_hash
    WHERE nonce_hash = p_nonce_hash AND context_hash = p_context_hash
      AND wallet = p_wallet AND arc_chain_id = p_chain_id
      AND campaign_address = p_campaign AND environment = p_environment
      AND consumed_at IS NULL AND expires_at > clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'world_challenge_unavailable'; END IF;
  INSERT INTO world_verifications
    (arc_chain_id, environment, campaign_address, scoped_nullifier_hash, wallet, credential_expires_at)
    VALUES (p_chain_id, p_environment, p_campaign, p_nullifier_hash, p_wallet, p_credential_expires_at)
    ON CONFLICT (arc_chain_id, environment, campaign_address, scoped_nullifier_hash)
    DO UPDATE SET verified_at = clock_timestamp(), credential_expires_at = EXCLUDED.credential_expires_at
      WHERE world_verifications.wallet = EXCLUDED.wallet
    RETURNING id INTO v_verification_id;
  IF v_verification_id IS NULL THEN RAISE EXCEPTION 'world_identity_conflict'; END IF;
  UPDATE proof_challenges SET verification_id = v_verification_id, credential_expires_at = p_credential_expires_at
    WHERE nonce_hash = p_nonce_hash;
  RETURN v_verification_id;
END;
$$;
