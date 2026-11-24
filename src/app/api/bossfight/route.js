import { getBearerToken, getUser } from "../../../lib/server/auth.js";
import { createBossfightHandlers } from "../../../lib/server/bossfight.js";

const handlers = createBossfightHandlers({ getBearerToken, getUser });
export const GET = handlers.GET;
export const POST = handlers.POST;
