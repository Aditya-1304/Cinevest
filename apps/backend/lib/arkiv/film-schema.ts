import { addr, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

export const filmSchema = defineSchema("clipstake.film.v1", {
  arcChainId: u64(),
  campaignAddress: addr().indexed(),
  creatorAddress: addr().indexed(),
  genre: str().indexed(),
  fundingDeadline: u64().indexed(),
  title: str(),
  pitchSwarmRef: str(),
  posterSwarmRef: str(),
  termsDigest: str(),
  operationDigest: str().optional(),
  createdAt: u64(),
  schemaVersion: u64(),
});
