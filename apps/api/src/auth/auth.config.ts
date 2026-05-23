import { config as loadEnv } from "dotenv";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@heizen/db";

loadEnv();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
      mapProfileToUser: (profile) => {
        const login = profile.login as string | undefined;
        const id = String(profile.id ?? "unknown");
        const email =
          (profile.email as string | null | undefined) ??
          (login ? `${id}+${login}@users.noreply.github.com` : `${id}@github.heizen.local`);

        return {
          email,
          name: (profile.name as string | undefined) || login || "GitHub User",
          emailVerified: Boolean(profile.email),
        };
      },
    },
  },
  plugins: [organization()],
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  trustedOrigins: [
    process.env.CORS_ORIGIN ?? "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
});
