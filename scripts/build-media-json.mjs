/**
 * Build media.json from a Google Drive parent folder.
 *
 * Runs in GitHub Actions so GOOGLE_API_KEY is never committed to the repo
 * and never shipped inside index.html.
 *
 * Required GitHub Actions secrets:
 * - GOOGLE_API_KEY
 * - GOOGLE_DRIVE_FOLDER_ID
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.GOOGLE_API_KEY;
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY environment variable.");
}

if (!ROOT_FOLDER_ID) {
  throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID environment variable.");
}

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
  "video/mpeg",
]);

function cleanTitle(name = "") {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.round(Number(ms || 0) / 1000);
  if (!totalSeconds) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function inferTags(file, folderPath) {
  const text = `${file.name || ""} ${folderPath.join(" ")}`.toLowerCase();
  const tags = new Set();

  for (const token of folderPath) {
    if (token && token !== "Root") tags.add(token);
  }

  const keywordTags = [
    "game",
    "practice",
    "highlight",
    "highlights",
    "tournament",
    "scrimmage",
    "training",
    "home",
    "away",
    "spring",
    "summer",
    "fall",
    "winter",
  ];

  for (const tag of keywordTags) {
    if (text.includes(tag)) tags.add(tag);
  }

  return [...tags].slice(0, 12);
}

async function driveList(parentId) {
  const files = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      key: API_KEY,
      q: `'${parentId}' in parents and trashed = false`,
      pageSize: "1000",
      fields:
        "nextPageToken,files(id,name,mimeType,description,size,createdTime,modifiedTime,thumbnailLink,webViewLink,videoMediaMetadata)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Drive API ${response.status}: ${body}`);
    }

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files;
}

async function walkFolder(folderId, folderPath = ["Root"]) {
  const children = await driveList(folderId);
  const media = [];

  for (const item of children) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      const nested = await walkFolder(item.id, [...folderPath, item.name]);
      media.push(...nested);
      continue;
    }

    const isVideo =
      item.mimeType?.startsWith("video/") || VIDEO_MIME_TYPES.has(item.mimeType);

    if (!isVideo) continue;

    const metadata = item.videoMediaMetadata || {};
    const category = folderPath.length > 1 ? folderPath[folderPath.length - 1] : "Uncategorized";

    media.push({
      id: item.id,
      title: cleanTitle(item.name),
      filename: item.name,
      description: item.description || "",
      category,
      folderPath,
      tags: inferTags(item, folderPath),
      duration: formatDuration(metadata.durationMillis),
      durationMillis: metadata.durationMillis || "",
      width: metadata.width || "",
      height: metadata.height || "",
      resolution:
        metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : "",
      date: item.createdTime ? item.createdTime.slice(0, 10) : "",
      createdTime: item.createdTime || "",
      modifiedTime: item.modifiedTime || "",
      fileSize: formatBytes(item.size),
      sizeBytes: item.size || "",
      mimeType: item.mimeType || "",
      thumbnail: item.thumbnailLink || `https://drive.google.com/thumbnail?id=${item.id}&sz=w640`,
      previewUrl: `https://drive.google.com/file/d/${item.id}/preview`,
      viewUrl: item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`,
    });
  }

  return media;
}

const media = await walkFolder(ROOT_FOLDER_ID);

media.sort((a, b) => {
  const dateCompare = (b.date || "").localeCompare(a.date || "");
  if (dateCompare !== 0) return dateCompare;
  return a.title.localeCompare(b.title);
});

const outputPath = path.resolve("media.json");
await fs.writeFile(outputPath, `${JSON.stringify(media, null, 2)}\n`, "utf8");

console.log(`Wrote ${media.length} videos to ${outputPath}`);
