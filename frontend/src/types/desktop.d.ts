export {};

declare global {
  interface Window {
    bhashDesktop?: {
      isDesktop: boolean;
      getConfig: () => Promise<{
        serverUrl: string;
        updateUrl: string;
        autoStart: boolean;
        minimizeToTray: boolean;
        version: string;
        isPackaged: boolean;
      }>;
      getWindowState: () => Promise<{
        isVisible: boolean;
        isMinimized: boolean;
        isFocused: boolean;
        isMaximized: boolean;
        isFullScreen: boolean;
      }>;
      setServerUrl: (url: string) => Promise<{ ok: boolean; error?: string; serverUrl?: string }>;
      openSettings: () => Promise<{ ok: boolean }>;
      setAutoStart: (enabled: boolean) => Promise<{ ok: boolean; autoStart?: boolean }>;
      notify: (payload: {
        title: string;
        body?: string;
        silent?: boolean;
        playSound?: boolean;
        conversationId?: string;
        messageId?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      consumeNotificationTarget: () => Promise<{
        conversationId: string;
        messageId?: string | null;
        at?: number;
      } | null>;
      checkUpdates: () => Promise<{ ok: boolean; error?: string; reason?: string }>;
      onUpdateStatus: (
        cb: (payload: { status: string; info?: string; version?: string; error?: string }) => void
      ) => () => void;
      onServerUpdated: (cb: (payload: { serverUrl: string }) => void) => () => void;
      onNotificationClick: (
        cb: (payload: { conversationId: string; messageId?: string | null; at?: number }) => void
      ) => () => void;
    };
  }
}
