"""
Build the macOS .app (productName from package.json) for Apple Silicon (M1/M2/M3...) from Windows.

electron-builder refuses to build macOS apps on Windows, so this script takes
Electron's official darwin-arm64 release zip and re-packs it:
  * renames Electron.app -> "<productName>.app"
  * rewrites Info.plist (name, bundle id, version)
  * swaps in our icon (build/icon.icns, generated from build/icon.ico if missing)
  * replaces the default app with main.js + package.json
  * keeps every symlink and Unix permission bit from the original zip
    (Electron's frameworks need them; extracting on Windows would lose them)

The outer bundle's signature is invalidated by these edits, so it must be
re-signed ad hoc once on the Mac (see README "macOS (Apple Silicon)").

Usage:
  python scripts/package-mac-arm64.py <electron-vX.Y.Z-darwin-arm64.zip>
"""
import io
import json
import plistlib
import stat
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
APP_NAME = PKG["build"]["productName"]
BUNDLE_ID = PKG["build"]["appId"]
SRC_PREFIX = "Electron.app/"
DST_PREFIX = f"{APP_NAME}.app/"


def make_icns() -> bytes:
    icns = ROOT / "build" / "icon.icns"
    if not icns.exists():
        from PIL import Image  # pip install pillow

        ico = Image.open(ROOT / "build" / "icon.ico")
        ico.size = max(ico.info["sizes"])
        ico.load()
        ico.convert("RGBA").resize((1024, 1024), Image.LANCZOS).save(icns, format="ICNS")
    return icns.read_bytes()


def app_package_json(pkg: dict) -> bytes:
    slim = {
        "name": pkg["name"],
        "productName": APP_NAME,
        "version": pkg["version"],
        "description": pkg.get("description", ""),
        "main": pkg["main"],
    }
    return json.dumps(slim, indent=2).encode()


def info(name: str, mode: int, like: zipfile.ZipInfo | None = None) -> zipfile.ZipInfo:
    zi = zipfile.ZipInfo(name, date_time=like.date_time if like else (2026, 1, 1, 0, 0, 0))
    zi.create_system = 3  # Unix, so macOS honours mode bits and symlinks
    zi.external_attr = mode << 16
    zi.compress_type = zipfile.ZIP_STORED if stat.S_ISLNK(mode) else zipfile.ZIP_DEFLATED
    return zi


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    pkg = PKG
    version = pkg["version"]
    out_dir = ROOT / "dist"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{APP_NAME}-{version}-mac-arm64.zip"

    icns = make_icns()
    resources = DST_PREFIX + "Contents/Resources/"

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
        for item in zin.infolist():
            if not item.filename.startswith(SRC_PREFIX):
                continue  # drop LICENSE/version files at the zip root
            name = DST_PREFIX + item.filename[len(SRC_PREFIX):]
            mode = item.external_attr >> 16
            data = zin.read(item)

            if name == resources + "default_app.asar":
                continue
            if name == DST_PREFIX + "Contents/Info.plist":
                plist = plistlib.loads(data)
                plist.update(
                    CFBundleName=APP_NAME,
                    CFBundleDisplayName=APP_NAME,
                    CFBundleIdentifier=BUNDLE_ID,
                    CFBundleShortVersionString=version,
                    CFBundleVersion=version,
                    LSApplicationCategoryType="public.app-category.productivity",
                    NSHumanReadableCopyright=f"{APP_NAME}",
                )
                plist.pop("ElectronAsarIntegrity", None)
                data = plistlib.dumps(plist)
            elif name == resources + "electron.icns":
                data = icns

            zi = info(name, mode or 0o644, item)
            if item.is_dir():
                zi.external_attr |= 0x10  # MS-DOS directory flag
            zout.writestr(zi, data)

        zout.writestr(info(resources + "app/", stat.S_IFDIR | 0o755), b"")
        zout.writestr(info(resources + "app/main.js", stat.S_IFREG | 0o644), (ROOT / "main.js").read_bytes())
        zout.writestr(info(resources + "app/package.json", stat.S_IFREG | 0o644), app_package_json(pkg))

    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
