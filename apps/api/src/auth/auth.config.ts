import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@heizen/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
    },
  },
  plugins: [organization()],
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  trustedOrigins: [process.env.CORS_ORIGIN ?? "http://localhost:3000"],
});
