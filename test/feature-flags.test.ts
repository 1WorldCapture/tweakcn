import assert from "node:assert/strict";
import test from "node:test";

import { isEmailPasswordAuthEnabledServer } from "../lib/feature-flags.server";
import { isEmailPasswordUiEnabled } from "../lib/feature-flags";

test("server email/password auth is forced off in production", () => {
  assert.equal(
    isEmailPasswordAuthEnabledServer({
      NODE_ENV: "production",
      ENABLE_EMAIL_PASSWORD_AUTH: "true",
    }),
    false
  );
});

test("server email/password auth can be enabled in non-production via env flag", () => {
  assert.equal(
    isEmailPasswordAuthEnabledServer({
      NODE_ENV: "development",
      ENABLE_EMAIL_PASSWORD_AUTH: "true",
    }),
    true
  );
  assert.equal(
    isEmailPasswordAuthEnabledServer({
      NODE_ENV: "test",
      ENABLE_EMAIL_PASSWORD_AUTH: "true",
    }),
    true
  );
});

test("server email/password auth defaults to disabled", () => {
  assert.equal(isEmailPasswordAuthEnabledServer({ NODE_ENV: "development" }), false);
  assert.equal(isEmailPasswordAuthEnabledServer({ NODE_ENV: "test" }), false);
});

test("client email/password UI is forced off in production", () => {
  assert.equal(
    isEmailPasswordUiEnabled({
      NODE_ENV: "production",
      NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH: "true",
    }),
    false
  );
});

test("client email/password UI can be enabled in non-production via env flag", () => {
  assert.equal(
    isEmailPasswordUiEnabled({
      NODE_ENV: "development",
      NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH: "true",
    }),
    true
  );
});
