import { cookies } from "next/headers";
import { getUser } from "@/lib/server/auth";
import { createVirtualpetSession } from "@/lib/server/virtualpet";

export const POST = createVirtualpetSession({ getUser, cookies, production: process.env.NODE_ENV === "production" });
