import {
  t as tr,
  usePreferences,
  styleName,
  categoryName,
  styleDescription,
} from "./preferences";
import React, { useEffect, useState } from "react";
import {
  Search,
  ArrowUpRight,
  Check,
  ChevronRight,
  Layers3,
  ExternalLink,
  ImagePlus,
  Clapperboard,
  LoaderCircle,
  AlertCircle,
  Copy,
  FileText,
} from "lucide-react";
import {
  UPSTREAM_STYLES,
  LEGACY_STYLES,
  CATEGORIES,
  STYLE_SOURCE,
  findStyles,
  getStyle,
  capability,
} from "../shared/styles.js";
import type { Project, Style } from "./types";
import Modal from "./Modal";
import { api } from "./api";

export function StylePicker({
  value,
  onChange,
}: {
  value: Style;
  onChange: (s: Style) => void;
}) {
  const selected = getStyle(value) as any;
  return (
    <div className="style-picker">
      <label className="field">
        {tr("视觉风格")}
        <select
          aria-label={tr("视觉风格")}
          value={value}
          onChange={(e) => onChange(e.target.value as Style)}
        >
          <optgroup label={tr("Flare 内置")}>
            {LEGACY_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {styleName(s)}
                {tr("· 程序动画")}
              </option>
            ))}
          </optgroup>
          {CATEGORIES.map((c) => (
            <optgroup label={categoryName(c)} key={c.id}>
              {UPSTREAM_STYLES.filter((s) => s.category === c.id).map((s) => (
                <option value={s.id} key={s.id}>
                  {styleName(s)} ·{" "}
                  {s.mode === "image" ? tr("图片辅助") : tr("程序基础版")}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="field-hint">
        {selected?.mode === "image"
          ? tr(
              "此风格使用风格图片、运镜和字幕制作。每个镜头需要导入或生成图片后才能导出，不是原样片的完整程序引擎。",
            )
          : selected?.origin === "upstream"
            ? tr(
                "程序动画基础版：可直接预览与导出，保留该风格的基本视觉特征；不等同原样片的完整制作效果。",
              )
            : tr("使用 Flare 原创程序动画，无需图片或模型密钥。")}
      </p>
    </div>
  );
}
function Poster({ style, className = "" }: { style: any; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className={`poster-fallback ${className}`}
      style={{ background: style.color }}
    >
      <Layers3 />
      <span>{styleName(style)}</span>
      <small>{tr("样片缩略图暂不可用")}</small>
    </div>
  ) : (
    <img
      className={className}
      src={`/api/styles/${style.slug}/poster.jpg`}
      alt={tr("{0} · 原项目样片参考", { 0: styleName(style) })}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
function StyleDetail({
  style,
  project,
  onClose,
  onApply,
  onCreate,
}: {
  style: any;
  project?: Project;
  onClose: () => void;
  onApply: (id: Style) => Promise<boolean>;
  onCreate: (id: Style) => void;
}) {
  const [guide, setGuide] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [video, setVideo] = useState(false),
    [copied, setCopied] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (style.origin !== "upstream") return;
    const controller = new AbortController();
    setGuide(null);
    setError("");
    api(`/api/styles/${style.slug}/guide`, { signal: controller.signal })
      .then(setGuide)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [style.id, retry]);
  return (
    <Modal title={styleName(style)} wide onClose={onClose}>
      <div className="style-detail">
        <div className="detail-reference">
          {style.origin === "upstream" ? (
            video ? (
              <video
                controls
                playsInline
                preload="none"
                poster={`/api/styles/${style.slug}/poster.jpg`}
                src={style.sampleUrl}
              />
            ) : (
              <>
                <Poster style={style} />
                <button
                  className="button reference-play"
                  onClick={() => setVideo(true)}
                >
                  <Clapperboard />
                  {tr("观看原样片")}
                </button>
              </>
            )
          ) : (
            <div
              className="legacy-detail-preview"
              style={{ background: style.color }}
            >
              <Layers3 />
              <span>{styleName(style)}</span>
              <small>{tr("Flare 原创程序动画")}</small>
            </div>
          )}
          <span className="reference-label">
            {style.origin === "upstream"
              ? tr("原项目样片参考 · 不是你的成片预览")
              : tr("Flare 内置风格")}
          </span>
        </div>
        <div className="detail-body">
          <div className="detail-title">
            <div>
              <span className="detail-category">
                {style.categoryName
                  ? categoryName({
                      name: style.categoryName,
                      en: style.categoryEn,
                    })
                  : tr("Flare 内置")}{" "}
                {style.num ? `/ ${String(style.num).padStart(2, "0")}` : ""}
              </span>
              <h3>{style.en}</h3>
            </div>
            <span
              className={`support-tag ${style.mode === "native" ? "native" : ""}`}
            >
              {tr(capability(style))}
            </span>
          </div>
          <div className="production-contract">
            <div>
              {style.mode === "image" ? <ImagePlus /> : <Clapperboard />}
              <strong>{tr("在 Flare 中如何制作")}</strong>
            </div>
            <p>
              {style.origin === "flare"
                ? tr("可直接使用内置程序动画制作。")
                : style.mode === "native"
                  ? tr(
                      "使用程序动画基础版，可直接预览和导出。保留基本材质与运动语言，不承诺复现原样片的所有效果。",
                    )
                  : tr(
                      "使用该风格的图片辅助制作：为每个镜头导入图片或用 DreamAPI 生成，再添加运镜、字幕、配音并合成。需要全部镜头有图片后才能导出。",
                    )}
            </p>
            {style.evidence && (
              <p>
                {tr(
                  "涉及实测或地理数据时请提供真实素材；生成图片仅作示意，不能替代测量或事实来源。",
                )}
              </p>
            )}
          </div>
          {style.origin === "upstream" && (
            <>
              <div className="detail-demo-title">
                <span>{tr("参考样片")}</span>
                <strong>
                  {styleName({ name: style.demoTitle, en: style.demoTitleEn })}
                </strong>
                <span>
                  {Math.floor(style.demoDuration / 60)}:
                  {String(Math.round(style.demoDuration % 60)).padStart(2, "0")}
                </span>
              </div>
              <p className="detail-description">{styleDescription(style)}</p>
              <div className="use-list">
                {style.uses?.map((u: string) => (
                  <span key={u}>{u}</span>
                ))}
              </div>
              <div className="detail-source">
                <span>
                  {tr("来自 Lemo-Opuscar ·")}
                  {style.author.name}
                </span>
                <a href={style.galleryUrl} target="_blank" rel="noreferrer">
                  {tr("原项目画廊")}
                  <ExternalLink />
                </a>
              </div>
              <section className="guide-section">
                <header>
                  <h4>
                    <FileText />
                    {tr("制作规范")}
                  </h4>
                  <span>{tr("原文 · 英文")}</span>
                </header>
                {!guide && !error && (
                  <p className="guide-state">
                    <LoaderCircle className="spin" />
                    {tr("正在读取本机规范")}
                  </p>
                )}
                {error && (
                  <div className="guide-state error">
                    <AlertCircle />
                    <p>{error}</p>
                    <button
                      className="text-action"
                      onClick={() => setRetry((n) => n + 1)}
                    >
                      {tr("重试")}
                    </button>
                  </div>
                )}
                {guide && (
                  <>
                    <div className="guide-credit">
                      <span>{guide.attribution}</span>
                      <a
                        href={guide.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {guide.license}
                      </a>
                    </div>
                    <details>
                      <summary>
                        {tr("查看完整风格规范")}
                        <ChevronRight />
                      </summary>
                      <pre>{guide.markdown}</pre>
                    </details>
                    <button
                      className="text-action copy-guide"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(guide.markdown);
                          setCopied(true);
                        } catch {
                          setError(tr("复制不可用，请打开原文"));
                        }
                      }}
                    >
                      {copied ? <Check /> : <Copy />}
                      {copied ? tr("已复制") : tr("复制规范")}
                    </button>
                    <a
                      className="text-action"
                      href={guide.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("打开规范原文")}
                      <ExternalLink />
                    </a>
                  </>
                )}
                <p className="guide-license-note">
                  {tr(
                    "规范保留原作者许可，不属于 Flare 的 MIT 许可。样片及第三方素材的具体条款见",
                  )}
                  <a
                    href={`https://github.com/lemomo-ai/lemo-opuscar/blob/${STYLE_SOURCE.commit}/LICENSE`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("原项目许可")}
                  </a>
                  {tr("与")}
                  <a
                    href={`https://github.com/lemomo-ai/lemo-opuscar/blob/${STYLE_SOURCE.commit}/styles/${style.slug}/demo/CREDITS`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("素材说明")}
                  </a>
                  。
                </p>
              </section>
            </>
          )}
          <div className="modal-actions style-detail-actions">
            <button
              className="button secondary"
              onClick={() => {
                onCreate(style.id);
                onClose();
              }}
            >
              {tr("用此风格新建")}
            </button>
            {project && (
              <button
                className="button primary"
                disabled={busy || project.style === style.id}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (await onApply(style.id)) onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <LoaderCircle className="spin" /> : <Check />}
                {project?.style === style.id
                  ? tr("当前风格")
                  : tr("应用到当前短片")}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
export default function StyleLibrary({
  project,
  onApply,
  onCreate,
}: {
  project?: Project;
  onApply: (id: Style) => Promise<boolean>;
  onCreate: (id: Style) => void;
}) {
  const { language } = usePreferences();
  const [origin, setOrigin] = useState("upstream"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [mode, setMode] = useState("all"),
    [limit, setLimit] = useState(18),
    [detail, setDetail] = useState<any>(null);
  const styles = findStyles({ query, category, mode, origin }) as any[],
    base = origin === "upstream" ? UPSTREAM_STYLES : LEGACY_STYLES;
  useEffect(() => setLimit(18), [query, category, mode, origin]);
  return (
    <main className="page-content library-page">
      <div className="library-heading">
        <div>
          <h1>{tr("风格库")}</h1>
          <p>
            {tr(
              "沿用原项目的 15 类、99 种风格。先看参考，再选择适合的制作方式。",
            )}
          </p>
        </div>
        <a
          className="text-action"
          href="https://lemomo-ai.github.io/lemo-opuscar/zh/"
          target="_blank"
          rel="noreferrer"
        >
          {tr("原项目画廊")}
          <ArrowUpRight />
        </a>
      </div>
      <div className="library-tabs" role="tablist" aria-label={tr("风格来源")}>
        <button
          role="tab"
          aria-selected={origin === "upstream"}
          onClick={() => {
            setOrigin("upstream");
            setCategory("all");
          }}
        >
          {tr("原项目风格")}
          <span>99</span>
        </button>
        <button
          role="tab"
          aria-selected={origin === "flare"}
          onClick={() => {
            setOrigin("flare");
            setCategory("all");
          }}
        >
          {tr("Flare 内置")}
          <span>3</span>
        </button>
      </div>
      <div className="library-layout">
        <aside className="category-nav" aria-label={tr("风格分类")}>
          <button
            className={category === "all" ? "active" : ""}
            onClick={() => setCategory("all")}
          >
            <span>{tr("全部风格")}</span>
            <span>{base.length}</span>
          </button>
          {origin === "upstream" &&
            CATEGORIES.map((c, i) => (
              <button
                key={c.id}
                className={category === c.id ? "active" : ""}
                onClick={() => setCategory(c.id)}
              >
                <span>
                  <i>{String(i + 1).padStart(2, "0")}</i>
                  {categoryName(c)}
                </span>
                <span>
                  {UPSTREAM_STYLES.filter((s) => s.category === c.id).length}
                </span>
              </button>
            ))}
        </aside>
        <div className="library-results">
          <div className="library-controls">
            <label className="library-search">
              <Search />
              <input
                aria-label={tr("搜索风格")}
                placeholder={tr("搜索风格、用途或关键词")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label={tr("清除搜索")}
                >
                  ×
                </button>
              )}
            </label>
            <select
              aria-label={tr("制作方式筛选")}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="all">{tr("全部制作方式")}</option>
              <option value="native">{tr("程序动画基础版")}</option>
              <option value="image">{tr("图片辅助")}</option>
            </select>
            <select
              className="mobile-category"
              aria-label={tr("风格分类筛选")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">{tr("全部分类")}</option>
              {origin === "upstream" &&
                CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c)}
                  </option>
                ))}
            </select>
          </div>
          <div className="library-result-count">
            <span>
              {styles.length}
              {tr("种风格")}
              {category !== "all" &&
                ` · ${categoryName(CATEGORIES.find((c) => c.id === category))}`}
            </span>
            <span>
              {origin === "upstream"
                ? tr("样片来自原项目，制作支持以标注为准")
                : tr("Flare 原创程序动画")}
            </span>
          </div>
          {styles.length ? (
            <>
              <div className="reference-grid">
                {styles.slice(0, limit).map((s) => (
                  <article className="reference-card" key={s.id}>
                    <button
                      className="reference-card-button"
                      aria-label={tr("查看风格·{0}", { 0: styleName(s) })}
                      onClick={() => setDetail(s)}
                    >
                      <div className="reference-poster">
                        {s.origin === "upstream" ? (
                          <Poster style={s} />
                        ) : (
                          <div
                            className="legacy-card-art"
                            style={{ background: s.color }}
                          >
                            <Layers3 />
                            <span>{s.en}</span>
                          </div>
                        )}
                        <span className="reference-label">
                          {s.origin === "upstream"
                            ? tr("原样片参考")
                            : tr("Flare 内置")}
                        </span>
                        {project?.style === s.id && (
                          <span className="selected-style">
                            <Check />
                            {tr("当前风格")}
                          </span>
                        )}
                      </div>
                      <div className="reference-card-body">
                        <div className="reference-card-title">
                          <h2>{styleName(s)}</h2>
                          <span className="mono">
                            {s.num ? String(s.num).padStart(2, "0") : ""}
                          </span>
                        </div>
                        <div className="reference-en">
                          {language === "en" ? s.name : s.en}
                        </div>
                        <div className="reference-card-meta">
                          <span
                            className={`support-tag ${s.mode === "native" ? "native" : ""}`}
                          >
                            {tr(capability(s))}
                          </span>
                          <ArrowUpRight />
                        </div>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
              {styles.length > limit && (
                <button
                  className="button secondary show-more"
                  onClick={() => setLimit((n) => n + 18)}
                >
                  {tr("显示更多")}
                  <span>
                    {Math.min(limit, styles.length)} / {styles.length}
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Search />
              <h2>{tr("没有找到匹配的风格")}</h2>
              <p>{tr("试试中文名、英文名，或清除筛选条件。")}</p>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setMode("all");
                  setCategory("all");
                }}
              >
                {tr("清除筛选")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="library-attribution">
        {tr(
          "Lemo-Opuscar by Lemomo (LemoLab) · 99 种原项目风格，8 种程序动画基础版，91 种图片辅助制作。",
        )}
        <a
          href={`https://github.com/lemomo-ai/lemo-opuscar/tree/${STYLE_SOURCE.commit}`}
          target="_blank"
          rel="noreferrer"
        >
          {tr("查看固定版本")}
          <ExternalLink />
        </a>
      </div>
      {detail && (
        <StyleDetail
          style={detail}
          project={project}
          onClose={() => setDetail(null)}
          onApply={onApply}
          onCreate={(id) => {
            setDetail(null);
            onCreate(id);
          }}
        />
      )}
    </main>
  );
}
