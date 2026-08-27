# Google sign-in and Gmail SMTP

The application supports two independent Google integrations:

- Google OAuth signs users into Unity Runn Club.
- Gmail SMTP sends transactional registration and event emails.

Credentials belong only in the ignored root `.env` file or the production
secret manager. Never commit them or paste them into frontend variables.

## Google OAuth

1. In Google Cloud Console, configure the OAuth consent screen.
2. Create an OAuth client with application type **Web application**.
3. For local development, add:
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:8080/api/v1/auth/google/callback`
4. Add the issued values to the root `.env`:

```dotenv
PUBLIC_APP_URL=http://localhost:3000
GOOGLE_OAUTH_CLIENT_ID=your-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-web-client-secret
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:8080/api/v1/auth/google/callback
```

Google requires the redirect URI to match exactly. Production must use an
HTTPS URL on a domain you control. The application requests only
`openid email profile`, validates a browser-bound state value, requires a
verified email, and does not store Google access or refresh tokens.

## Gmail SMTP

1. Enable 2-Step Verification on the sending Google account.
2. Create a dedicated App Password for Unity Runn Club.
3. Add the values to the root `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=club@example.com
SMTP_PASSWORD=the-16-character-app-password
SMTP_FROM=club@example.com
```

Use the App Password, never the Google account password. `SMTP_FROM` should be
the authenticated Gmail address or a verified send-as alias for that account.
Port 587 is configured with mandatory TLS.

## Apply and verify

```sh
docker compose up -d --build api
curl -s http://localhost:8080/api/v1/auth/providers
```

The provider response should report `"google": true`. The login page will then
show **Continue with Google**. Transactional email is processed asynchronously;
after a registration or payment event, inspect API logs and the notifications
table if delivery needs troubleshooting.

Official references:

- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/accounts/answer/185833
