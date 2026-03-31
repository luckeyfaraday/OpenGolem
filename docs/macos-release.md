# macOS Release

## Local build

Run on a macOS host:

```bash
brew install cliclick
npm ci
npm run build:mac -- --arm64 --publish never
```

For Intel builds:

```bash
npm run build:mac -- --x64 --publish never
```

## CI release

The GitHub Actions workflow is [macos-release.yml](../.github/workflows/macos-release.yml).

It builds:

- `x64` on `macos-13`
- `arm64` on `macos-14`

## Required secrets

These secrets enable code signing and notarization:

- `APPLE_CERTIFICATE_P12` (base64-encoded `.p12` contents)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`

If the Apple ID secrets are missing, the notarization hook skips notarization. If the certificate secrets are missing, the workflow now disables signing explicitly and still produces an unsigned macOS build instead of failing during certificate discovery.

## Notes

- The mac build expects `cliclick` to be available on the build machine so `resources/tools/darwin-*` can be prepared.
- The notarization hook is wired through `afterSign` in `electron-builder.yml`.
