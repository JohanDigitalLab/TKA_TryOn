"use server";

import { cookies } from "next/headers";
import { getUser } from "@/lib/server/auth";
import { createVirtualpetActions } from "@/lib/server/virtualpet";

const execute = createVirtualpetActions({ getUser, cookies });
export async function bootstrapVirtualpet(payload, expectedUserId) { return execute("bootstrap", payload, expectedUserId); }
export async function settingsVirtualpet(payload, expectedUserId) { return execute("settings", payload, expectedUserId); }
export async function adoptVirtualpet(payload, expectedUserId) { return execute("adopt", payload, expectedUserId); }
export async function feedVirtualpet(payload, expectedUserId) { return execute("feed", payload, expectedUserId); }
export async function startVirtualpet(payload, expectedUserId) { return execute("start", payload, expectedUserId); }
export async function finishVirtualpet(payload, expectedUserId) { return execute("finish", payload, expectedUserId); }
