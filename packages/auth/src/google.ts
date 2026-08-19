import { OAuth2Client } from "google-auth-library";
import { OAuthError } from "./errors";
import type { OAuthProvider } from "./oauth";

export interface GoogleIdentity {
  sub: string;
  email: string | undefined;
  emailVerified: boolean | undefined;
  hostedDomain: string | undefined;
  name: string | undefined;
  givenName: string | undefined;
  familyName: string | undefined;
  picture: string | undefined;
  locale: string | undefined;
}

export function googleOauth({
  clientId,
  clientSecret,
}: {
  clientId: string;
  clientSecret: string;
}): OAuthProvider<GoogleIdentity> {
  const client = new OAuth2Client(clientId, clientSecret);

  return {
    async getIdentity(request) {
      try {
        const token = await client.getToken({
          code: request.code,
          redirect_uri: request.redirectUri,
          ...(request.codeVerifier === undefined ? {} : { codeVerifier: request.codeVerifier }),
        });
        const ticket = await client.verifyIdToken({
          idToken: token.tokens.id_token as string,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload) {
          throw new Error("Failed to get payload from Google ID token.");
        }
        return {
          sub: payload.sub,
          email: payload.email,
          emailVerified: payload.email_verified,
          hostedDomain: payload.hd,
          name: payload.name,
          givenName: payload.given_name,
          familyName: payload.family_name,
          picture: payload.picture,
          locale: payload.locale,
        };
      } catch (error) {
        throw new OAuthError(error);
      }
    },
  };
}
