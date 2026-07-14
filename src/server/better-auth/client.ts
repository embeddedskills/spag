import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { env } from "~/env"; // Import the validated T3 env

export const authClient = createAuthClient({
    // Use the validated environment variable directly
    // T3 ensures this is available on the client because it's prefixed with NEXT_PUBLIC_
    baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
    plugins: [usernameClient()],
});

export type Session = typeof authClient.$Infer.Session;
