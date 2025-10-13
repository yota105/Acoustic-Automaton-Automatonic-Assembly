/**
 * Authentication Guard for Protected Pages
 * 
 * セッション認証チェックを行い、未認証の場合はindex.htmlへリダイレクトする
 */

const AUTH_KEY = 'acoustic-automaton-authenticated';

// Authentication configuration interface
interface AuthConfig {
    authRequired: boolean;
    controllerPassword: string;
    playerPassword: string;
}

// Cache for auth config
let authConfigCache: AuthConfig | null = null;

/**
 * Load authentication configuration
 */
async function loadAuthConfig(): Promise<AuthConfig> {
    if (authConfigCache) {
        return authConfigCache as AuthConfig;
    }

    try {
        const response = await fetch('/auth-config.json');
        if (response.ok) {
            authConfigCache = await response.json();
            console.log('[AuthGuard] Configuration loaded:', { authRequired: authConfigCache?.authRequired });
            return authConfigCache as AuthConfig;
        }
    } catch (error) {
        console.warn('[AuthGuard] Failed to load config, using defaults:', error);
    }

    // Default configuration
    authConfigCache = {
        authRequired: true,
        controllerPassword: 'controller2025',
        playerPassword: 'player2025'
    };
    return authConfigCache;
}

/**
 * 認証状態をチェック
 */
export function isAuthenticated(): boolean {
    return sessionStorage.getItem(AUTH_KEY) === 'true';
}

/**
 * 認証ガードを適用（ページロード時に実行）
 * 未認証の場合はindex.htmlへリダイレクト
 */
export async function applyAuthGuard(): Promise<void> {
    const config = await loadAuthConfig();

    // If auth is not required, auto-authenticate
    if (!config.authRequired) {
        console.log('[AuthGuard] Authentication disabled, auto-authenticating');
        sessionStorage.setItem(AUTH_KEY, 'true');
        sessionStorage.setItem('acoustic-automaton-role', 'player');
        return;
    }

    // Check authentication
    if (!isAuthenticated()) {
        console.warn('[AuthGuard] Unauthenticated access detected. Redirecting to login...');

        // 現在のパスを保存（ログイン後に戻る場合に使用可能）
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('acoustic-automaton-return-path', currentPath);

        // index.htmlへリダイレクト
        window.location.href = '/';
    } else {
        console.log('[AuthGuard] Authentication verified');
    }
}

/**
 * 認証状態をクリア（ログアウト用）
 */
export function clearAuthentication(): void {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem('acoustic-automaton-role');
    sessionStorage.removeItem('acoustic-automaton-return-path');
    console.log('[AuthGuard] Authentication cleared');
}

/**
 * ページ離脱時の確認（オプション）
 */
export function setupBeforeUnloadWarning(enabled: boolean = false): void {
    if (enabled) {
        window.addEventListener('beforeunload', (e) => {
            // 注意: モダンブラウザではカスタムメッセージは表示されない
            e.preventDefault();
            e.returnValue = '';
        });
    }
}
