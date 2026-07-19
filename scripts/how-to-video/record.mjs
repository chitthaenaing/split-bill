/**
 * Records the Bill Split customer how-to walkthrough to MP4.
 *
 * Usage: node scripts/how-to-video/record.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, copyFile, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "public");
const artifactsDir = "/opt/cursor/artifacts";
const tmpDir = path.join(__dirname, ".tmp-record");
const htmlPath = path.join(__dirname, "walkthrough.html");
const totalMs = 3200 + 3400 + 3200 + 4200 + 3800 + 4000 + 3600 + 800; // scenes + buffer

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

async function main() {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tmpDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  const url = pathToFileURL(htmlPath).href;
  await page.goto(url, { waitUntil: "networkidle" });
  // Wait for walkthrough to finish
  await page.waitForFunction(() => document.body.dataset.done === "1", null, {
    timeout: totalMs + 10000,
  });
  // Hold final frame briefly
  await page.waitForTimeout(600);

  await context.close();
  await browser.close();

  const files = await readdir(tmpDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("No Playwright webm recording found");

  const webmPath = path.join(tmpDir, webm);
  const mp4Path = path.join(outDir, "how-to-use.mp4");
  const artifactMp4 = path.join(artifactsDir, "bill-split-how-to-use.mp4");

  // Convert to H.264 MP4 for broad playback
  await run("ffmpeg", [
    "-y",
    "-i",
    webmPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4Path,
  ]);

  await copyFile(mp4Path, artifactMp4);

  // Also drop a poster frame for README / social
  const posterPath = path.join(outDir, "how-to-use-poster.jpg");
  await run("ffmpeg", [
    "-y",
    "-ss",
    "1.2",
    "-i",
    mp4Path,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-update",
    "1",
    posterPath,
  ]);
  await copyFile(posterPath, path.join(artifactsDir, "bill-split-how-to-poster.jpg"));

  console.log("Wrote", mp4Path);
  console.log("Wrote", artifactMp4);
  await rm(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
