import catalog from "./style-catalog.json" with { type: "json" };
export const LEGACY_STYLES = [
  {
    id: "paper",
    name: "纸上叙事",
    en: "Paper narrative",
    desc: "剪纸的层次，温暖的色彩。让故事在纸上发生。",
    color: "#e56643",
    origin: "flare",
    mode: "native",
    engine: "paper",
    category: "flare",
  },
  {
    id: "blueprint",
    name: "工程蓝图",
    en: "Blueprint",
    desc: "精确的线条与标注，把复杂的事情讲清楚。",
    color: "#4564ac",
    origin: "flare",
    mode: "native",
    engine: "blueprint",
    category: "flare",
  },
  {
    id: "noir",
    name: "光影纪事",
    en: "Light & shadow",
    desc: "克制的构图、鲜明的对比，让每一帧有分量。",
    color: "#606a58",
    origin: "flare",
    mode: "native",
    engine: "noir",
    category: "flare",
  },
];
export const UPSTREAM_STYLES = catalog.styles;
export const CATEGORIES = catalog.categories;
export const STYLE_SOURCE = catalog.source;
export const STYLES = [...LEGACY_STYLES, ...UPSTREAM_STYLES];
export const STYLE_IDS = STYLES.map((s) => s.id);
const byId = new Map(STYLES.map((s) => [s.id, s]));
export function getStyle(id) {
  return byId.get(id);
}
export function needsImages(id) {
  return getStyle(id)?.mode === "image";
}
export function missingShotImages(p) {
  return needsImages(p.style) ? p.scenes.filter((s) => !s.image) : [];
}
export function capability(s) {
  return s.mode === "image" ? "图片辅助" : "程序动画基础版";
}
export function findStyles({
  query = "",
  category = "all",
  mode = "all",
  origin = "upstream",
} = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return STYLES.filter(
    (s) =>
      (origin === "all" || s.origin === origin) &&
      (category === "all" || s.category === category) &&
      (mode === "all" || s.mode === mode) &&
      terms.every((q) =>
        [
          s.name,
          s.en,
          s.slug || "",
          s.categoryName || "",
          s.categoryEn || "",
          s.desc,
          ...(s.uses || []),
          ...(s.aliases || []),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q),
      ),
  );
}
