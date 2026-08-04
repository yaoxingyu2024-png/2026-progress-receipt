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
    done(null, file.mimetype.startsWith("image/"));
  },
});

app.use(express.static(process.cwd(), { index: "index.html" }));

app.post("/api/render-frames", upload.array("frames", 8), async (request, response) => {
  const sources = request.files?.map((file) => file.path) || [];
  const output = path.join(tempRoot, `${randomUUID()}.mp4`);

  if (sources.length !== 8) {
    await Promise.allSettled(sources.map((source) => rm(source, { force: true })));
    response.status(400).json({ error: "Eight generated frames are required." });
    return;
  }

  try {
    await transcodeFrames(sources, output);
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
    await Promise.allSettled([...sources.map((source) => rm(source, { force: true })), rm(output, { force: true })]);
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

function transcodeFrames(sources, output) {
  // Original lo-fi cue: mellow electric-piano chords, a muted kick and vinyl-like hats.
  const score = "0.045*(sin(2*PI*261.63*t)+0.48*sin(2*PI*329.63*t)+0.34*sin(2*PI*392*t)+0.16*sin(2*PI*523.25*t))*(0.68+0.32*sin(2*PI*0.12*t))+0.13*sin(2*PI*(62-28*mod(t\\,1))*t)*exp(-15*mod(t\\,1))+0.035*(random(0)*2-1)*between(mod(t\\,0.5)\\,0\\,0.028)";
  const durations = [0.8, 1.1, 1.1, 1.1, 1.1, 1.1, 2.5, 1.2];
  const inputArgs = sources.flatMap((source, index) => ["-loop", "1", "-t", String(durations[index]), "-i", source]);
  const filters = sources.map((_, index) =>
    `[${index}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v${index}]`,
  );
  const joined = `${sources.map((_, index) => `[v${index}]`).join("")}concat=n=8:v=1:a=0[video]`;
  const args = [
    "-y", ...inputArgs,
    "-f", "lavfi", "-t", "10", "-i", `aevalsrc=${score}:s=44100`,
    "-filter_complex", `${filters.join(";")};${joined};[video]fps=30[vout];[8:a]lowpass=f=6800,highpass=f=45,aecho=0.8:0.32:170:0.16,afade=t=in:st=0:d=0.35,afade=t=out:st=9.15:d=0.85,volume=0.9[music]`,
    "-map", "[vout]", "-map", "[music]", "-shortest",
    "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", "-crf", "28", "-profile:v", "baseline", "-level", "3.1",
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
