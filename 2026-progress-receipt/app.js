(() => {
  "use strict";

  const YEAR = 2026;
  const VIDEO_DURATION = 10000;
  const INTRO_DURATION = 800;
  const PHOTO_DURATION = 1100;
  const PHOTO_SEQUENCE_END = INTRO_DURATION + PHOTO_DURATION * 5;
  const OUTRO_START = 8800;
  const BASE_W = 1080;
  const BASE_H = 1920;
  const EXPORT_W = 720;
  const EXPORT_H = 1280;
  const labels = ["最舍不得删", "最像电影", "最想重来", "最没想到", "最期待发生"];
  const colors = ["#ff5b3d", "#5c7cfa", "#ffb84d", "#48b878", "#d887e8"];
  const images = new Array(5).fill(null);
  const objectUrls = new Array(5).fill(null);

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const hero = $("#hero");
  const builder = $("#builder");
  const result = $("#result");
  const startButton = $("#start-button");
  const demoButton = $("#demo-button");
  const makeButton = $("#make-button");
  const imageButton = $("#image-button");
  const videoButton = $("#video-button");
  const shareButton = $("#share-button");
  const restartButton = $("#restart-button");
  const uploadStatus = $("#upload-status");
  const exportStatus = $("#export-status");
  const canvas = $("#receipt-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const progress = getYearProgress(new Date());
  applyProgressCopy(progress);
  applyReferralState();
  bindEvents();
  renderAnimatedPreview();

  function getYearProgress(now) {
    const start = new Date(YEAR, 0, 1);
    const end = new Date(YEAR + 1, 0, 1);
    const total = Math.round((end - start) / 86400000);
    const clamped = new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime() - 1));
    const used = Math.floor((clamped - start) / 86400000) + 1;
    const left = Math.max(0, total - used);
    return {
      used,
      left,
      total,
      percent: Math.min(100, (used / total) * 100),
      dateLabel: `${String(clamped.getMonth() + 1).padStart(2, "0")}/${String(clamped.getDate()).padStart(2, "0")}`,
    };
  }

  function applyProgressCopy(data) {
    const percent = `${data.percent.toFixed(1)}%`;
    $("#hero-percent").textContent = percent;
    $("#ticket-percent").textContent = percent;
    $("#hero-days-used").textContent = `${data.used} 天`;
    $("#hero-days-left").textContent = `${data.left} 天`;
    $("#hero-date").textContent = data.dateLabel;
  }

  function bindEvents() {
    startButton.addEventListener("click", () => {
      track("receipt_start", { source: getSource() });
      showSection(builder);
    });
    demoButton.addEventListener("click", showDemo);

    $$('[data-file-input]').forEach((input) => {
      input.addEventListener("change", (event) => loadImageFile(event.currentTarget));
    });

    makeButton.addEventListener("click", () => {
      track("receipt_generated", { source: getSource() });
      showSection(result);
      renderAnimatedPreview(true);
    });

    imageButton.addEventListener("click", saveImage);
    videoButton.addEventListener("click", saveVideo);
    shareButton.addEventListener("click", shareReceipt);
    restartButton.addEventListener("click", () => showSection(builder));
  }

  async function showDemo() {
    track("demo_opened", { source: getSource() });
    demoButton.disabled = true;
    demoButton.textContent = "正在装入示例…";
    try {
      const demoImages = await Promise.all(
        labels.map((_, index) => loadStaticImage(`./samples/memory-${index + 1}.png`)),
      );
      demoImages.forEach((image, index) => {
        images[index] = image;
      });
      showSection(result);
      renderAnimatedPreview(true);
    } finally {
      demoButton.disabled = false;
      demoButton.textContent = "先看10秒成品";
    }
  }

  function loadStaticImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`failed to load ${url}`));
      image.src = url;
    });
  }

  function showSection(section) {
    [hero, builder, result].forEach((item) => {
      item.hidden = item !== section;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadImageFile(input) {
    const index = Number(input.dataset.fileInput);
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      uploadStatus.textContent = "请选择照片文件";
      return;
    }

    try {
      const card = $(`[data-slot="${index}"]`);
      const previewImage = card.querySelector("img");
      const previewUrl = URL.createObjectURL(file);
      await loadPreviewImage(previewImage, previewUrl);

      if (objectUrls[index]) URL.revokeObjectURL(objectUrls[index]);
      objectUrls[index] = previewUrl;
      images[index] = previewImage;

      card.classList.add("has-image");
      card.querySelector(".upload-action").textContent = "更换照片";
      updateUploadState();
    } catch (_error) {
      uploadStatus.textContent = "这张照片暂时无法读取，请换一张试试";
    }
  }

  function loadPreviewImage(image, url) {
    return new Promise((resolve, reject) => {
      image.onload = () => {
        image.onload = null;
        image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        image.onload = null;
        image.onerror = null;
        URL.revokeObjectURL(url);
        reject(new Error("image decode failed"));
      };
      image.src = url;
    });
  }

  function updateUploadState() {
    const count = images.filter(Boolean).length;
    const remaining = images.length - count;
    makeButton.disabled = remaining !== 0;
    uploadStatus.textContent = remaining === 0 ? "5张照片已选好，可以生成了" : `还差${remaining}张照片`;
    if (remaining === 0) track("photos_completed", { source: getSource() });
  }

  function renderAnimatedPreview(restart = false) {
    const token = restart ? Date.now() : 0;
    canvas.dataset.animationToken = String(token);
    const startedAt = performance.now();

    function frame(now) {
      if (canvas.dataset.animationToken !== String(token)) return;
      const elapsed = (now - startedAt) % VIDEO_DURATION;
      renderFrame(ctx, elapsed, canvas.width, canvas.height);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function renderFrame(target, elapsed, width, height) {
    const scale = width / BASE_W;
    target.setTransform(scale, 0, 0, scale, 0, 0);
    target.clearRect(0, 0, BASE_W, BASE_H);

    if (elapsed < INTRO_DURATION) {
      renderIntro(target, easeOut(elapsed / INTRO_DURATION));
      return;
    }

    if (elapsed < PHOTO_SEQUENCE_END) {
      const local = elapsed - INTRO_DURATION;
      const index = Math.min(4, Math.floor(local / PHOTO_DURATION));
      const photoProgress = (local % PHOTO_DURATION) / PHOTO_DURATION;
      renderPhotoMoment(target, index, photoProgress);
      return;
    }

    if (elapsed < OUTRO_START) {
      renderFinalCard(target, Math.min(1, (elapsed - PHOTO_SEQUENCE_END) / 800));
      return;
    }

    renderOutro(target, (elapsed - OUTRO_START) / (VIDEO_DURATION - OUTRO_START));
  }

  function renderIntro(target, t) {
    fillBackground(target, "#ff5b3d");
    target.fillStyle = "rgba(17,17,15,.13)";
    drawOversizedPercent(target, progress.percent.toFixed(1), -50 + t * 48);

    const y = -1450 + easeOut(t) * 1540;
    drawPaper(target, 90, y, 900, 1520);
    target.save();
    target.translate(0, y - 90);
    drawReceiptHeader(target, 150);
    target.fillStyle = "#11110f";
    target.font = "900 164px ui-sans-serif, system-ui";
    target.letterSpacing = "-10px";
    target.fillText(`${progress.percent.toFixed(1)}%`, 132, 490);
    drawBarcode(target, 134, 570, 812, 116);
    drawStatRows(target, 134, 780);
    target.restore();
  }

  function renderPhotoMoment(target, index, t) {
    fillBackground(target, colors[index]);
    drawTexture(target);
    const enter = easeOut(Math.min(1, t * 3.2));
    const exit = t > 0.78 ? 1 - easeIn((t - 0.78) / 0.22) : 1;
    const visibility = Math.max(0, enter * exit);

    target.save();
    target.globalAlpha = visibility;
    const lift = 150 - enter * 150;
    const tilt = [-0.045, 0.035, -0.028, 0.05, -0.035][index];
    target.translate(BASE_W / 2, 840 + lift);
    target.rotate(tilt);
    drawPolaroid(target, index, -380, -590, 760, 1120);
    target.restore();

    target.fillStyle = "#11110f";
    target.font = "900 32px ui-monospace, monospace";
    target.fillText(`0${index + 1} / 05`, 64, 90);
    target.font = "900 72px ui-sans-serif, system-ui";
    target.textAlign = "center";
    target.fillText(labels[index], BASE_W / 2, 1740);
    target.textAlign = "start";
  }

  function renderFinalCard(target, t = 1) {
    fillBackground(target, "#11110f");
    drawTexture(target);
    const y = 50 + (1 - easeOut(t)) * 130;
    drawPaper(target, 54, y, 972, 1808);

    target.save();
    target.translate(0, y - 50);
    drawReceiptHeader(target, 112);

    target.fillStyle = "#11110f";
    target.font = "950 146px ui-sans-serif, system-ui";
    target.fillText(`${progress.percent.toFixed(1)}%`, 96, 385);
    target.font = "800 23px ui-monospace, monospace";
    target.fillText("OF 2026 HAS BEEN USED", 102, 430);

    drawBarcode(target, 100, 472, 880, 74);
    drawPhotoGrid(target, 100, 600);

    target.strokeStyle = "rgba(17,17,15,.48)";
    target.lineWidth = 2;
    target.setLineDash([10, 9]);
    target.beginPath();
    target.moveTo(100, 1494);
    target.lineTo(980, 1494);
    target.stroke();
    target.setLineDash([]);

    target.fillStyle = "#11110f";
    target.font = "900 28px ui-monospace, monospace";
    target.fillText(`已使用 / ${progress.used} DAYS`, 100, 1560);
    target.textAlign = "right";
    target.fillText(`还剩 / ${progress.left} DAYS`, 980, 1560);
    target.textAlign = "center";
    target.font = "950 40px ui-sans-serif, system-ui";
    target.fillText("剩下的日子，你准备怎么花？", BASE_W / 2, 1660);
    target.font = "800 19px ui-monospace, monospace";
    target.fillText("2026 PROGRESS RECEIPT · MAKE YOURS", BASE_W / 2, 1730);
    target.restore();
  }

  function renderOutro(target, t) {
    renderFinalCard(target, 1);
    const reveal = easeOut(Math.min(1, t * 2.4));

    target.save();
    target.globalAlpha = reveal;
    fillBackground(target, "#ff5b3d");
    drawTexture(target);
    target.fillStyle = "rgba(17,17,15,.12)";
    drawOversizedPercent(target, progress.percent.toFixed(1), -40 + reveal * 38);

    target.fillStyle = "#11110f";
    target.textAlign = "center";
    target.font = "900 34px ui-monospace, monospace";
    target.fillText("2026 PROGRESS RECEIPT", BASE_W / 2, 590);
    target.font = "950 92px ui-sans-serif, system-ui";
    target.fillText("剩下的日子", BASE_W / 2, 820);
    target.fillText("你准备怎么花？", BASE_W / 2, 950);

    target.fillStyle = "#dfff4f";
    roundedRect(target, 310, 1080, 460, 94, 47);
    target.fill();
    target.fillStyle = "#11110f";
    target.font = "900 34px ui-sans-serif, system-ui";
    target.fillText("轮到你了", BASE_W / 2, 1142);
    target.textAlign = "left";
    target.restore();
  }

  function drawReceiptHeader(target, y) {
    target.fillStyle = "#11110f";
    target.textAlign = "left";
    target.font = "900 29px ui-monospace, monospace";
    target.fillText("2026 PROGRESS RECEIPT", 102, y);
    target.textAlign = "right";
    target.font = "800 22px ui-monospace, monospace";
    target.fillText(`NO. ${String(progress.used).padStart(3, "0")}`, 978, y);
    target.textAlign = "left";
  }

  function drawStatRows(target, x, y) {
    const rows = [
      ["DAYS USED", `${progress.used}`],
      ["DAYS LEFT", `${progress.left}`],
      ["MEMORIES KEPT", "05"],
    ];
    target.fillStyle = "#11110f";
    rows.forEach((row, index) => {
      target.font = "800 27px ui-monospace, monospace";
      target.textAlign = "left";
      target.fillText(row[0], x, y + index * 72);
      target.textAlign = "right";
      target.font = "900 30px ui-monospace, monospace";
      target.fillText(row[1], 946, y + index * 72);
    });
    target.textAlign = "left";
  }

  function drawPhotoGrid(target, x, y) {
    const gap = 18;
    const smallW = 431;
    const smallH = 330;
    drawPhotoTile(target, 0, x, y, smallW, smallH);
    drawPhotoTile(target, 1, x + smallW + gap, y, smallW, smallH);
    drawPhotoTile(target, 2, x, y + smallH + gap, smallW, smallH);
    drawPhotoTile(target, 3, x + smallW + gap, y + smallH + gap, smallW, smallH);
    drawPhotoTile(target, 4, x, y + (smallH + gap) * 2, smallW * 2 + gap, 210);
  }

  function drawPhotoTile(target, index, x, y, width, height) {
    target.save();
    roundedRect(target, x, y, width, height, 12);
    target.clip();
    if (images[index]) {
      drawImageCover(target, images[index], x, y, width, height);
    } else {
      drawPlaceholder(target, index, x, y, width, height);
    }
    const gradient = target.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0.44, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.78)");
    target.fillStyle = gradient;
    target.fillRect(x, y, width, height);
    target.restore();

    target.fillStyle = "#fff";
    target.font = "900 25px ui-sans-serif, system-ui";
    target.fillText(labels[index], x + 18, y + height - 20);
  }

  function drawPolaroid(target, index, x, y, width, height) {
    target.fillStyle = "#f4f0e6";
    target.fillRect(x, y, width, height);
    const pad = 30;
    const photoH = height - 150;
    if (images[index]) {
      drawImageCover(target, images[index], x + pad, y + pad, width - pad * 2, photoH);
    } else {
      drawPlaceholder(target, index, x + pad, y + pad, width - pad * 2, photoH);
    }
    target.fillStyle = "#11110f";
    target.font = "900 34px ui-monospace, monospace";
    target.fillText(`0${index + 1} — ${labels[index]}`, x + pad, y + height - 54);
  }

  function drawImageCover(target, image, x, y, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const boxRatio = width / height;
    let sourceW = image.naturalWidth;
    let sourceH = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (imageRatio > boxRatio) {
      sourceW = sourceH * boxRatio;
      sourceX = (image.naturalWidth - sourceW) / 2;
    } else {
      sourceH = sourceW / boxRatio;
      sourceY = (image.naturalHeight - sourceH) / 2;
    }
    target.drawImage(image, sourceX, sourceY, sourceW, sourceH, x, y, width, height);
  }

  function drawPlaceholder(target, index, x, y, width, height) {
    const base = colors[index];
    const gradient = target.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, "#11110f");
    target.fillStyle = gradient;
    target.fillRect(x, y, width, height);
    target.globalAlpha = 0.3;
    target.fillStyle = "#fff";
    for (let i = 0; i < 5; i += 1) {
      target.beginPath();
      target.arc(x + width * (0.15 + i * 0.19), y + height * (0.25 + ((i + index) % 3) * 0.2), width * 0.12, 0, Math.PI * 2);
      target.fill();
    }
    target.globalAlpha = 1;
  }

  function fillBackground(target, color) {
    target.fillStyle = color;
    target.fillRect(0, 0, BASE_W, BASE_H);
  }

  function drawPaper(target, x, y, width, height) {
    target.save();
    target.fillStyle = "#f4f0e6";
    target.shadowColor = "rgba(0,0,0,.28)";
    target.shadowBlur = 52;
    target.shadowOffsetY = 22;
    target.fillRect(x, y + 12, width, height - 24);
    target.shadowColor = "transparent";

    const teeth = 18;
    const toothW = width / teeth;
    target.beginPath();
    target.moveTo(x, y + 12);
    for (let i = 0; i <= teeth; i += 1) {
      target.lineTo(x + i * toothW, y + (i % 2 === 0 ? 12 : 0));
    }
    target.lineTo(x + width, y + height - 12);
    for (let i = teeth; i >= 0; i -= 1) {
      target.lineTo(x + i * toothW, y + height - (i % 2 === 0 ? 12 : 0));
    }
    target.closePath();
    target.fill();
    target.restore();
  }

  function drawBarcode(target, x, y, width, height) {
    target.fillStyle = "#11110f";
    const pattern = [6, 3, 2, 4, 8, 3, 5, 2, 9, 4, 3, 3];
    let cursor = x;
    let i = 0;
    while (cursor < x + width) {
      const bar = pattern[i % pattern.length];
      target.fillRect(cursor, y, bar, height);
      cursor += bar + pattern[(i + 4) % pattern.length];
      i += 1;
    }
  }

  function drawOversizedPercent(target, value, y) {
    target.save();
    target.font = "950 330px ui-sans-serif, system-ui";
    target.fillText(`${value}%`, -75, 1850 + y);
    target.restore();
  }

  function drawTexture(target) {
    target.save();
    target.globalAlpha = 0.07;
    target.fillStyle = "#fff";
    for (let y = 0; y < BASE_H; y += 18) {
      for (let x = (y / 18) % 2 === 0 ? 0 : 9; x < BASE_W; x += 28) {
        target.fillRect(x, y, 1.4, 1.4);
      }
    }
    target.restore();
  }

  function roundedRect(target, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(x + r, y);
    target.arcTo(x + width, y, x + width, y + height, r);
    target.arcTo(x + width, y + height, x, y + height, r);
    target.arcTo(x, y + height, x, y, r);
    target.arcTo(x, y, x + width, y, r);
    target.closePath();
  }

  async function saveImage() {
    exportStatus.textContent = "正在生成高清图片…";
    const out = document.createElement("canvas");
    out.width = BASE_W;
    out.height = BASE_H;
    renderFinalCard(out.getContext("2d", { alpha: false }), 1);
    const blob = await canvasToBlob(out, "image/png");
    downloadBlob(blob, `2026-progress-receipt-${progress.used}.png`);
    track("image_saved", { source: getSource() });
    exportStatus.textContent = "高清图片已保存。";
  }

  async function saveVideo() {
    exportStatus.textContent = "正在生成有配乐的 MP4，请不要离开页面…";
    videoButton.disabled = true;
    shareButton.disabled = true;

    try {
      exportStatus.textContent = "正在添加配乐并转换为 MP4…";
      const mp4 = await renderMp4(await createVideoFrames());
      downloadBlob(mp4, `2026-progress-receipt-${progress.used}.mp4`);
      track("video_saved", { format: "mp4", source: getSource() });
      exportStatus.textContent = "有配乐的 MP4 已保存，可以直接发到社交平台。";
    } catch (_error) {
      exportStatus.textContent = "视频生成失败，请先保存高清图片。";
    } finally {
      videoButton.disabled = false;
      shareButton.disabled = false;
      renderAnimatedPreview(true);
    }
  }

  async function createVideoFrames() {
    const moments = [0, 1200, 2300, 3400, 4500, 5600, 7200, 9950];
    const out = document.createElement("canvas");
    out.width = EXPORT_W;
    out.height = EXPORT_H;
    const outContext = out.getContext("2d", { alpha: false });
    const frames = [];
    for (const elapsed of moments) {
      renderFrame(outContext, elapsed, out.width, out.height);
      frames.push(await canvasToBlob(out, "image/jpeg", 0.86));
    }
    return frames;
  }

  async function renderMp4(frames) {
    const formData = new FormData();
    frames.forEach((frame, index) => formData.append("frames", frame, `frame-${index}.jpg`));

    const response = await fetch("/api/render-frames", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("MP4 render failed");
    }

    return response.blob();
  }

  async function shareReceipt() {
    exportStatus.textContent = "正在准备分享图片…";
    const out = document.createElement("canvas");
    out.width = BASE_W;
    out.height = BASE_H;
    renderFinalCard(out.getContext("2d", { alpha: false }), 1);
    const blob = await canvasToBlob(out, "image/png");
    const file = new File([blob], "2026-progress-receipt.png", { type: "image/png" });
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("from", "share");
    shareUrl.hash = "";
    const shareData = {
      title: "我的2026进度小票",
      text: `2026已经使用${progress.percent.toFixed(1)}%，我留下了这5个瞬间。你也来结算一下：`,
      url: shareUrl.toString(),
    };

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        track("receipt_shared", { mode: "file", source: getSource() });
        exportStatus.textContent = "已打开分享面板。";
      } else if (navigator.share) {
        await navigator.share(shareData);
        downloadBlob(blob, `2026-progress-receipt-${progress.used}.png`);
        track("receipt_shared", { mode: "link", source: getSource() });
        exportStatus.textContent = "链接已分享，图片也已保存。";
      } else {
        downloadBlob(blob, `2026-progress-receipt-${progress.used}.png`);
        await copyShareText(shareData);
        track("receipt_shared", { mode: "copy", source: getSource() });
        exportStatus.textContent = "图片已保存，分享文案和链接已复制。";
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        exportStatus.textContent = "已取消分享，图片仍可单独保存。";
      } else {
        downloadBlob(blob, `2026-progress-receipt-${progress.used}.png`);
        exportStatus.textContent = "分享面板未打开，图片已保存。";
      }
    }
  }

  async function copyShareText(data) {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
  }

  function canvasToBlob(target, type, quality) {
    return new Promise((resolve, reject) => {
      target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas export failed"))), type, quality ?? 0.96);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function applyReferralState() {
    if (getSource() !== "share") return;
    $("#referral-note").hidden = false;
    track("share_landing", { source: "share" });
  }

  function getSource() {
    return new URLSearchParams(window.location.search).get("from") || "direct";
  }

  function track(eventName, props = {}) {
    if (typeof window.plausible === "function") {
      window.plausible(eventName, { props });
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...props });
    }
  }

  function easeOut(value) {
    const t = Math.max(0, Math.min(1, value));
    return 1 - Math.pow(1 - t, 3);
  }

  function easeIn(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * t;
  }
})();
