export interface RuntimeConfig {
    enableLocalBroadcast: boolean;
    enableRemoteSync: boolean;
    websocketPort?: number;
    websocketPath?: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
    enableLocalBroadcast: true,
    enableRemoteSync: false,
    websocketPort: undefined,
    websocketPath: undefined,
};

let cachedConfig: RuntimeConfig | null = null;
let loadPromise: Promise<RuntimeConfig> | null = null;

async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
    try {
        const response = await fetch('/runtime-config.json', { cache: 'no-store' });
        if (!response.ok) {
            console.warn('[RuntimeConfig] runtime-config.json not found. Using defaults.');
            return DEFAULT_CONFIG;
        }

        const json = await response.json();
        return {
            enableLocalBroadcast: json.enableLocalBroadcast ?? DEFAULT_CONFIG.enableLocalBroadcast,
            enableRemoteSync: json.enableRemoteSync ?? DEFAULT_CONFIG.enableRemoteSync,
            websocketPort: json.websocketPort ?? DEFAULT_CONFIG.websocketPort,
            websocketPath: json.websocketPath ?? DEFAULT_CONFIG.websocketPath,
        } satisfies RuntimeConfig;
    } catch (error) {
        console.warn('[RuntimeConfig] Failed to load runtime-config.json. Using defaults.', error);
        return DEFAULT_CONFIG;
    }
}

export async function ensureRuntimeConfig(): Promise<RuntimeConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }

    if (!loadPromise) {
        loadPromise = fetchRuntimeConfig().then((config) => {
            cachedConfig = config;
            (window as unknown as { __AA_RUNTIME_CONFIG__?: RuntimeConfig }).__AA_RUNTIME_CONFIG__ = config;
            return config;
        });
    }

    return loadPromise;
}

export function getRuntimeConfig(): RuntimeConfig {
    return cachedConfig ?? DEFAULT_CONFIG;
}
