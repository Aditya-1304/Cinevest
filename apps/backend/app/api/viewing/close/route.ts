import { z } from "zod";
import { playInput, viewingPost } from "@/lib/viewing/http";
import { closeSession } from "@/lib/viewing/service";

/** Ends playback and returns the closing receipt that refunds unused escrow in one transaction. */
export const POST = (request: Request) => viewingPost(request, { sessionId: z.uuid().optional(), ...playInput },
  (key, { sessionId, positionSeconds, played }) => closeSession(key, sessionId, { positionSeconds, played }));
