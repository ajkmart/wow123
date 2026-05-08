/**
 * Firebase Client SDK — AJKMart Customer App (Expo)
 *
 * Gracefully disabled when EXPO_PUBLIC_FIREBASE_API_KEY is not set.
 * Supports Google Sign-In and phone number auth in FIREBASE / HYBRID modes.
 *
 * NOTE: Env vars are accessed via static `process.env.EXPO_PUBLIC_*` dot
 * notation so Expo's babel plugin can inline them at build time. The
 * `expo/no-dynamic-env-var` rule forbids dynamic / bracket access here.
 */

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _initialized = false;

function getFirebaseConfig() {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN         ?? "",
    projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID          ?? "",
    storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID              ?? "",
  };
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (_initialized) return _auth;
  _initialized = true;

  const config = getFirebaseConfig();
  if (!config) return null;

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");
    _app = getApps().length === 0 ? initializeApp(config) : getApps()[0]!;
    _auth = getAuth(_app);
    return _auth;
  } catch {
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
}
