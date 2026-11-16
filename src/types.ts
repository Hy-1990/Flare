export type Style = "paper" | "blueprint" | "noir" | `opuscar:${string}`;
export type Aspect = "16:9" | "9:16" | "1:1";
export interface Scene {
  id: string;
  title: string;
  narration: string;
  visual: string;
  duration: number;
  art: "landscape" | "coffee" | "orbit" | "city" | "chart" | "botanical";
  accent: string;
  image?: string;
  audio?: string;
}
export interface Project {
  id: string;
  title: string;
  brief: string;
  style: Style;
  aspect: Aspect;
  music: boolean;
  scenes: Scene[];
  revision: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  canUndo: string[];
}
export interface Job {
  id: string;
  projectId: string;
  projectTitle: string;
  revision: number;
  status: string;
  progress: number;
  quality: number;
  createdAt: string;
  url?: string;
  error?: string;
}
export interface MediaTask {
  id: string;
  projectId: string;
  sceneId: string;
  kind: string;
  status: string;
  taskId?: string;
  asset?: string;
  applied?: boolean;
  error?: string;
}
export interface Settings {
  textProvider: string;
  textConfigured: boolean;
  cliAvailable: { codex: boolean; claude: boolean };
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  openaiModel: string;
  anthropicModel: string;
  codexModel: string;
  claudeModel: string;
  deepseekConfigured: boolean;
  dreamapiConfigured: boolean;
  model: string;
  liveVerification: string;
}
