const { app, BrowserWindow, session, shell, dialog } = require("electron");
const path = require("node:path");

const APP_NAME = "Webmail Launcher";
const START_URL = "https://server326.web-hosting.com:2096/";
const APP_ID = "com.webmaillauncher.desktop";

let mainWindow;

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function isWebUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? { icon: path.join(__dirname, "build", "icon.ico") }
      : {}),
    webPreferences: {
      // Remote website content must not get access to Electron or Node APIs.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Keep the app window dedicated to webmail. Open ordinary external links
    // in the user's default browser. Reject non-web protocols.
    if (isWebUrl(url)) {
      shell.openExternal(url).catch((error) => {
        console.error("[external-link] Could not open URL:", error);
      });
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Permit HTTPS/HTTP navigation needed by webmail sign-in and redirects.
    // Block non-web protocols such as file:, javascript:, and custom schemes.
    if (!isWebUrl(url)) {
      event.preventDefault();
      console.warn("[navigation] Blocked non-web URL:", url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error("[load-error]", {
        errorCode,
        errorDescription,
        url: validatedURL
      });
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer-gone]", details);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(START_URL).catch((error) => {
    console.error("[startup] Failed to load webmail:", error);
    dialog.showMessageBox({
      type: "error",
      title: `${APP_NAME} - Connection error`,
      message: "Webmail could not be loaded.",
      detail: `Check your internet connection and the website address, then restart the app.\n\n${error.message}`
    });
  });
}

app.whenReady().then(() => {
  const webmailSession = session.defaultSession;

  // Remember download behavior for this app profile and let users choose
  // the save location for each download.
  webmailSession.on("will-download", (_event, item, _webContents) => {
    const suggestedName = item.getFilename();
    const savePath = dialog.showSaveDialogSync(mainWindow, {
      title: "Save downloaded file",
      defaultPath: path.join(app.getPath("downloads"), suggestedName),
      buttonLabel: "Save"
    });

    if (!savePath) {
      item.cancel();
      console.log("[download] User cancelled:", suggestedName);
      return;
    }

    item.setSavePath(savePath);
    console.log("[download] Started:", suggestedName, "->", savePath);

    item.on("updated", (_event, state) => {
      if (state === "interrupted") {
        console.error("[download] Interrupted:", suggestedName);
      } else if (state === "progressing") {
        const progress = item.getTotalBytes()
          ? Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100)
          : 0;
        console.log(`[download] ${suggestedName}: ${progress}%`);
      }
    });

    item.once("done", (_event, state) => {
      if (state === "completed") {
        console.log("[download] Completed:", savePath);
      } else {
        console.error("[download] Finished with state:", state, suggestedName);
      }
    });
  });

  // Grant only the permissions normally needed for webmail file selection
  // and common webmail functionality. File input controls use the native
  // chooser automatically; this handler does not grant camera/microphone.
  webmailSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = new Set(["notifications", "clipboard-read", "clipboard-sanitized-write"]);
    callback(allowedPermissions.has(permission));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
