import admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin env vars: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * @param {Request} request
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
export async function verifyAuthToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Authentication required.');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new Error('Unauthorized: Token missing.');
  }

  const decoded = await adminAuth.verifyIdToken(token);
  return decoded;
}
