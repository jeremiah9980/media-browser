# Google Drive API Key Workaround for `media-browser`

## What this does

This avoids exposing your Google Drive API key in a public GitHub Pages site.

Instead of calling the Google Drive API from `index.html`, GitHub Actions calls the Drive API privately, generates `media.json`, commits that file, and your public page reads only `media.json`.

## Why this is safer

A static GitHub Pages site cannot truly hide browser-side secrets. Anything shipped to `index.html` can be viewed by visitors.

This workaround keeps `GOOGLE_API_KEY` inside GitHub Actions secrets and only publishes non-secret video metadata.

## Files in this workaround

```text
.github/workflows/update-media-json.yml
scripts/build-media-json.mjs
index-loader-patch.html
```

## Setup

### 1. Add GitHub Actions secrets

In your repo:

`Settings → Secrets and variables → Actions → New repository secret`

Add:

```text
GOOGLE_API_KEY
GOOGLE_DRIVE_FOLDER_ID
```

For your current parent folder URL:

```text
https://drive.google.com/drive/folders/1XNgrwPKPSrDwXw6a3EaH9S8x9b69FuNL?usp=sharing
```

Use this value:

```text
GOOGLE_DRIVE_FOLDER_ID=1XNgrwPKPSrDwXw6a3EaH9S8x9b69FuNL
```

### 2. Copy files into your repo

Copy:

```text
scripts/build-media-json.mjs
.github/workflows/update-media-json.yml
```

### 3. Patch `index.html`

Remove browser-side Drive API logic and use the pattern in:

```text
index-loader-patch.html
```

Your page should load:

```js
const response = await fetch("./media.json", { cache: "no-store" });
const media = await response.json();
```

### 4. Run the workflow manually

Go to:

`Actions → Refresh Google Drive media.json → Run workflow`

The workflow will create or update `media.json`.

### 5. Keep Drive sharing correct

The videos must still be playable by visitors. Set the parent folder, subfolders, and video files to:

```text
Anyone with the link → Viewer
```

## Important security cleanup

Because an API key was already pasted/shared in prior troubleshooting, rotate it:

1. Go to Google Cloud Console.
2. Open APIs & Services → Credentials.
3. Delete or regenerate the exposed key.
4. Create a new key.
5. Restrict it to Google Drive API.
6. Store the new key only as `GOOGLE_API_KEY` in GitHub Actions secrets.

## What remains public

The generated `media.json` is public because GitHub Pages serves it. It will contain file IDs, titles, thumbnails, and Drive preview URLs.

That is acceptable only for videos you intentionally share publicly.
