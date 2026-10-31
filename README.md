# Webmail Launcher

A small Electron desktop application that opens:

`https://server326.web-hosting.com:2096/`

It uses an isolated Chromium renderer, persistent default-session storage, native file selection for uploads, and a save dialog for downloads.

## Requirements

- Windows 10 or Windows 11
- Node.js LTS (includes npm)
- Internet access to install dependencies and build the installer

## Run locally

Open PowerShell in this folder and run:

```powershell
npm install
npm start
```

## Build the Windows installer

```powershell
npm run dist
```

When the build completes, look in `dist` for `Webmail Launcher Setup 1.0.0.exe`.

## macOS (Apple Silicon: M1/M2/M3)

### Build on GitHub (recommended)
Push this folder to a GitHub repository, open the **Actions** tab, choose **Build macOS app**
and click **Run workflow**. It builds on an M1 runner; download the `.dmg` from the finished
run. Pushing a tag such as `v1.0.0` also publishes it as a GitHub Release.

### Package on Windows
electron-builder cannot build macOS apps on Windows, so `scripts/package-mac-arm64.py`
repackages Electron's official `darwin-arm64` release zip (same version as
`node_modules/electron`, from https://github.com/electron/electron/releases) with this app:

```powershell
python scripts/package-mac-arm64.py path\to\electron-v39.8.10-darwin-arm64.zip
```

Output: `dist/Webmail Launcher-1.0.0-mac-arm64.zip`. On the Mac, after moving the app to
Applications, run once in Terminal:

```bash
xattr -cr "/Applications/Webmail Launcher.app"
codesign --force --deep --sign - "/Applications/Webmail Launcher.app"
```

### Build natively on a Mac
Copy the project without `node_modules` and `dist`, then `npm install && npm run dist:mac`.

Unsigned builds trigger a Gatekeeper warning on first launch (System Settings →
Privacy & Security → **Open Anyway**). Sign with an Apple Developer ID and notarize to avoid it.
Requires macOS 12 or newer.

## Custom icon

Replace `build/icon.ico` with your own Windows `.ico` file before running `npm run dist`. Use a multi-size ICO if possible (16, 32, 48, 256 pixels). The same icon is used for the app and installer shortcuts.

A simple blue-envelope placeholder icon is included, so the project can build immediately. Replace it with your own `.ico` whenever you are ready.

## Rename the application

Change `productName`, `shortcutName`, and `APP_NAME` in `package.json` and `main.js`. If this is already installed on computers, keep `appId` unchanged to avoid Windows treating it as a different application.

## Uploads and downloads

- Uploads: use the website's normal Attach / Choose File control. Electron will show the native Windows file picker.
- Downloads: when the site starts a download, the app asks where to save it.
- The app does not bypass server restrictions or certificate errors.

## Troubleshooting

- If the site does not load, open it in Edge and check whether the server certificate is valid and whether the URL works.
- If login redirects to another HTTPS page, the app permits HTTPS redirects.
- If a file does not download, check whether the website opened a blocked popup or uses a download flow that requires a user click. Inspect the PowerShell output for `[download]` or `[load-error]` logs.
- If Windows SmartScreen warns about an unknown publisher, that is common for unsigned apps. A trusted code-signing certificate can reduce this warning.
