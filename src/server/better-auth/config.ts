import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { env } from "~/env";
import { db } from "~/server/db";

// export const auth = betterAuth({
//   database: drizzleAdapter(db, {
//     provider: "pg", // or "pg" or "mysql"
//   }),
//   emailAndPassword: {
//     enabled: true,
//   },
//   socialProviders: {
//     github: {
//       clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
//       clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
//       redirectURI: "http://localhost:3000/api/auth/callback/github",
//     },
//   },
// });

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [username()],
  trustedOrigins: [
    ...new Set([
      env.BETTER_AUTH_URL,
      env.NEXT_PUBLIC_BETTER_AUTH_URL,
      ...(env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
    ]),
  ],
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: env.NODE_ENV === "production",
  },
  baseURL: env.BETTER_AUTH_URL,
});
export type Session = typeof auth.$Infer.Session;
