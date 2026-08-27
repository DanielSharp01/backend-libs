import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
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

export interface GoogleOauthOptions {
  clientId: string;
  clientSecret: string;
  scopes?: readonly string[];
}

const defaultScopes = ["openid", "email", "profile"] as const;

export function googleOauth({
  clientId,
  clientSecret,
  scopes = defaultScopes,
}: GoogleOauthOptions): OAuthProvider<GoogleIdentity> {
  const client = new OAuth2Client(clientId, clientSecret);

  return {
    getAuthorizationUrl(request) {
      try {
        return client.generateAuthUrl({
          redirect_uri: request.redirectUri,
          scope: [...scopes],
          state: request.state,
          ...(request.codeChallenge === undefined
            ? {}
            : {
                code_challenge: request.codeChallenge,
                code_challenge_method: CodeChallengeMethod.S256,
              }),
          ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
        });
      } catch (error) {
        throw new OAuthError(error);
      }
    },
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
        if (request.nonce !== undefined && payload.nonce !== request.nonce) {
          throw new Error("Google ID token nonce does not match the OAuth request.");
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
