export interface GoogleIdentity {
  email: string;
  name?: string;
  picture?: string;
  sub?: string;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) throw new AuthError("Missing Authorization header");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new AuthError("Invalid Authorization header");
  return token;
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new AuthError(`Google token verification failed (${response.status})`, 401);
  }
  const json = (await response.json()) as {
    email?: string;
    name?: string;
    picture?: string;
    sub?: string;
  };
  if (!json.email) throw new AuthError("Google identity missing email", 401);
  return {
    email: json.email.toLowerCase(),
    name: json.name,
    picture: json.picture,
    sub: json.sub,
  };
}
