import { z } from "zod";
import { playInput, viewingPost } from "@/lib/viewing/http";
import { heartbeat } from "@/lib/viewing/service";

/** Reports playback and renews the session lease; a silent player simply loses its lease. */
export const POST = (request: Request) => viewingPost(request, { sessionId: z.uuid(), ...playInput },
  (key, { sessionId, positionSeconds, played }) => heartbeat(key, sessionId, { positionSeconds, played }));
