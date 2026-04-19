import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
  // ADD THIS FOR YOUR PHONE:
  trustedOrigins: [
    "http://localhost:3000",
    "http://192.168.1.231:4000" ,
    "http://127.0.0.1:4000"
  ],
  // ADD THIS FOR CROSS-DEVICE COOKIES:
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: false, // Essential for HTTP testing on phones
    crossAddress: true,
    disableOriginCheck: true,
  },
  baseURL: process.env.BETTER_AUTH_URL, 
});
export type Session = typeof auth.$Infer.Session;
