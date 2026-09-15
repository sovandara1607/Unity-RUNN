# Running the mobile app locally

The mobile app (`mobile/`) is an Expo/React Native client. It talks to two
other pieces of this monorepo that must already be running: the Go backend
(via Docker Compose) and the Next.js frontend (which the app also reads
event/site images from -- see `assetUrl()` in `features/events/format.ts`).

Because this app uses `expo-widgets` (Live Activities / Dynamic Island),
it has native iOS code and can **not** run inside plain Expo Go. It needs a
custom dev client, built once with `expo run:ios` (or `expo prebuild` +
Xcode), and Metro after that only supplies JS.

## 1. Start the backend

From the repo root:

```
docker compose up -d
```

This brings up Postgres, Redis, pgbouncer, the Go API (+ a replica), the
Traefik API gateway (`localhost:8080`), the worker, and the realtime
(Socket.IO) service. Check status with `docker compose ps`.

## 2. Start the frontend

The mobile app resolves event/site images against the frontend's origin,
so it needs to be running even though nothing in the app renders its pages:

```
cd frontend && npm run dev
```

Runs on `localhost:3000` by default.

## 3. Point the mobile app at both

`mobile/.env.local` (create it from `mobile/.env.example` if it doesn't
exist) needs:

```
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_WEB_URL=http://localhost:3000
```

## 4. First time only: build the native app

```
cd mobile
npx expo prebuild -p ios --clean   # mobile/ios is gitignored, safe to regenerate
npx expo run:ios --device "iPhone 17 Pro"   # or any Dynamic-Island simulator (14 Pro+)
```

This builds the custom dev client, installs it on the simulator, starts
Metro, and launches the app in one step. Rerun this whenever native config
changes (app.json plugins, a new native dependency) -- plain JS/TS edits
never need it.

## 5. Every time after that: just start Metro

Once the dev client is installed, you don't need to rebuild it:

```
cd mobile
npx expo start --ios --dev-client
```

This boots (or reuses) a simulator, starts the Metro bundler, and opens the
already-installed app pointed at it. If the simulator was already booted
headlessly (`xcrun simctl boot <udid>`) before its Simulator GUI window
existed, this step can fail with `Simulator app did not open fast enough` --
opening the Simulator app first (see the note below) and retrying fixes it.

If the app is already running and shows a red
`No script URL provided...` screen (it launched before Metro was ready),
just terminate and relaunch it once Metro says `Logs for your project will
appear below`:

```
xcrun simctl terminate <bundle-id> com.anonymous.unity-runn-mobile
xcrun simctl launch <bundle-id> com.anonymous.unity-runn-mobile
```

## Useful commands while developing

```
npx tsc --noEmit          # typecheck
npm test                  # tsx --test tests/*.test.ts
xcrun simctl list devices booted          # what's currently booted
xcrun simctl io booted screenshot out.png # screenshot the running simulator
```

## Note for this machine specifically

This machine's Xcode install (`Xcode-beta.app`, iOS 27 SDK) does not ship
a `Simulator.app` -- the simulator GUI app is now
`Xcode-beta.app/Contents/Applications/DeviceHub.app`. `open -a Simulator`
fails here; use:

```
open "/Applications/Xcode-beta.app/Contents/Applications/DeviceHub.app"
```
