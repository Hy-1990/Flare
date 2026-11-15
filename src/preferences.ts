import { useSyncExternalStore } from "react";
import english from "./en.json";
export type Language = "zh" | "en";
export type Appearance = "system" | "light" | "dark";
type Preferences = { language: Language; appearance: Appearance };
const storageKey = "flare.ui";
function read(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      language: p.language === "en" ? "en" : "zh",
      appearance: ["light", "dark"].includes(p.appearance)
        ? p.appearance
        : "system",
    };
  } catch {
    return { language: "zh", appearance: "system" };
  }
}
let value = read();
const listeners = new Set<() => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");
function apply() {
  const dark =
    value.appearance === "dark" ||
    (value.appearance === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.lang = value.language === "en" ? "en" : "zh-CN";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.title =
    value.language === "en" ? "Flare — Film editor" : "Flare · 影像创作台";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#18191b" : "#f4f4f2");
}
export function setPreferences(p: Partial<Preferences>) {
  value = { ...value, ...p };
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* Preferences still work for this session. */
  }
  apply();
  listeners.forEach((fn) => fn());
}
media.addEventListener("change", () => {
  apply();
  listeners.forEach((fn) => fn());
});
window.addEventListener("storage", (e) => {
  if (e.key === storageKey) {
    value = read();
    apply();
    listeners.forEach((fn) => fn());
  }
});
apply();
export function usePreferences() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => value,
  );
}
export function t(key: string, params: Record<string, string | number> = {}) {
  const template =
    value.language === "en"
      ? ((english as Record<string, string>)[key] ?? key)
      : key;
  return template.replace(/\{(\d+|[a-zA-Z]+)\}/g, (match, k) =>
    Object.hasOwn(params, k) ? String(params[k]) : match,
  );
}
export function styleName(s: any) {
  return value.language === "en" ? s?.en || s?.name || "" : s?.name || "";
}
export function categoryName(c: any) {
  return value.language === "en"
    ? c?.en || c?.categoryEn || c?.name || ""
    : c?.name || c?.categoryName || "";
}
export function styleDescription(s: any) {
  return value.language === "en" ? s.descEn || s.desc : s.desc;
}
export function errorText(message: string) {
  if (value.language === "zh" || !/[\u3400-\u9fff]/.test(message))
    return message;
  const missing = message.match(
    /^当前风格使用图片辅助制作，(\d+) 个镜头尚未添加图片：(.*)$/s,
  );
  if (missing)
    return `This style requires images. ${missing[1]} shots still need an image: ${missing[2]}`;
  const voice = message.match(
    /^镜头「(.*)」的配音长于镜头，请延长镜头或缩短旁白$/s,
  );
  if (voice)
    return `Voice exceeds the duration of “${voice[1]}”. Extend the shot or shorten the narration.`;
  if (message.startsWith("输入格式不正确："))
    return `Invalid input: ${message.slice(8)}`;
  return (
    (english as Record<string, string>)[message] ||
    `Request could not be completed. ${message}`
  );
}
