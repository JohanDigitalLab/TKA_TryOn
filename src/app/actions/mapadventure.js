"use server";

import { cookies } from "next/headers";
import { getUser } from "@/lib/server/auth";
import { createMapadventureActions } from "@/lib/server/mapadventure";

const service = createMapadventureActions({ getUser, cookies });
export async function bootstrapMapadventure(payload, expectedUserId) { return service.execute("bootstrap", payload, expectedUserId); }
export async function settingsMapadventure(payload, expectedUserId) { return service.execute("settings", payload, expectedUserId); }
export async function materialMapadventure(payload, expectedUserId) { return service.execute("material", payload, expectedUserId); }
export async function readCompleteMapadventure(payload, expectedUserId) { return service.execute("read_complete", payload, expectedUserId); }
export async function startMapadventure(payload, expectedUserId) { return service.execute("start", payload, expectedUserId); }
export async function answerMapadventure(payload, expectedUserId) { return service.execute("answer", payload, expectedUserId); }
export async function timeoutMapadventure(payload, expectedUserId) { return service.execute("timeout", payload, expectedUserId); }
export async function useToolMapadventure(payload, expectedUserId) { return service.execute("use_tool", payload, expectedUserId); }
export async function buyMapadventure(payload, expectedUserId) { return service.execute("buy", payload, expectedUserId); }
export async function mapadventure_complete_node(userId, nodeId, score, usedTools, attemptId) {
  return service.completeNode(userId, nodeId, score, usedTools, attemptId);
}
export async function mapadventure_complete_island(userId, theme_id) {
  return service.execute("complete_island", { islandId: theme_id }, userId);
}
export async function mapadventure_open_gatcha(userId, chestTier, nodeId) {
  return service.execute("gacha", { nodeId, ...(chestTier === undefined ? {} : { chestTier }) }, userId);
}
