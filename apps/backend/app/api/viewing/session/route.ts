import { viewingPost } from "@/lib/viewing/http";
import { startSession } from "@/lib/viewing/service";

/** Opens the wallet's single metered session; the client then plays the gateway manifest for it. */
export const POST = (request: Request) => viewingPost(request, {}, (key) => startSession(key));
