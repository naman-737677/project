import React, { useState, useRef, useEffect } from 'react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowLeft,
  Check,
  Copy,
  Sparkles,
  Clock,
  Info,
  QrCode,
  Archive,
} from 'lucide-react';
import { StoredChatsModal } from './StoredChatsModal';
import { getAllStoredSessions } from '../utils/chatStorage';

export const LoginPage: React.FC = () => {
  const {
    loginWithCredentials,
    verifyTwoFactorLogin,
    verifyTwoFactorSetupLogin,
    getDevCurrentCode,
    registerUser,
    loginAsDemoUser,
    loginOffline,
  } = useAuth();

  // Mode: 'signin' | 'signup' | '2fa'
  const [mode, setMode] = useState<'signin' | 'signup' | '2fa'>('signin');
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('password123');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA Verification State
  const [tempToken, setTempToken] = useState('');
  const [setupData, setSetupData] = useState<{
    qrCode: string;
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState(['', '', '', '', '', '']);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Live expected code & time synchronization
  const [liveExpectedCode, setLiveExpectedCode] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(30);

  // UI status
  const [loading, setLoading] = useState(false);
  const [devHelperLoading, setDevHelperLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [isStoredChatsOpen, setIsStoredChatsOpen] = useState(false);
  const [storedSessionsCount, setStoredSessionsCount] = useState(() => getAllStoredSessions().length);

  // Periodically poll live expected code when in 2FA mode
  useEffect(() => {
    if (mode === '2fa' && tempToken) {
      let active = true;
      const fetchLiveCode = async () => {
        try {
          const res = await getDevCurrentCode(tempToken);
          if (active && res.code) {
            setLiveExpectedCode(res.code);
            setRemainingSec(res.remainingSeconds);
          }
        } catch {
          // ignore
        }
      };

      fetchLiveCode();
      const interval = setInterval(fetchLiveCode, 4000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    } else {
      setLiveExpectedCode(null);
    }
  }, [mode, tempToken, getDevCurrentCode]);

  // Second countdown ticker
  useEffect(() => {
    if (mode === '2fa') {
      const timer = setInterval(() => {
        setRemainingSec((prev) => (prev > 1 ? prev - 1 : 30));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [mode]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@+/, '');
    if (!cleanUser || !password) {
      setError('Please enter your username and password');
      return;
    }

    setError(null);
    setLoading(true);
    setIsServerOffline(false);

    try {
      const res = await loginWithCredentials(cleanUser, password, true);
      if ((res.require2FA || res.require2FASetup) && res.tempToken) {
        setTempToken(res.tempToken);
        if (res.qrCode) {
          setSetupData({
            qrCode: res.qrCode,
            secret: res.secret || '',
            otpauthUrl: res.otpauthUrl || '',
          });
        }
        setMode('2fa');
        setTwoFactorCode(['', '', '', '', '', '']);
        setTimeout(() => codeInputsRef.current[0]?.focus(), 150);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to sign in';
      setError(msg);
      if (msg.includes('Cannot connect to backend') || msg.includes('Failed to fetch') || msg.includes('offline')) {
        setIsServerOffline(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@+/, '');
    if (!cleanUser || !password) {
      setError('Username and password are required');
      return;
    }
    if (cleanUser.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setLoading(true);
    setIsServerOffline(false);

    try {
      const res = await registerUser(cleanUser, password, displayName.trim() || cleanUser, true);
      if ((res.require2FASetup || res.require2FA) && res.tempToken) {
        setTempToken(res.tempToken);
        if (res.qrCode) {
          setSetupData({
            qrCode: res.qrCode,
            secret: res.secret || '',
            otpauthUrl: res.otpauthUrl || '',
          });
        }
        setMode('2fa');
        setTwoFactorCode(['', '', '', '', '', '']);
        setTimeout(() => codeInputsRef.current[0]?.focus(), 150);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to register account';
      setError(msg);
      if (msg.includes('Cannot connect to backend') || msg.includes('Failed to fetch') || msg.includes('offline')) {
        setIsServerOffline(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // 2FA Digit handling (supports single keystroke, fast typing, clipboard paste, and mobile autofill)
  const handleDigitChange = (index: number, value: string) => {
    const rawDigits = value.replace(/\D/g, '');
    if (!rawDigits) {
      const updated = [...twoFactorCode];
      updated[index] = '';
      setTwoFactorCode(updated);
      return;
    }

    // If multiple digits were pasted or autofilled:
    if (rawDigits.length > 1) {
      const updated = [...twoFactorCode];
      const chars = rawDigits.split('');
      chars.forEach((c, i) => {
        if (index + i < 6) {
          updated[index + i] = c;
        }
      });
      setTwoFactorCode(updated);

      const nextIdx = Math.min(index + chars.length, 5);
      codeInputsRef.current[nextIdx]?.focus();

      const fullCode = updated.join('');
      if (fullCode.length === 6 && !updated.includes('')) {
        submit2FA(fullCode);
      }
      return;
    }

    // Single digit input
    const updated = [...twoFactorCode];
    updated[index] = rawDigits;
    setTwoFactorCode(updated);

    if (index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }

    const fullCode = updated.join('');
    if (fullCode.length === 6 && !updated.includes('')) {
      submit2FA(fullCode);
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!twoFactorCode[index] && index > 0) {
        const updated = [...twoFactorCode];
        updated[index - 1] = '';
        setTwoFactorCode(updated);
        codeInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handlePasteCode = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const digits = pasted.split('');
    const updated = ['', '', '', '', '', ''];
    digits.forEach((d, i) => {
      updated[i] = d;
    });
    setTwoFactorCode(updated);

    const nextIndex = Math.min(digits.length, 5);
    codeInputsRef.current[nextIndex]?.focus();

    if (pasted.length === 6) {
      submit2FA(pasted);
    }
  };

  const submit2FA = async (codeOverride?: string) => {
    const code = (codeOverride || twoFactorCode.join('')).replace(/\D/g, '');
    if (code.length !== 6) {
      setError('Please enter all 6 digits from Google Authenticator');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await verifyTwoFactorLogin(tempToken, code);
    } catch (err: any) {
      // Fallback try setup verify
      try {
        await verifyTwoFactorSetupLogin(tempToken, code);
      } catch (err2: any) {
        setError(err.message || err2.message || 'Invalid 6-digit code. Please check Google Authenticator and try again.');
        setTwoFactorCode(['', '', '', '', '', '']);
        codeInputsRef.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAutofillDevCode = async () => {
    if (!tempToken) return;
    setError(null);
    setDevHelperLoading(true);

    try {
      const res = await getDevCurrentCode(tempToken);
      if (res && res.code && res.code.length === 6) {
        setTwoFactorCode(res.code.split(''));
        setLiveExpectedCode(res.code);
        setRemainingSec(res.remainingSeconds);
        await submit2FA(res.code);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch current TOTP code');
    } finally {
      setDevHelperLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDemoSelect = async (demo: (typeof DEMO_USERS)[0]) => {
    setUsername(demo.username);
    setPassword('password123');
    setError(null);
    setLoading(true);
    setIsServerOffline(false);

    try {
      const res = await loginAsDemoUser(demo, true);
      if ((res.require2FA || res.require2FASetup) && res.tempToken) {
        setTempToken(res.tempToken);
        if (res.qrCode) {
          setSetupData({
            qrCode: res.qrCode,
            secret: res.secret || '',
            otpauthUrl: res.otpauthUrl || '',
          });
        }
        setMode('2fa');
        setTwoFactorCode(['', '', '', '', '', '']);
        setTimeout(() => codeInputsRef.current[0]?.focus(), 150);
      }
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOffline = () => {
    const cleanUser = username.trim().replace(/^@+/, '') || 'alice';
    loginOffline(cleanUser, displayName || cleanUser);
  };

  // Format secret in readable 4-character chunks (e.g. JBSW Y3DP ...)
  const formattedSecret = setupData?.secret
    ? setupData.secret.match(/.{1,4}/g)?.join(' ') || setupData.secret
    : '';

  return (
    <div className="login-screen">
      <div className="login-card" style={mode === '2fa' ? { maxWidth: 490 } : undefined}>
        {/* Telegram Plane Logo */}
        <div className="login-logo-wrapper">
          <div className="login-logo-circle">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="#ffffff">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .39z" />
            </svg>
          </div>
          <h1 className="login-title">
            {mode === '2fa' ? 'Two-Step Verification' : 'Telegram Web'}
          </h1>
          <p className="login-subtitle">
            {mode === '2fa'
              ? `Scan the Google Authenticator QR code to re-verify @${username.replace(/^@+/, '')} and log in`
              : mode === 'signup'
              ? 'Create a new account with end-to-end messaging & Google Authenticator protection'
              : 'Sign in with Google Authenticator Two-Step Verification'}
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="login-error-alert" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <span>{error}</span>
            {isServerOffline && (
              <button
                type="button"
                onClick={handleContinueOffline}
                style={{
                  background: '#b91c1c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: 4,
                }}
              >
                Click here to Continue in Offline / Dev Mode →
              </button>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW: TWO-STEP GOOGLE AUTHENTICATOR QR RE-VERIFICATION   */}
        {/* ======================================================== */}
        {mode === '2fa' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                <ShieldCheck size={14} />
                <span>Google Authenticator (RFC 6238 TOTP)</span>
              </div>
              <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.4, margin: 0 }}>
                1. Open <b>Google Authenticator</b> on your phone and scan this QR code:
              </p>
            </div>

            {/* QR Code Container with High-Contrast Pure Black/White */}
            {setupData?.qrCode && (
              <div className="login-2fa-qr-container">
                <div className="login-2fa-qr-box">
                  <img
                    src={setupData.qrCode}
                    alt="Google Authenticator QR Code"
                    style={{ width: 185, height: 185, display: 'block' }}
                  />
                </div>
              </div>
            )}

            {/* Manual Secret Key (Formatted in 4-character blocks) */}
            {formattedSecret && (
              <div className="login-2fa-secret-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700, letterSpacing: 0.5 }}>
                      CANT SCAN? ENTER SECRET KEY MANUALLY:
                    </span>
                    <div style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: '#0f172a', letterSpacing: 0.8, marginTop: 2 }}>
                      {formattedSecret}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: '#334155',
                    }}
                    title="Copy secret key to clipboard"
                  >
                    {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 instruction */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>
                2. Enter the 6-digit code shown in Google Authenticator:
              </p>
            </div>

            {/* 6 Digit Inputs */}
            <div className="totp-inputs-row">
              {twoFactorCode.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (codeInputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  className="totp-digit-box"
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  onPaste={handlePasteCode}
                />
              ))}
            </div>

            {/* Live Server TOTP & Companion Box */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
                marginTop: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                  <Clock size={14} color="#0284c7" />
                  <span>Current Code:</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a', letterSpacing: 1 }}>
                    {liveExpectedCode || '------'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: remainingSec <= 5 ? '#dc2626' : '#64748b',
                      background: remainingSec <= 5 ? '#fee2e2' : '#f1f5f9',
                      padding: '2px 6px',
                      borderRadius: 12,
                    }}
                  >
                    ⏱ {remainingSec}s
                  </span>

                  <button
                    type="button"
                    onClick={handleAutofillDevCode}
                    disabled={devHelperLoading || loading}
                    style={{
                      background: '#ede9fe',
                      border: '1px solid #c4b5fd',
                      color: '#6d28d9',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Sparkles size={11} />
                    <span>Autofill</span>
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.35, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <b>Tip:</b> If Google Authenticator on your phone shows a different code, open Authenticator menu (3 dots) &gt; <b>Settings &gt; Time correction for codes &gt; Sync now</b>.
                </span>
              </div>
            </div>

            <button
              className="login-btn-primary"
              disabled={loading || twoFactorCode.join('').length !== 6}
              onClick={() => submit2FA()}
              style={{ marginTop: 14 }}
            >
              {loading ? 'Re-verifying...' : 'Re-verify & Log In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
              <button
                type="button"
                className="login-btn-link"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <ArrowLeft size={15} />
                <span>Back to Login</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW: CREDENTIALS LOGIN / REGISTER                      */}
        {/* ======================================================== */}
        {(mode === 'signin' || mode === 'signup') && (
          <div>
            {/* Tabs */}
            <div className="login-tab-bar">
              <button
                className={`login-tab-btn ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
              >
                Sign In
              </button>
              <button
                className={`login-tab-btn ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
              {/* Display Name (Only in Sign Up) */}
              {mode === 'signup' && (
                <div className="input-group">
                  <label className="input-label">Display Name</label>
                  <div className="input-field-wrapper">
                    <User className="input-field-icon" size={18} />
                    <input
                      type="text"
                      className="login-input"
                      placeholder="e.g. John Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Username */}
              <div className="input-group">
                <label className="input-label">Username</label>
                <div className="input-field-wrapper">
                  <span className="input-field-prefix">@</span>
                  <input
                    type="text"
                    className="login-input"
                    placeholder="alice"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="input-group">
                <label className="input-label">Password</label>
                <div className="input-field-wrapper">
                  <Lock className="input-field-icon" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="password123"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password (Only in Sign Up) */}
              {mode === 'signup' && (
                <div className="input-group">
                  <label className="input-label">Confirm Password</label>
                  <div className="input-field-wrapper">
                    <Lock className="input-field-icon" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="login-input"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Two-Step Verification Required Notice */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16a34a',
                    flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
                    Google Authenticator 2FA Enforced
                  </div>
                  <div style={{ fontSize: 11.5, color: '#4b5563', marginTop: 2, lineHeight: 1.4 }}>
                    Google Authenticator QR code will be presented to re-verify and log in.
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="login-btn-primary"
                disabled={loading}
                style={{ marginTop: 4 }}
              >
                {loading
                  ? 'Connecting...'
                  : mode === 'signin'
                  ? 'Sign In with Google Authenticator →'
                  : 'Create Account & View QR Code →'}
              </button>
            </form>

            {/* Quick Demo Logins */}
            <div className="demo-accounts-container">
              <div className="demo-accounts-divider">
                <span>OR INSTANT DEMO LOGIN (PASSWORD: password123)</span>
              </div>
              <div className="demo-accounts-row">
                {DEMO_USERS.map((demo) => (
                  <button
                    key={demo.username}
                    type="button"
                    className="demo-account-pill"
                    onClick={() => handleDemoSelect(demo)}
                    title={`Instant login as @${demo.username} with Google Authenticator QR re-verification`}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        backgroundColor: demo.avatarColor,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 'bold',
                      }}
                    >
                      {demo.displayName[0]}
                    </div>
                    <span>{demo.displayName.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Stored Previous Chats button / indicator */}
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setIsStoredChatsOpen(true)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '9px 16px',
                  width: '100%',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0284c7',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
              >
                <Archive size={16} />
                <span>View Stored Previous Chats {storedSessionsCount > 0 ? `(${storedSessionsCount})` : ''}</span>
              </button>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                All previous chats and messages are stored locally even when logged out.
              </div>
            </div>
          </div>
        )}
      </div>

      <StoredChatsModal
        isOpen={isStoredChatsOpen}
        onClose={() => {
          setIsStoredChatsOpen(false);
          setStoredSessionsCount(getAllStoredSessions().length);
        }}
        onSelectUserForLogin={(selectedUser) => {
          setUsername(selectedUser);
          setPassword('password123');
          setMode('signin');
        }}
      />
    </div>
  );
};
