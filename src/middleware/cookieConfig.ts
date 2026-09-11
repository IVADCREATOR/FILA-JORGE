import { config } from "../config/env.js";

export const SESSION_COOKIE_NAME = config.session.cookieName;
export const SESSION_TTL_HOURS = config.session.ttlHours;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  };
}
