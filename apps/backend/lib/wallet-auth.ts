import "server-only";
import { verifyMessage } from "viem";
import { publicationMessage, publicationMessageIsRecent } from "./workflows/publication-request";

/** Authorizes public artifact/registry operations without granting the server any wallet signing key. */
export async function verifyWalletRequest(payload: Record<string, unknown>) {
  const { signature, ...message } = payload;
  if (typeof message.actor !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(message.actor) ||
      typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature) || !publicationMessageIsRecent(message.issuedAt)) return false;
  try {
    return await verifyMessage({ address: message.actor as `0x${string}`, message: publicationMessage(message), signature: signature as `0x${string}` });
  } catch { return false; }
}
