// Vite 静态资源模块声明
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.mp4' {
  const src: string;
  export default src;
}
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskLists: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default taskLists;
}

// Silero VAD — 库未安装时的本地类型声明
declare module '@ricky0123/vad-web' {
  export interface MicVADInstance {
    start(): void;
    pause(): void;
    destroy(): void;
  }
  export interface MicVADOptions {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onFrameProcessed?: (probabilities: number[]) => void;
    model?: string;
    positiveSpeechThreshold?: number;
    negativeSpeechThreshold?: number;
    minSpeechFrames?: number;
    redemptionFrames?: number;
    preSpeechPadFrames?: number;
    suppressNonSpeech?: boolean;
  }
  // 异步构造器：new 返回 Promise
  export const MicVAD: new (options: MicVADOptions) => Promise<MicVADInstance>;
}
