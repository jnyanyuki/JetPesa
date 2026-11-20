import { createNeonAuth } from '@neon/auth/next/server';

const baseUrl =
  process.env.NEON_AUTH_BASE_URL ||
  'https://ep-fancy-bread-bhqw5fab.neonauth.c-10.eu-central-1.aws.neon.tech/neondb/auth';

const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  'V4hsb5nozh5dz3IyGLm0U0UMlVHvzihMRqThtw+YBDE=';

export const auth = createNeonAuth({
  baseUrl,
  cookies: { secret: cookieSecret },
});

/**
 * Helper to extract and verify the current session from incoming Next.js Request.
 * Supports both Cookie header and Authorization: Bearer <token>
 * @param {Request} request
 * @returns {Promise<{ user: { id: string, email: string, name?: string }, session: any } | null>}
 */
export async function getAuthSession(request) {
  try {
    const sessionRes = await auth.getSession({
      headers: request.headers,
    });
    if (sessionRes?.data?.user) {
      return sessionRes.data;
    }
  } catch (err) {
    console.warn('Session verification error:', err.message);
  }
  return null;
}
