# Expo HAS CHANGED

Read the exact versioned docs before writing any code:

**https://docs.expo.dev/versions/v54.0.0/**

## Pin the docs to what is installed

This file previously linked `v56.0.0`, while the installed SDK is **54.0.36**
(`package.json` pins `~54.0.0`). Two majors of drift.

That mistake is invisible: `docs.expo.dev/versions/<anything>/` returns **200**
for every version, so a wrong link does not 404 — it quietly serves APIs this
project does not have. Check before trusting the link:

```
node -p "require('expo/package.json').version"
```

If it no longer starts with `54`, update the URL above in the same change that
bumps the SDK.

Current tree (verified 2026-08-25):

| Package | Version |
| --- | --- |
| `expo` | 54.0.36 |
| `react-native` | 0.81.5 |
| `expo-router` | 6.0.24 |

## Install with `npx expo install`, never `npm install`

`expo install` resolves against the SDK's compatibility matrix; `npm install`
takes the latest tag and will happily install something this SDK cannot run.

Real example, 2026-08-25: `npx expo install @sentry/react-native` selected
**7.2.0**, not the latest **8.23.0**, because 7.2.x is what SDK 54 supports.
Peer-dependency ranges did not catch this — 8.23.0 advertises `expo >=49`, so
`npm install` would have looked correct and produced a broken build.

## Verify a config-plugin change actually resolved

Adding a plugin to `app.config.js` fails at build time, not at edit time. Confirm
it loaded:

```
npx expo config --type public
```

Exit code 0 and the plugin present in the output. Note the command prints an
env-loading preamble and ANSI colour codes before the JSON, so it is not
directly parseable — grep it rather than piping to a JSON parser.
