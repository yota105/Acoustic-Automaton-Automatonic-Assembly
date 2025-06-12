// Tauri API type definitions
declare global {
  interface Window {
    __TAURI__?: {
      window: {
        WebviewWindow: any;
        getCurrentWindow: () => any;
      };
      core: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
      event: {
        listen: (event: string, handler: (event: any) => void) => Promise<any>;
        emit: (event: string, payload?: any) => Promise<void>;
      };
    };
  }
}

export {};
