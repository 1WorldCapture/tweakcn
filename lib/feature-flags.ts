export function isEmailPasswordUiEnabled(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH === "true";
}

// NOTE: keep this as direct `process.env.X` access so Next can inline it into client bundles.
export const emailPasswordUiEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH === "true";
