import { sceneAt, totalDuration, captionChunks } from "./model.js";
const SANS = '"PingFang SC","Microsoft YaHei",sans-serif',
  MONO = '"SFMono-Regular",Consolas,monospace';
const clamp = (x) => Math.max(0, Math.min(1, x)),
  smooth = (x) => 1 - (1 - clamp(x)) ** 3;
function line(c, pts, color, width = 2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function circle(c, x, y, r, color, stroke = false, width = 2) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c[stroke ? "strokeStyle" : "fillStyle"] = color;
  c.lineWidth = width;
  stroke ? c.stroke() : c.fill();
}
function text(
  c,
  value,
  x,
  y,
  width,
  size,
  color,
  { font = SANS, max = 3, stroke = false } = {},
) {
  c.font = `500 ${size}px ${font}`;
  c.fillStyle = c.strokeStyle = color;
  c.lineWidth = Math.max(1, size / 24);
  let row = "",
    n = 0;
  for (const ch of value) {
    if (c.measureText(row + ch).width > width || ch === "\n") {
      stroke
        ? c.strokeText(row, x, y + n * size * 1.35)
        : c.fillText(row, x, y + n * size * 1.35);
      row = ch === "\n" ? "" : ch;
      n++;
      if (n >= max) return;
    } else row += ch;
  }
  if (row && n < max)
    stroke
      ? c.strokeText(row, x, y + n * size * 1.35)
      : c.fillText(row, x, y + n * size * 1.35);
}
function frame(c, W, H, bg) {
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
}
// Dry chalk leaves irregular pigment deposits in the stroke itself. Anchor
// the grain to board coordinates so seeking/re-rendering never makes it crawl.
function chalkGrain(c, W, H, dw, dh) {
  const pixels = c.getImageData(0, 0, W, H),
    d = pixels.data;
  for (let y = 0; y < H; y++) {
    const by = Math.floor((y * dh) / H);
    for (let x = 0; x < W; x++) {
      const at = (y * W + x) * 4;
      if (Math.max(d[at], d[at + 1], d[at + 2]) < 110) continue;
      const bx = Math.floor((x * dw) / W);
      let hash = Math.imul(bx + 17, 374761393) ^ Math.imul(by + 31, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const grain = (hash >>> 0) / 4294967296;
      const pressure = 0.78 + 0.22 * Math.sin(bx * 0.09 + by * 0.13);
      const pigment = grain < 0.17 ? 0 : (0.48 + grain * 0.52) * pressure;
      d[at] = 32 + (d[at] - 32) * pigment;
      d[at + 1] = 59 + (d[at + 1] - 59) * pigment;
      d[at + 2] = 48 + (d[at + 2] - 48) * pigment;
    }
  }
  c.putImageData(pixels, 0, 0);
}
function captions(c, p, s, local, W, H, dark, thumbnail) {
  if (thumbnail || !s.narration) return;
  const parts = captionChunks(s.narration, p.aspect),
    part =
      parts[
        Math.min(
          parts.length - 1,
          Math.floor((local / s.duration) * parts.length),
        )
      ];
  const m = 48,
    size = H > W ? 24 : 22;
  c.fillStyle = dark ? "#0b0f12dc" : "#f6f4eced";
  c.fillRect(m, H - 120, W - m * 2, 76);
  text(
    c,
    part,
    m + 20,
    H - 89,
    W - m * 2 - 40,
    size,
    dark ? "#f6f5ed" : "#26352c",
    { max: 2 },
  );
}
function cover(c, img, x, y, w, h, zoom = 1) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.drawImage(
    img,
    x + (w - img.width * scale) / 2,
    y + (h - img.height * scale) / 2,
    img.width * scale,
    img.height * scale,
  );
  c.restore();
}
export function drawImageFilm(canvas, p, t, style, img, thumbnail) {
  const c = canvas.getContext("2d"),
    {
      scene: s,
      index,
      local,
    } = sceneAt(p, Math.min(t, totalDuration(p) - 0.001)),
    W = canvas.width,
    H = canvas.height,
    dw = H > W ? 720 : H === W ? 1080 : 1280,
    dh = H > W ? 1280 : H === W ? 1080 : 720;
  c.save();
  c.scale(W / dw, H / dh);
  frame(c, dw, dh, "#202522");
  if (img) {
    cover(c, img, 0, 0, dw, dh, 1 + (0.045 * local) / s.duration);
    const shade = c.createLinearGradient(0, 0, 0, dh);
    shade.addColorStop(0, "#00000070");
    shade.addColorStop(0.4, "#00000000");
    shade.addColorStop(1, "#00000090");
    c.fillStyle = shade;
    c.fillRect(0, 0, dw, dh);
  } else {
    c.strokeStyle = "#a9b2a433";
    c.strokeRect(32, 32, dw - 64, dh - 64);
    text(
      c,
      "先为这个镜头添加图片",
      52,
      dh * 0.42,
      dw - 104,
      dh > dw ? 38 : 42,
      "#e1e7db",
      { max: 2 },
    );
    if (!thumbnail)
      text(
        c,
        "导入自己的素材，或使用 DreamAPI 生成画面",
        52,
        dh * 0.42 + 96,
        dw - 104,
        22,
        "#9da998",
        { max: 3 },
      );
  }
  text(
    c,
    `${String(index + 1).padStart(2, "0")} / ${p.scenes.length}   ${style.name}`,
    48,
    52,
    dw - 96,
    16,
    "#f1f3ed",
    { max: 1 },
  );
  if (img && !thumbnail)
    text(c, s.title, 48, dh - 170, dw - 96, dh > dw ? 34 : 32, "#fff", {
      max: 2,
    });
  captions(c, p, s, local, dw, dh, true, thumbnail);
  c.restore();
}
export function drawNativeStyle(canvas, p, t, style, img, thumbnail) {
  const engine = style.engine;
  if (
    ![
      "whiteboard",
      "chalkboard",
      "swiss",
      "pixel",
      "terminal",
      "neon",
      "transit",
    ].includes(engine)
  )
    return false;
  const c = canvas.getContext("2d"),
    {
      scene: s,
      index,
      local,
    } = sceneAt(p, Math.min(t, totalDuration(p) - 0.001)),
    W = canvas.width,
    H = canvas.height,
    dw = H > W ? 720 : H === W ? 1080 : 1280,
    dh = H > W ? 1280 : H === W ? 1080 : 720,
    vertical = dh > dw,
    progress = smooth(local / 2),
    margin = 52;
  c.save();
  c.scale(W / dw, H / dh);
  const dark = ["chalkboard", "pixel", "terminal", "neon"].includes(engine),
    bg = {
      whiteboard: "#fafbf7",
      chalkboard: "#203b30",
      swiss: "#f1efe5",
      pixel: "#142834",
      terminal: "#07150d",
      neon: "#14131a",
      transit: "#f4f1e6",
    }[engine],
    ink = dark ? "#edf1dc" : "#202a28";
  frame(c, dw, dh, bg);
  const midY = vertical ? dh * 0.54 : dh * 0.49,
    usableH = dh - 240;
  if (engine === "whiteboard" || engine === "chalkboard") {
    const chalk = engine === "chalkboard",
      color = chalk ? "#e3e5ce" : "#263a35";
    c.strokeStyle = chalk ? "#c7c9a833" : "#b4b9ac";
    c.lineWidth = 6;
    c.strokeRect(20, 20, dw - 40, dh - 40);
    if (chalk) {
      c.fillStyle = "#e9edd80b";
      for (let i = 0; i < 650; i++)
        c.fillRect((i * 73.7) % dw, (i * i * 19.3) % dh, 2, 1);
    }
    text(c, s.title, margin, 96, dw - margin * 2, vertical ? 40 : 48, color, {
      font: `"Kaiti SC","KaiTi",${SANS}`,
      max: 2,
    });
    const nodes = p.scenes.slice(0, 5),
      nodeY = midY + 32,
      nodeGap = vertical
        ? 104
        : Math.min(205, (dw - 160) / Math.max(1, nodes.length)),
      x0 = vertical ? dw / 2 : 100;
    c.save();
    c.beginPath();
    c.rect(40, 170, (dw - 80) * progress, usableH);
    c.clip();
    nodes.forEach((n, i) => {
      const x = vertical ? x0 : x0 + i * nodeGap,
        y = vertical ? 260 + i * 95 : nodeY;
      circle(c, x, y, 28, color, true, chalk ? 3.5 : 3);
      text(c, String(i + 1), x - 8, y + 8, 30, 23, color, { max: 1 });
      if (i < nodes.length - 1)
        line(
          c,
          vertical
            ? [
                [x, y + 30],
                [x, y + 65],
                [x - 6, y + 56],
                [x, y + 65],
                [x + 6, y + 56],
              ]
            : [
                [x + 30, y],
                [x + nodeGap - 35, y],
                [x + nodeGap - 45, y - 6],
                [x + nodeGap - 35, y],
                [x + nodeGap - 45, y + 6],
              ],
          i === index ? s.accent : color,
          3,
        );
      text(
        c,
        n.title,
        vertical ? x + 50 : x - 32,
        vertical ? y + 5 : y + 60,
        vertical ? dw / 2 - 80 : nodeGap - 30,
        vertical ? 22 : 20,
        color,
        { max: 2 },
      );
    });
    c.restore();
    circle(
      c,
      48 + (dw - 96) * progress,
      vertical ? midY : nodeY + 110,
      5,
      s.accent,
    );
    line(
      c,
      [
        [48 + (dw - 96) * progress, vertical ? midY : nodeY + 110],
        [64 + (dw - 96) * progress, vertical ? midY - 36 : nodeY + 74],
      ],
      chalk ? "#d6dac1" : "#668775",
      12,
    );
    if (chalk) chalkGrain(c, W, H, dw, dh);
  } else if (engine === "swiss") {
    const red = "#d64b32";
    line(
      c,
      [
        [margin, 32],
        [dw - margin, 32],
      ],
      "#222b27",
      1,
    );
    text(
      c,
      "FLARE / " + String(index + 1).padStart(2, "0"),
      margin,
      60,
      dw - 100,
      17,
      "#222b27",
      { font: MONO, max: 1 },
    );
    text(
      c,
      s.title,
      margin,
      vertical ? 156 : 145,
      vertical ? dw - 104 : dw * 0.56,
      vertical ? 64 : 80,
      "#161d19",
      { max: 3 },
    );
    const radius = vertical ? 150 : 145,
      x = vertical ? dw * 0.55 : dw * 0.79,
      y = vertical ? dh * 0.56 : dh * 0.48;
    circle(c, x + (1 - progress) * 80, y, radius, red);
    c.fillStyle = "#1e2821";
    c.fillRect(
      vertical ? 70 : dw * 0.55,
      vertical ? dh * 0.71 : dh * 0.72,
      (vertical ? dw * 0.65 : dw * 0.36) * progress,
      22,
    );
    c.save();
    c.translate(x, y);
    c.rotate(local * 0.08);
    line(
      c,
      [
        [-radius * 0.75, 0],
        [radius * 0.75, 0],
      ],
      "#f0e8ce",
      2,
    );
    line(
      c,
      [
        [0, -radius * 0.75],
        [0, radius * 0.75],
      ],
      "#f0e8ce",
      2,
    );
    c.restore();
  } else if (engine === "pixel") {
    const scale = 4,
      pw = Math.ceil(dw / scale),
      ph = Math.ceil(dh / scale);
    c.save();
    c.scale(scale, scale);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#4c6971";
    for (let i = 0; i < pw; i += 8) {
      const h =
        28 +
        Math.floor(Math.sin(i * 0.03) * 18) +
        Math.floor(Math.sin(i * 0.08) * 8);
      c.fillRect(i, ph * 0.5 - h, 8, ph * 0.5 + h);
    }
    c.fillStyle = "#6e845e";
    c.fillRect(0, ph * 0.62, pw, ph * 0.38);
    c.fillStyle = "#334c42";
    for (let i = 0; i < pw; i += 8)
      c.fillRect(i, ph * 0.62 + (i % 5), 8, ph * 0.38);
    c.fillStyle = "#b59d6b";
    c.fillRect(0, ph * 0.72, pw, 12);
    const px = 18 + (local / s.duration) * (pw - 55),
      py = Math.floor(ph * 0.72) - 12;
    c.fillStyle = "#d9b58c";
    c.fillRect(Math.floor(px) + 2, py, 7, 7);
    c.fillStyle = "#d86c48";
    c.fillRect(Math.floor(px), py + 7, 11, 10);
    c.fillStyle = "#26363b";
    const step = Math.floor(local * 5) % 2;
    c.fillRect(Math.floor(px) + (step ? 0 : 3), py + 17, 4, 5);
    c.fillRect(Math.floor(px) + (step ? 7 : 6), py + 17, 4, 5);
    c.fillStyle = "#d4c587";
    for (let i = 0; i < 6; i++) c.fillRect(22 + i * 39, ph * 0.68, 2, 2);
    c.restore();
    c.fillStyle = "#162c36ed";
    c.fillRect(28, 32, dw - 56, vertical ? 190 : 150);
    c.strokeStyle = "#c3d1b0";
    c.lineWidth = 3;
    c.strokeRect(28, 32, dw - 56, vertical ? 190 : 150);
    text(c, s.title, 52, 94, dw - 104, vertical ? 38 : 40, "#eef0d8", {
      font: MONO,
      max: 2,
    });
  } else if (engine === "terminal") {
    const green = "#8dcf8c";
    const prefix = `FLARE OS / STORY ${String(index + 1).padStart(2, "0")}\n> ${s.title}\n\n`;
    const lines = (prefix + s.visual)
      .slice(0, Math.floor(local * 40) + 4)
      .split("\n");
    let y = 72;
    for (const row of lines) {
      text(c, row, 48, y, dw - 96, vertical ? 24 : 27, green, {
        font: MONO,
        max: 3,
      });
      y += vertical ? 48 : 44;
    }
    c.font = `${vertical ? 19 : 22}px ${MONO}`;
    c.fillStyle = "#70b47a";
    const pattern = [
      "      .        +       .",
      "   .     /\\      .",
      "        /  \\    +",
      "       /____\\",
      "      |  []  |",
      "______|______|______",
    ];
    pattern.forEach((r, i) =>
      c.fillText(r, Math.max(48, dw * 0.35), midY + i * 30),
    );
    c.fillStyle = "#b2e7a0";
    if (Math.floor(local * 2) % 2 === 0)
      c.fillRect(48, Math.min(y + 16, midY - 30), 14, 24);
    for (let sy = 0; sy < dh; sy += 4) {
      c.fillStyle = "#00000026";
      c.fillRect(0, sy, dw, 1);
    }
  } else if (engine === "neon") {
    c.strokeStyle = "#39333b";
    c.lineWidth = 2;
    c.strokeRect(30, 30, dw - 60, dh - 60);
    text(
      c,
      s.title,
      margin,
      vertical ? 170 : 132,
      dw - margin * 2,
      vertical ? 52 : 64,
      "#f3bfa4",
      { stroke: true, max: 2 },
    );
    c.save();
    c.shadowColor = s.accent;
    c.shadowBlur = 14;
    c.lineWidth = 8;
    c.strokeStyle = s.accent;
    const cx = dw / 2,
      cy = midY + 24;
    c.beginPath();
    c.arc(
      cx,
      cy,
      vertical ? 150 : 155,
      -Math.PI * 0.75,
      -Math.PI * 0.75 + Math.PI * 1.8 * progress,
    );
    c.stroke();
    line(
      c,
      [
        [cx - 80, cy + 15],
        [cx, cy - 90],
        [cx + 80, cy + 15],
      ],
      "#99b8a2",
      6,
    );
    line(
      c,
      [
        [cx - 90, cy + 75],
        [cx + 90, cy + 75],
      ],
      "#d7b365",
      6,
    );
    c.restore();
  } else if (engine === "transit") {
    text(
      c,
      s.title,
      margin,
      92,
      dw - margin * 2,
      vertical ? 42 : 48,
      "#283832",
      { max: 2 },
    );
    text(
      c,
      "叙事线路示意 / Story route",
      margin,
      vertical ? 190 : 175,
      dw - 104,
      16,
      "#6f7869",
      { font: MONO, max: 1 },
    );
    const colors = ["#c45b3e", "#4d7f83", "#b29a50"],
      nodes = p.scenes.slice(0, 12),
      positions = nodes.map((n, i) =>
        vertical
          ? [
              170 + (i % 2) * 140,
              280 +
                i * Math.min(65, (dh - 520) / Math.max(1, nodes.length - 1)),
            ]
          : [
              100 + (i * (dw - 200)) / Math.max(1, nodes.length - 1),
              midY + Math.sin(i * 0.9) * 85,
            ],
      );
    c.save();
    c.beginPath();
    c.rect(0, 0, dw * progress, dh);
    c.clip();
    for (let k = 0; k < 2; k++)
      line(
        c,
        positions.map(([x, y]) => [x + k * 24, y + k * 30]),
        colors[k],
        10,
      );
    positions.forEach(([x, y], i) => {
      circle(c, x, y, 12, "#fff");
      circle(c, x, y, 12, colors[0], true, 4);
      if (i === index) circle(c, x, y, 19, s.accent, true, 2);
      text(
        c,
        nodes[i].title,
        x - 24,
        y + 43,
        vertical ? 200 : 160,
        18,
        "#33483b",
        { max: 2 },
      );
    });
    c.restore();
  }
  if (img)
    cover(
      c,
      img,
      dw * 0.55,
      dh * 0.3,
      dw * 0.35,
      dh * 0.37,
      1 + (0.02 * local) / s.duration,
    );
  captions(c, p, s, local, dw, dh, dark, thumbnail);
  c.restore();
  return true;
}
