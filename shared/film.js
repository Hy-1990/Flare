import { sceneAt, totalDuration, captionChunks } from "./model.js";
import { getStyle } from "./styles.js";
import { drawImageFilm, drawNativeStyle } from "./style-engines.js";
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const ease = (x) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;
function circle(c, x, y, r, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function line(c, x, y, x2, y2, color, width = 1) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function poly(c, points, fill) {
  c.fillStyle = fill;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function leaf(c, x, y, size, angle, color) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(
    -size * 0.6,
    -size * 0.8,
    size * 0.5,
    -size * 1.1,
    0,
    -size * 1.7,
  );
  c.bezierCurveTo(size * 0.9, -size * 0.8, size * 0.7, -size * 0.2, 0, 0);
  c.fill();
  line(c, 0, -3, 0, -size * 1.4, "#eae3c4", 1.1);
  c.restore();
}
function plant(c, x, y, scale, t, palette) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.rotate(Math.sin(t * 0.7) * 0.025);
  const stem = palette[0];
  line(c, 0, 0, -8, -255, stem, 5);
  for (let i = 0; i < 5; i++) {
    const y = -50 - i * 42,
      dx = i % 2 ? 55 : -58;
    line(c, -i * 1.2, y, dx, y - 20, stem, 3);
    leaf(c, dx, y - 20, 28, dx > 0 ? 1 : -1, palette[1]);
    leaf(c, dx * 0.5, y - 10, 20, dx > 0 ? 0.5 : -0.5, palette[0]);
    circle(c, dx * 0.4, y - 8, 8, palette[2]);
    circle(c, dx * 0.4 + 10, y - 15, 7, palette[2]);
  }
  c.restore();
}
function coffee(c, x, y, s, t, pal) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = pal[0];
  c.lineWidth = 10;
  c.beginPath();
  c.ellipse(75, 0, 35, 42, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = pal[0];
  c.beginPath();
  c.moveTo(-70, -50);
  c.lineTo(70, -50);
  c.lineTo(58, 75);
  c.quadraticCurveTo(0, 106, -58, 75);
  c.closePath();
  c.fill();
  c.fillStyle = pal[1];
  c.beginPath();
  c.ellipse(0, -50, 70, 22, 0, 0, Math.PI * 2);
  c.fill();
  circle(c, 0, -50, 41, pal[2]);
  c.strokeStyle = pal[0];
  c.lineWidth = 2.5;
  for (let j = 0; j < 3; j++) {
    c.beginPath();
    c.moveTo(-26 + j * 26, -90);
    c.bezierCurveTo(
      -55 + j * 26 + Math.sin(t) * 8,
      -120,
      20 + j * 26,
      -140,
      -16 + j * 26,
      -175,
    );
    c.stroke();
  }
  c.restore();
}
function bean(c, x, y, s, a, color) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(0, 0, s * 0.65, s, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#f5e5c8";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -s * 0.8);
  c.bezierCurveTo(-s * 0.5, -s * 0.2, s * 0.5, s * 0.2, 0, s * 0.8);
  c.stroke();
  c.restore();
}
function art(c, kind, t, p, style) {
  const ink = style === "noir" ? "#ece8dc" : "#334b3c",
    sun = p.accent,
    base = style === "noir" ? "#262c27" : "#e6e2cd";
  if (kind === "landscape") {
    circle(c, 260, 90, 64 + Math.sin(t * 0.4) * 2, sun);
    poly(
      c,
      [
        [-80, 300],
        [110, 150],
        [270, 278],
        [420, 120],
        [680, 310],
        [680, 480],
        [-80, 480],
      ],
      style === "noir" ? "#475344" : "#a5b098",
    );
    poly(
      c,
      [
        [-80, 390],
        [80, 258],
        [260, 355],
        [405, 235],
        [650, 400],
        [650, 480],
        [-80, 480],
      ],
      style === "noir" ? "#66705b" : "#71876b",
    );
    poly(
      c,
      [
        [-80, 420],
        [130, 350],
        [300, 400],
        [460, 320],
        [670, 420],
        [670, 480],
        [-80, 480],
      ],
      ink,
    );
    c.save();
    c.translate(Math.sin(t * 0.2) * 6, 0);
    plant(c, 360, 425, 1.05, t, [
      ink,
      style === "noir" ? "#a3ad8a" : "#6f8559",
      sun,
    ]);
    c.restore();
    line(c, 90, 440, 250, 440, style === "noir" ? "#b8bba9" : "#f7edcf", 1);
    for (let i = 0; i < 7; i++)
      line(c, 90 + i * 24, 435, 90 + i * 24, 445, "#c6c7ab");
  } else if (kind === "botanical") {
    circle(c, 300, 230, 180, base);
    plant(c, 300, 400, 1.35, t, [ink, "#798b5d", sun]);
    for (let i = 0; i < 6; i++) {
      circle(c, 90 + i * 76, 445, 3, ink);
    }
  } else if (kind === "coffee") {
    circle(c, 320, 280, 165, base);
    c.save();
    c.translate(0, Math.sin(t * 0.6) * 3);
    coffee(c, 310, 265, 1.35, t, [ink, "#efe3c5", "#9b5f3b"]);
    c.restore();
    for (let i = 0; i < 5; i++)
      bean(
        c,
        100 + i * 94,
        450,
        14 + (i % 2) * 3,
        -0.5 + i * 0.4,
        i === 3 ? sun : ink,
      );
  } else if (kind === "orbit") {
    circle(c, 300, 255, 125, sun);
    c.save();
    c.translate(300, 255);
    c.rotate(-0.4 + t * 0.07);
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 0, 230, 75, 0, 0, Math.PI * 2);
    c.stroke();
    circle(c, 230 * Math.cos(t * 0.8), 75 * Math.sin(t * 0.8), 15, ink);
    c.restore();
    for (let i = 0; i < 5; i++)
      line(c, 130 + i * 76, 440, 130 + i * 76, 448, ink);
  } else if (kind === "city") {
    circle(c, 390, 100, 66, sun);
    for (let i = 0; i < 7; i++) {
      let h = 80 + ((i * 47) % 150),
        x = 40 + i * 76;
      c.fillStyle = i % 2 ? ink : "#879782";
      c.fillRect(x, 410 - h, 61, h);
      for (let r = 0; r < Math.floor(h / 25) - 1; r++)
        for (let j = 0; j < 2; j++) {
          c.fillStyle = "#e8d5a6";
          c.fillRect(x + 12 + j * 25, 425 - h + r * 25, 9, 10);
        }
    }
    line(c, 25, 425, 610, 425, ink, 2);
    c.fillStyle = sun;
    c.fillRect(75 + ((t * 18) % 380), 415, 40, 16);
  } else {
    const values = [0.35, 0.55, 0.44, 0.72, 0.85];
    for (let i = 0; i < 5; i++) {
      const h = 280 * values[i] * ease(t / 2);
      c.fillStyle = i === 4 ? sun : ink;
      c.fillRect(90 + i * 88, 400 - h, 56, h);
      line(c, 90 + i * 88, 420, 146 + i * 88, 420, ink);
    }
    line(c, 65, 400, 565, 400, ink, 2);
  }
}
export function wrapLines(c, text, width, max = 4) {
  const lines = [];
  let line = "";
  for (const char of text) {
    if (char === "\n" || c.measureText(line + char).width > width) {
      lines.push(line);
      line = char === "\n" ? "" : char;
      if (lines.length === max) {
        if (line) lines[max - 1] = lines[max - 1].slice(0, -1) + "…";
        return lines;
      }
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}
export const imageCache = new Map();
export async function preload(p) {
  const urls = [...new Set(p.scenes.map((s) => s.image).filter(Boolean))];
  await Promise.all(
    urls.map(async (u) => {
      if (imageCache.has(u)) return;
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(Error("无法读取镜头图片"));
        img.src = u;
      });
      imageCache.set(u, img);
    }),
  );
}
export function drawFilm(canvas, p, t, { thumbnail = false } = {}) {
  const c = canvas.getContext("2d");
  if (!c || !p.scenes.length) return;
  const W = canvas.width,
    H = canvas.height,
    vertical = H > W,
    square = H === W;
  const {
    scene: s,
    index,
    local,
  } = sceneAt(p, Math.min(t, totalDuration(p) - 0.001));
  const definition = getStyle(p.style);
  if (!definition) throw Error("未知风格");
  const image = s.image && imageCache.get(s.image);
  if (definition.mode === "image") {
    drawImageFilm(canvas, p, t, definition, image, thumbnail);
    return;
  }
  if (drawNativeStyle(canvas, p, t, definition, image, thumbnail)) return;
  const style = definition.engine;
  const dark = style === "noir",
    blue = style === "blueprint",
    bg = blue ? "#17395e" : dark ? "#191e1b" : "#f2ebd9",
    ink = blue ? "#e2e9e7" : dark ? "#ede8db" : "#283e34";
  c.save();
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // Work in a fixed design coordinate space; adapt composition rather than crop it.
  const dw = vertical ? 720 : square ? 1080 : 1280,
    dh = vertical ? 1280 : square ? 1080 : 720;
  c.scale(W / dw, H / dh);
  if (blue) {
    c.strokeStyle = "#ffffff0c";
    c.lineWidth = 1;
    for (let x = 0; x < dw; x += 32) {
      line(c, x, 0, x, dh, "#ffffff0c");
    }
    for (let y = 0; y < dh; y += 32) line(c, 0, y, dw, y, "#ffffff0c");
    c.strokeStyle = "#e2e9e744";
    c.strokeRect(28, 28, dw - 56, dh - 56);
  }
  const margin = vertical ? 52 : 64,
    top = vertical ? 100 : 80;
  c.fillStyle = blue ? "#9db9cd" : dark ? "#aeb7a6" : "#68755c";
  c.font = `${vertical ? 17 : 14}px monospace`;
  c.fillText(
    `${String(index + 1).padStart(2, "0")} / ${String(p.scenes.length).padStart(2, "0")}    ${blue ? "STUDY" : dark ? "A SHORT STORY" : "FIELD NOTES"}`,
    margin,
    top,
  );
  const intro = ease(local / 0.8);
  c.globalAlpha = intro;
  const titleSize = vertical ? 48 : square ? 62 : 58;
  const textWidth = vertical ? dw - margin * 2 : square ? dw - 140 : 470;
  c.fillStyle = ink;
  c.font = `500 ${titleSize}px ${FONT}`;
  const balancedTitle =
    c.measureText(s.title).width > textWidth && s.title.includes("，")
      ? s.title.replace("，", "，\n")
      : s.title;
  const titleLines = wrapLines(c, balancedTitle, textWidth, 3),
    titleY = vertical ? top + 76 : square ? top + 92 : top + 105;
  titleLines.forEach((l, i) =>
    c.fillText(l, margin, titleY + i * (titleSize * 1.25) + (1 - intro) * 12),
  );
  const ruleY = titleY + titleLines.length * titleSize * 1.25 + 16;
  line(c, margin, ruleY, margin + 48, ruleY, s.accent, 3);
  if (!thumbnail) {
    c.fillStyle = blue ? "#b7cadd" : dark ? "#b1baa9" : "#69745d";
    c.font = `${vertical ? 22 : 19}px ${FONT}`;
    const caption = wrapLines(c, s.visual, textWidth, vertical ? 2 : 3);
    caption.forEach((l, i) => c.fillText(l, margin, ruleY + 40 + i * 31));
  }
  c.globalAlpha = 1;
  const artX = vertical ? 52 : square ? 230 : 640,
    artY = vertical ? 480 : square ? 390 : 95,
    artScale = vertical ? 1.01 : square ? 1.16 : 0.96;
  c.save();
  c.translate(artX, artY);
  c.scale(artScale, artScale);
  c.translate(0, (1 - intro) * 8);
  const img = s.image && imageCache.get(s.image);
  if (img) {
    const x = 20,
      y = 10,
      w = 540,
      h = 440,
      sc =
        Math.max(w / img.width, h / img.height) *
        (1 + (0.035 * local) / s.duration);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.drawImage(
      img,
      x + (w - img.width * sc) / 2,
      y + (h - img.height * sc) / 2,
      img.width * sc,
      img.height * sc,
    );
    c.restore();
  } else if (blue) {
    c.strokeStyle = "#d2e5ef";
    c.lineWidth = 2;
    // Technical drawing with an explicitly procedural construction reveal.
    c.save();
    c.beginPath();
    c.rect(0, 0, 640, Math.max(60, ease(local / 1.6) * 530));
    c.clip();
    c.save();
    c.translate(300, 265);
    c.rotate(local * 0.035);
    for (let ring = 0; ring < 3; ring++) {
      c.beginPath();
      c.ellipse(0, 0, 100 + ring * 60, 100 + ring * 60, 0.1, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 12; i++) {
      let a = (i * Math.PI) / 6;
      line(
        c,
        Math.cos(a) * 80,
        Math.sin(a) * 80,
        Math.cos(a) * 225,
        Math.sin(a) * 225,
        "#a9cce0",
        1,
      );
    }
    c.restore();
    if (s.art === "coffee")
      coffee(c, 300, 265, 0.9, local, ["#c3dbe6", "#315678", "#152e49"]);
    else if (s.art === "botanical" || s.art === "landscape")
      plant(c, 300, 380, 0.8, local, ["#c8dfe5", "#3e6481", "#db805d"]);
    line(c, 60, 480, 540, 480, "#c2dce8");
    for (let i = 0; i < 7; i++)
      line(c, 60 + i * 80, 474, 60 + i * 80, 486, "#c2dce8");
    line(c, 80, 90, 210, 90, "#c2dce8");
    line(c, 210, 90, 240, 135, "#c2dce8");
    c.fillStyle = "#bed6e2";
    c.font = "13px monospace";
    c.fillText("FIG. " + String(index + 1).padStart(2, "0"), 80, 78);
    c.fillText("480", 280, 505);
    c.restore();
  } else art(c, s.art, local, s, style);
  c.restore();
  // Narration captions are rendered in exactly the same place in preview/export.
  if (!thumbnail && s.narration) {
    const subWidth = dw - margin * 2,
      subY = dh - (vertical ? 130 : 94);
    c.font = `${vertical ? 24 : 21}px ${FONT}`;
    const chunks = captionChunks(s.narration, p.aspect),
      chunk =
        chunks[
          Math.min(
            chunks.length - 1,
            Math.floor((local / s.duration) * chunks.length),
          )
        ] || "";
    const sub = wrapLines(c, chunk, subWidth - 40, 2);
    c.fillStyle = blue ? "#112b48" : dark ? "#111713" : "#e7dfca";
    c.fillRect(margin, subY - 28, subWidth, sub.length * 31 + 24);
    c.fillStyle = ink;
    sub.forEach((l, i) => c.fillText(l, margin + 20, subY + i * 31));
  }
  c.fillStyle = blue ? "#94b3c8" : dark ? "#a9b39e" : "#6c775f";
  c.font = "12px monospace";
  c.fillText("FLARE / " + p.title.slice(0, 30), margin, dh - 28);
  c.textAlign = "right";
  c.fillText(
    `${String(Math.floor(t)).padStart(2, "0")}s / ${Math.round(totalDuration(p))}s`,
    dw - margin,
    dh - 28,
  );
  c.restore();
}
