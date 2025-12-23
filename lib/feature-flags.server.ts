export function isEmailPasswordAuthEnabledServer(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV !== "production" && env.ENABLE_EMAIL_PASSWORD_AUTH === "true";
}

export const emailPasswordAuthEnabledServer =
  process.env.NODE_ENV !== "production" && process.env.ENABLE_EMAIL_PASSWORD_AUTH === "true";
