import { useState, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { t as tr } from "./preferences";
import { MODEL_OPTIONS } from "../shared/providers.js";

export function SettingsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="settings-select">
      <select {...props} />
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

export function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: keyof typeof MODEL_OPTIONS;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = MODEL_OPTIONS[provider];
  const [custom, setCustom] = useState(!options.some((o) => o.id === value));
  const isCustom = custom || !options.some((o) => o.id === value);
  const label =
    provider === "deepseek" ? tr("DeepSeek 模型") : `${provider} model`;
  return (
    <div className="model-picker">
      <label className="field">
        {tr("模型")}
        <SettingsSelect
          aria-label={label}
          value={isCustom ? "__custom__" : value}
          onChange={(e) => {
            if (e.target.value === "__custom__") setCustom(true);
            else {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.hint ? ` · ${tr(o.hint)}` : ""}
            </option>
          ))}
          <option value="__custom__">{tr("自定义模型…")}</option>
        </SettingsSelect>
      </label>
      {isCustom && (
        <label className="field">
          {tr("自定义模型名称")}
          <input
            aria-label={`${provider} custom model`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={tr("输入服务商提供的模型 ID")}
          />
        </label>
      )}
      <p className="field-hint">
        {tr(
          provider === "codex" || provider === "claude"
            ? "不确定选哪个？使用 CLI 默认即可。"
            : "常用模型预设，实际可用性取决于你的账户权限。",
        )}
      </p>
    </div>
  );
}
