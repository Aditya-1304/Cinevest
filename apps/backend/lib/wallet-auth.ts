import "server-only";
import { verifyMessage } from "viem";
import { isAllowedOrigin } from "./auth/origin";
import { getSession } from "./auth/session";
import { publicationMessage, publicationMessageIsRecent } from "./workflows/publication-request";

/** The SIWE session cookie proves the wallet; the origin guard covers state-changing requests. */
export async function sessionAuthorizes(request: Request, actor: unknown) {
  if (typeof actor !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(actor)) return false;
  if (!isAllowedOrigin(request)) return false;
  const session = await getSession(request);
  return session?.address === actor.toLowerCase();
}

/**
 * Authorizes public artifact/registry operations without granting the server any wallet signing key:
 * either the actor's SIWE session (one sign-in covers many requests) or, for clients without a
 * session, a wallet signature over the canonical request message.
 */
export async function verifyWalletRequest(payload: Record<string, unknown>, request?: Request) {
  const { signature, ...message } = payload;
  if (signature === undefined) return request ? sessionAuthorizes(request, message.actor) : false;
  if (typeof message.actor !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(message.actor) ||
      typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature) || !publicationMessageIsRecent(message.issuedAt)) return false;
  try {
    return await verifyMessage({ address: message.actor as `0x${string}`, message: publicationMessage(message), signature: signature as `0x${string}` });
  } catch { return false; }
}
