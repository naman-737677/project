import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { wsClient, ConnectionState } from '../services/websocket';

export interface AuthUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  token: string;
  deviceId: string;
  twoFactorEnabled?: boolean;
  isOfflineMode?: boolean;
}

export interface DemoUser {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    userId: '11111111-1111-4111-8111-111111111111',
    username: 'alice',
    displayName: 'Alice Johnson',
    avatarColor: '#54a9eb',
  },
  {
    userId: '22222222-2222-4222-8222-222222222222',
    username: 'bob',
    displayName: 'Bob Smith',
    avatarColor: '#4fae4e',
  },
  {
    userId: '33333333-3333-4333-8333-333333333333',
    username: 'charlie',
    displayName: 'Charlie Brown',
    avatarColor: '#e57373',
  },
];

export interface TwoFactorSetupData {
  secret: string;
  otpauthUrl: string;
  qrCode: string;
  message: string;
}

export interface TwoFactorLoginResult {
  require2FA?: boolean;
  require2FASetup?: boolean;
  tempToken?: string;
  secret?: string;
  qrCode?: string;
  otpauthUrl?: string;
  username?: string;
  displayName?: string;
}

interface AuthContextType {
  currentUser: AuthUser | null;
  connectionState: ConnectionState;
  gatewayUrl: string;
  setGatewayUrl: (url: string) => void;
  login: (user: { userId: string; username: string; displayName?: string; token?: string }) => Promise<void>;
  loginWithCredentials: (username: string, password: string, enable2FA?: boolean) => Promise<TwoFactorLoginResult>;
  verifyTwoFactorLogin: (tempToken: string, code: string) => Promise<void>;
  verifyTwoFactorSetupLogin: (tempToken: string, code: string) => Promise<void>;
  getDevCurrentCode: (tempToken?: string) => Promise<{ code: string; remainingSeconds: number }>;
  registerUser: (username: string, password: string, displayName?: string, enable2FA?: boolean) => Promise<TwoFactorLoginResult>;
  loginAsDemoUser: (demoUser: DemoUser, enable2FA?: boolean) => Promise<TwoFactorLoginResult>;
  loginOffline: (username?: string, displayName?: string) => void;
  logout: () => void;
  setup2FA: () => Promise<TwoFactorSetupData>;
  enable2FA: (code: string) => Promise<void>;
  disable2FA: (password: string, code: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  updateProfilePicture: (fileOrUrl: File | string) => Promise<string>;
  removeProfilePicture: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_GATEWAY_URL = 'ws://localhost:4000/ws';
const BACKEND_API_BASE = 'http://localhost:4000';

// Helper to make requests trying both Vite proxy /api and direct http://localhost:4000
async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  let res: Response | null = null;
  let networkError: any = null;

  // 1. Try relative path (Vite proxy)
  try {
    res = await fetch(path, options);
  } catch (err) {
    networkError = err;
  }

  // 2. If relative path fails with network error or returns 502/504 (proxy failed), try direct backend URL
  if (!res || res.status === 502 || res.status === 504 || res.status === 500) {
    try {
      const directUrl = `${BACKEND_API_BASE}${path}`;
      res = await fetch(directUrl, options);
    } catch (err) {
      if (!networkError) networkError = err;
    }
  }

  if (!res) {
    throw new Error(
      `Cannot connect to backend server at ${BACKEND_API_BASE}. Please make sure the backend server is running ('npm run dev' inside server/).`
    );
  }

  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(`Server returned error ${res.status}. Is the backend server running?`);
    }
    data = { text };
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

// Client-side fallback token generator (valid JWT structure matching backend secret)
function createDevToken(userId: string, username: string, deviceId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const payload = btoa(JSON.stringify({ userId, username, deviceId, exp })).replace(/=+$/, '');
  return `${header}.${payload}.dev_local_token`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('telegram_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [gatewayUrl, setGatewayUrl] = useState<string>(() => {
    return localStorage.getItem('telegram_gateway_url') || DEFAULT_GATEWAY_URL;
  });

  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');

