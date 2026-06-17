import { config as loadEnv } from "dotenv";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@heizen/db";
import { env } from "../common/env";

loadEnv();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // NOTE: do NOT set disableSignUp here. better-auth 1.x enforces that flag
    // on the internal Node API too, which blocks our server-side
    // auth.api.signUpEmail calls (bootstrap admin + /api/admin/users). The
    // public HTTP route is blocked separately at the Express layer in
    // main.ts before better-auth's handler sees it.
    minPasswordLength: 12,
  },
  plugins: [organization()],
  // No databaseHooks.user.create — org-member joins are now performed
  // explicitly at each caller (admin-users.controller, bootstrapAdminUser)
  // inside the same Prisma transaction as the user creation + audit log.
  // Implicit hook-driven side effects made the write graph hard to reason
  // about and could create duplicate Member rows on retry.
  secret: env("BETTER_AUTH_SECRET") ?? "dev-secret-change-me",
  baseURL: env("BETTER_AUTH_URL") ?? "http://localhost:3001",
  // CORS_ORIGIN must be the web app origin (e.g. https://app.example.com), NOT
  // the API origin. In production with cross-subdomain cookies, set WEB_ORIGIN
  // explicitly if it differs from CORS_ORIGIN; otherwise CORS_ORIGIN is used as
  // the web origin for cookie trust.
  trustedOrigins: (() => {
    const webOrigin = env("WEB_ORIGIN");
    const adminOrigin = env("ADMIN_ORIGIN");
    const corsOrigin = env("CORS_ORIGIN");
    const fromCors = corsOrigin
      ? corsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
      : ["http://localhost:3000"];
    return [
      ...(webOrigin ? [webOrigin] : []),
      ...(adminOrigin ? [adminOrigin] : []),
      ...fromCors,
      "http://127.0.0.1:3000",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
    ];
  })(),
  advanced: (() => {
    const cookieDomain = env("AUTH_COOKIE_DOMAIN");
    return cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        }
      : undefined;
  })(),
});
