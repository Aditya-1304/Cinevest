ALTER TABLE proof_challenges ADD COLUMN context_hash text;
--> statement-breakpoint
ALTER TABLE proof_challenges ADD COLUMN proof_hash text;
--> statement-breakpoint
ALTER TABLE proof_challenges ADD COLUMN arc_chain_id text NOT NULL DEFAULT '5042002';
--> statement-breakpoint
ALTER TABLE proof_challenges ADD COLUMN environment text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
CREATE UNIQUE INDEX proof_challenges_proof_unique ON proof_challenges (proof_hash);
--> statement-breakpoint
ALTER TABLE world_verifications ADD COLUMN arc_chain_id text NOT NULL DEFAULT '5042002';
--> statement-breakpoint
ALTER TABLE world_verifications ADD COLUMN environment text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE world_verifications ADD COLUMN credential_expires_at timestamptz;
--> statement-breakpoint
DROP INDEX world_verifications_campaign_nullifier_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX world_verifications_campaign_nullifier_unique
  ON world_verifications (arc_chain_id, environment, campaign_address, scoped_nullifier_hash);
--> statement-breakpoint
-- Neon HTTP cannot hold an interactive transaction. This function keeps the challenge CAS and
-- immutable identity owner binding in one statement; any rejection rolls both writes back.
CREATE FUNCTION consume_world_proof(
  p_nonce_hash text, p_context_hash text, p_wallet text, p_chain_id text,
  p_campaign text, p_environment text, p_nullifier_hash text, p_proof_hash text,
  p_credential_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE verification_id uuid;
BEGIN
  IF p_credential_expires_at <= clock_timestamp() THEN
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
    RETURNING id INTO verification_id;
  IF verification_id IS NULL THEN RAISE EXCEPTION 'world_identity_conflict'; END IF;
  RETURN verification_id;
END;
$$;
