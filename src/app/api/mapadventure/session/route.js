import { cookies } from "next/headers";
import { getUser } from "@/lib/server/auth";
import { createMapadventureSession } from "@/lib/server/mapadventure";

export const POST = createMapadventureSession({ getUser, cookies, production: process.env.NODE_ENV === "production" });