  useEffect(() => {
    const unsubscribe = wsClient.onStateChange((state) => {
      setConnectionState(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentUser?.token) {
      wsClient.connect(gatewayUrl, currentUser.token, currentUser.deviceId);
    } else {
      wsClient.disconnect();
    }
  }, [currentUser, gatewayUrl]);

  const saveAuthSession = (user: AuthUser) => {
    localStorage.setItem('telegram_auth_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const loginWithCredentials = async (
    username: string,
    password: string,
    enable2FA?: boolean
  ): Promise<TwoFactorLoginResult> => {
    const cleanUser = username.trim().replace(/^@+/, '');

    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, password, enable2FA: !!enable2FA }),
    });

    if (data.require2FA || data.require2FASetup) {
      return {
        require2FA: true,
        require2FASetup: !!data.require2FASetup,
        tempToken: data.tempToken,
        secret: data.secret,
        qrCode: data.qrCode,
        otpauthUrl: data.otpauthUrl,
        username: data.username,
        displayName: data.displayName,
      };
    }

    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const authUser: AuthUser = {
      userId: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName,
      avatarUrl: data.user.avatarUrl || undefined,
      token: data.token,
      deviceId,
      twoFactorEnabled: !!data.user.twoFactorEnabled,
    };

    saveAuthSession(authUser);
    return {};
  };

  const verifyTwoFactorLogin = async (tempToken: string, code: string) => {
    const data = await apiFetch('/api/auth/2fa/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code }),
    });

    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const authUser: AuthUser = {
      userId: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName,
      avatarUrl: data.user.avatarUrl || undefined,
      token: data.token,
      deviceId,
      twoFactorEnabled: true,
    };

    saveAuthSession(authUser);
  };

  const verifyTwoFactorSetupLogin = async (tempToken: string, code: string) => {
    const data = await apiFetch('/api/auth/2fa/login-setup-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code }),
    });

    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const authUser: AuthUser = {
      userId: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName,
      avatarUrl: data.user.avatarUrl || undefined,
      token: data.token,
      deviceId,
      twoFactorEnabled: true,
    };

    saveAuthSession(authUser);
  };

  const getDevCurrentCode = async (tempToken?: string): Promise<{ code: string; remainingSeconds: number }> => {
    const data = await apiFetch('/api/auth/2fa/current-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
      },
      body: JSON.stringify({ tempToken }),
    });
    return { code: data.code, remainingSeconds: data.remainingSeconds ?? 30 };
  };

  const registerUser = async (
    username: string,
    password: string,
    displayName?: string,
    enable2FA?: boolean
  ): Promise<TwoFactorLoginResult> => {
    const cleanUser = username.trim().replace(/^@+/, '');

    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, password, displayName, enable2FA: !!enable2FA }),
    });

    if (data.require2FASetup) {
      return {
        require2FASetup: true,
        tempToken: data.tempToken,
        secret: data.secret,
        qrCode: data.qrCode,
        otpauthUrl: data.otpauthUrl,
        username: cleanUser,
        displayName: displayName || cleanUser,
      };
    }

    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const authUser: AuthUser = {
      userId: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName,
      avatarUrl: data.user.avatarUrl || undefined,
      token: data.token,
      deviceId,
      twoFactorEnabled: false,
    };

    saveAuthSession(authUser);
    return {};
  };

  const loginAsDemoUser = async (demo: DemoUser, enable2FA?: boolean) => {
    try {
      return await loginWithCredentials(demo.username, 'password123', enable2FA);
    } catch (err: any) {
      console.warn('Backend login failed, using local demo profile:', err.message);
      // Fallback dev login
      loginOffline(demo.username, demo.displayName);
      return {};
    }
  };

  const loginOffline = (username = 'alice', displayName = 'Alice Johnson') => {
    const clean = username.replace(/^@+/, '');
    const userId = clean === 'bob' ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111';
    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const token = createDevToken(userId, clean, deviceId);

    const authUser: AuthUser = {
      userId,
      username: clean,
      displayName: displayName || clean,
      token,
      deviceId,
      twoFactorEnabled: false,
      isOfflineMode: true,
    };

    saveAuthSession(authUser);
  };

  const login = async (input: { userId: string; username: string; displayName?: string; token?: string }) => {
    const deviceId = `browser-${Math.random().toString(36).substring(2, 7)}`;
    const clean = input.username.replace(/^@+/, '');
    let token = input.token;

    if (!token) {
      try {
        const res = await apiFetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: input.userId, username: clean, deviceId }),
        });
        if (res && res.token) {
          token = res.token;
        }
      } catch {
        token = createDevToken(input.userId, clean, deviceId);
      }
    }

    if (!token) {
      token = createDevToken(input.userId, clean, deviceId);
    }

    const authUser: AuthUser = {
      userId: input.userId,
      username: clean,
      displayName: input.displayName || clean,
      token,
      deviceId,
    };
    saveAuthSession(authUser);
  };

  const setup2FA = async (): Promise<TwoFactorSetupData> => {
    if (!currentUser?.token) throw new Error('Not authenticated');

    return await apiFetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`,
      },
    });
  };

  const enable2FA = async (code: string) => {
    if (!currentUser?.token) throw new Error('Not authenticated');

    await apiFetch('/api/auth/2fa/enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ code }),
    });

    const updated = { ...currentUser, twoFactorEnabled: true };
    saveAuthSession(updated);
  };

  const disable2FA = async (password: string, code: string) => {
    if (!currentUser?.token) throw new Error('Not authenticated');

    await apiFetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ password, code }),
    });

    const updated = { ...currentUser, twoFactorEnabled: false };
    saveAuthSession(updated);
  };

  const refreshUserProfile = useCallback(async () => {
    if (!currentUser?.token) return;
    try {
      const data = await apiFetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (data?.user) {
        const updated = {
          ...currentUser,
          displayName: data.user.displayName,
          avatarUrl: data.user.avatarUrl || currentUser.avatarUrl,
          twoFactorEnabled: data.user.twoFactorEnabled,
        };
        saveAuthSession(updated);
      }
    } catch {
      // Ignored
    }
  }, [currentUser]);

  const updateProfilePicture = async (fileOrUrl: File | string): Promise<string> => {
    if (!currentUser) throw new Error('You must be logged in to update your profile picture');

    let finalAvatarUrl = '';

    if (typeof fileOrUrl === 'string') {
      finalAvatarUrl = fileOrUrl;
    } else {
      // Read file as Base64 Data URL
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(fileOrUrl);
      });
      const dataUrl = await base64Promise;

      // Upload to server via /api/upload
      try {
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: fileOrUrl.name || 'avatar.jpg',
            fileType: fileOrUrl.type || 'image/jpeg',
            fileSize: fileOrUrl.size,
            fileData: dataUrl,
          }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.status === 'success' && uploadData.attachment?.file_url) {
          finalAvatarUrl = uploadData.attachment.file_url;
        } else {
          finalAvatarUrl = dataUrl;
        }
      } catch {
        finalAvatarUrl = dataUrl;
      }
    }

    // Persist to server backend if token exists
    if (currentUser.token) {
      try {
        await apiFetch('/api/auth/profile/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify({ avatarUrl: finalAvatarUrl }),
        });
      } catch (err) {
        console.warn('Could not persist avatar to server:', err);
      }
    }

    // Update locally and save session
    const updated: AuthUser = {
      ...currentUser,
      avatarUrl: finalAvatarUrl,
    };
    saveAuthSession(updated);
    return finalAvatarUrl;
  };

  const removeProfilePicture = async (): Promise<void> => {
    if (!currentUser) return;

    if (currentUser.token) {
      try {
        await apiFetch('/api/auth/profile/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify({ avatarUrl: null }),
        });
      } catch (err) {
        console.warn('Could not remove avatar on server:', err);
      }
    }

    const updated: AuthUser = {
      ...currentUser,
      avatarUrl: undefined,
    };
    saveAuthSession(updated);
  };

  const logout = () => {
    localStorage.removeItem('telegram_auth_user');
    setCurrentUser(null);
    wsClient.disconnect();
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        connectionState,
        gatewayUrl,
        setGatewayUrl: (url: string) => {
          localStorage.setItem('telegram_gateway_url', url);
          setGatewayUrl(url);
        },
        login,
        loginWithCredentials,
        verifyTwoFactorLogin,
        verifyTwoFactorSetupLogin,
        getDevCurrentCode,
        registerUser,
        loginAsDemoUser,
        loginOffline,
        logout,
        setup2FA,
        enable2FA,
        disable2FA,
        refreshUserProfile,
        updateProfilePicture,
        removeProfilePicture,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
