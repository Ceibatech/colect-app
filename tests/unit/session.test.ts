import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  signSession,
  verifySessionToken,
} from "@/lib/auth/session";

const AUTH_SECRET = "unit-test-secret-long-enough-for-session-signatures";

beforeAll(() => {
  process.env.AUTH_SECRET = AUTH_SECRET;
});

const payload = {
  userId: 42,
  email: "user@ceiba-analytics.com",
  name: "UTILISATEUR TEST",
  roleCode: "ADMIN" as const,
  permissions: ["USER_MANAGE"] as const,
  sessionVersion: 3,
};

describe("session JWT", () => {
  it("accepte uniquement un jeton complet avec issuer, audience et version", async () => {
    const token = await signSession({ ...payload, permissions: [...payload.permissions] });
    const session = await verifySessionToken(token);

    expect(session).toMatchObject({
      userId: 42,
      sub: "42",
      iss: SESSION_ISSUER,
      aud: SESSION_AUDIENCE,
      sessionVersion: 3,
    });
  });

  it("rejette un ancien jeton sans version de session", async () => {
    const token = await new SignJWT({ ...payload, sessionVersion: undefined })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(SESSION_AUDIENCE)
      .setSubject("42")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(AUTH_SECRET));

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejette un jeton signé avec le mauvais contexte applicatif", async () => {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("autre-application")
      .setAudience(SESSION_AUDIENCE)
      .setSubject("42")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(AUTH_SECRET));

    expect(await verifySessionToken(token)).toBeNull();
  });
});
