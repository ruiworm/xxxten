import type { LanguageCode } from "@/i18n";
import type { ThemeAppearance, ThemeVariables } from "@/lib/theme";

export interface DesktopAppearancePayload {
  appearance?: ThemeAppearance;
  fontFamily?: string;
  codeFontFamily?: string;
  themeVariables?: ThemeVariables;
  persist?: boolean;
}

export interface SocketDiagnosticPayload {
  event:
    | "connect-start"
    | "connect-error"
    | "reconnect-attempt"
    | "reconnect-failed"
    | "connected"
    | "disconnected"
    | "connection-timeout";
  active?: boolean;
  attempt?: number;
  durationMs?: number;
  message?: string;
  transport?: string;
  url?: string;
}

declare global {
  interface Window {
    openficDesktopHost?: {
      publishAppearance: (payload: DesktopAppearancePayload) => void;
      publishLanguage: (language: LanguageCode) => void;
      publishDocumentTitle: (title: string) => void;
      publishSocketDiagnostic: (payload: SocketDiagnosticPayload) => void;
      openFolder: (folderPath: string) => void;
      openOpenAICodexAuthorization: (url: string) => Promise<void>;
    };
  }
}

export function publishDesktopAppearance(payload: DesktopAppearancePayload): void {
  window.openficDesktopHost?.publishAppearance(payload);
}

export function publishDesktopLanguage(language: LanguageCode): void {
  window.openficDesktopHost?.publishLanguage(language);
}

/**
 * 把当前打开的小说标题上报给桌面壳的标题栏。
 * 没有打开项目时传空串，标题栏会留空。
 */
export function publishDesktopDocumentTitle(title: string): void {
  window.openficDesktopHost?.publishDocumentTitle?.(title);
}

export function publishSocketDiagnostic(payload: SocketDiagnosticPayload): void {
  window.openficDesktopHost?.publishSocketDiagnostic?.(payload);
}

export function openDesktopFolder(folderPath: string): void {
  window.openficDesktopHost?.openFolder(folderPath);
}
