import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import multer from "multer";

const app = express();
const tempRoot = path.join(os.tmpdir(), "progress-receipt-renders");
await mkdir(tempRoot, { recursive: true });

const upload = multer({
  dest: tempRoot,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, done) => {
    done(null, file.mimetype.startsWith("video/"));
  },
});

app.use(express.static(process.cwd(), { index: "index.html" }));

app.post("/api/render", upload.single("video"), async (request, response) => {
  const source = request.file?.path;
  const output = path.join(tempRoot, `${randomUUID()}.mp4`);

  if (!source) {
    response.status(400).json({ error: "A generated video is required." });
    return;
  }

  try {
    await transcode(source, output);
    response.set({
      "Content-Type": "video/mp4",
      "Content-Disposition": 'attachment; filename="2026-progress-receipt.mp4"',
      "Cache-Control": "no-store",
    });
    const stream = createReadStream(output);
    stream.pipe(response);
    stream.on("close", cleanup);
    response.on("close", cleanup);
  } catch (error) {
    console.error("render failed", error);
    await cleanup();
    response.status(500).json({ error: "Video rendering failed." });
  }

  async function cleanup() {
    await Promise.allSettled([rm(source, { force: true }), rm(output, { force: true })]);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(413).json({ error: "The generated video is too large." });
    return;
  }
  response.status(500).json({ error: "Unexpected error." });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`2026 Progress Receipt listening on ${port}`));

function transcode(source, output) {
  // The score is original: a soft C-major ambient chord with a slow pulse.
  const score = "0.10*(sin(2*PI*261.63*t)+0.72*sin(2*PI*329.63*t)+0.55*sin(2*PI*392*t)+0.24*sin(2*PI*523.25*t))*(0.72+0.28*sin(2*PI*0.18*t))";
  const args = [
    "-y", "-i", source,
    "-f", "lavfi", "-t", "10", "-i", `aevalsrc=${score}:s=44100`,
    "-filter_complex", "[1:a]afade=t=in:st=0:d=0.35,afade=t=out:st=9.15:d=0.85,volume=0.9[music]",
    "-map", "0:v:0", "-map", "[music]", "-shortest",
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "baseline", "-level", "3.1",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", output,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}
