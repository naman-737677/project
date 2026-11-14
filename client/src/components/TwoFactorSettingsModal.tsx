import React, { useState, useEffect, useRef } from 'react';
import { useAuth, TwoFactorSetupData } from '../context/AuthContext';
import { X, ShieldCheck, ShieldAlert, Copy, Check, QrCode, Lock, Key, Camera, Trash2, Loader2, User } from 'lucide-react';
import { getAvatarColor } from '../utils/avatar';

interface TwoFactorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TwoFactorSettingsModal: React.FC<TwoFactorSettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, setup2FA, enable2FA, disable2FA, refreshUserProfile, updateProfilePicture, removeProfilePicture } = useAuth();

  const [step, setStep] = useState<'status' | 'setup' | 'disable'>('status');
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('status');
      setError(null);
      setSuccessMessage(null);
      setVerifyCode('');
      setDisableCode('');
      setDisablePassword('');
      refreshUserProfile();
    }
  }, [isOpen, refreshUserProfile]);

  if (!isOpen) return null;

  const isEnabled = !!currentUser?.twoFactorEnabled;

  const handleStartSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await setup2FA();
      setSetupData(data);
      setStep('setup');
    } catch (err: any) {
      setError(err.message || 'Failed to initialize 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.trim().length !== 6) {
      setError('Please enter the 6-digit code from Google Authenticator');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await enable2FA(verifyCode.trim());
      setSuccessMessage('Two-Step Verification with Google Authenticator enabled successfully!');
      setStep('status');
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || disableCode.trim().length !== 6) {
      setError('Password and 6-digit Authenticator code are required');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await disable2FA(disablePassword, disableCode.trim());
      setSuccessMessage('Two-Step Verification has been disabled.');
      setStep('status');
    } catch (err: any) {
      setError(err.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleModalPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPhoto(true);
      await updateProfilePicture(file);
      setSuccessMessage('Profile picture updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile picture');
    } finally {
      setIsUploadingPhoto(false);
      if (modalFileInputRef.current) {
        modalFileInputRef.current.value = '';
      }
    }
  };

  const handleModalPhotoRemove = async () => {
    try {
      setIsUploadingPhoto(true);
      await removeProfilePicture();
      setSuccessMessage('Profile picture removed.');
    } catch (err: any) {
      setError(err.message || 'Failed to remove profile picture');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: isEnabled ? '#e0f2fe' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isEnabled ? '#0284c7' : '#64748b',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <h2 className="modal-title" style={{ margin: 0 }}>
              Profile & Security
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="login-error-alert" style={{ marginBottom: 16 }}>
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            <span>{successMessage}</span>
          </div>
        )}

        {/* ---------------- VIEW: STATUS ---------------- */}
        {step === 'status' && (
          <div>
            {/* User Profile Picture Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
                onClick={() => modalFileInputRef.current?.click()}
                title="Click to change profile picture"
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: currentUser?.avatarUrl
                      ? 'transparent'
                      : getAvatarColor(currentUser?.username || 'user'),
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    fontWeight: 700,
                    overflow: 'hidden',
                  }}
                >
                  {isUploadingPhoto ? (
                    <Loader2 size={20} className="spin-icon" />
                  ) : currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.displayName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    currentUser?.displayName?.[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#2481cc',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                >
                  <Camera size={12} />
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                  {currentUser?.displayName || 'User'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  @{currentUser?.username}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => modalFileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0284c7',
                      background: '#e0f2fe',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Camera size={12} />
                    <span>{currentUser?.avatarUrl ? 'Change Photo' : 'Add Profile Picture'}</span>
                  </button>
                  {currentUser?.avatarUrl && (
                    <button
                      type="button"
                      onClick={handleModalPhotoRemove}
                      disabled={isUploadingPhoto}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#dc2626',
                        background: '#fef2f2',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>

              <input
                type="file"
                ref={modalFileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleModalPhotoChange}
              />
            </div>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: isEnabled ? '#dcfce7' : '#fef3c7',
                  color: isEnabled ? '#16a34a' : '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                {isEnabled ? <ShieldCheck size={40} /> : <ShieldAlert size={40} />}
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                {isEnabled ? 'Two-Step Verification is Active' : 'Two-Step Verification is Disabled'}
              </h3>
              <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.5, maxWidth: 400, margin: '0 auto' }}>
                {isEnabled
                  ? 'Your account is protected. Every time you log in, Google Authenticator on your smartphone will be required.'
                  : 'Add an extra layer of defense. Whenever you sign in, you will be prompted for a 6-digit TOTP code generated by Google Authenticator.'}
              </p>
            </div>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!isEnabled ? (
                <button
                  className="login-btn-primary"
                  onClick={handleStartSetup}
                  disabled={loading}
                >
                  {loading ? 'Preparing QR code...' : 'Enable Google Authenticator'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep('disable')}
                  style={{
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Turn Off Two-Step Verification
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------------- VIEW: SETUP QR CODE ---------------- */}
        {step === 'setup' && setupData && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                1. Scan with Google Authenticator
              </h3>
              <p style={{ fontSize: 12.5, color: '#6b7280' }}>
                Open Google Authenticator on your phone, tap <b>+</b>, and scan this QR code.
              </p>
            </div>

            {/* QR Code Container */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div
                style={{
                  padding: 8,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <img
                  src={setupData.qrCode}
                  alt="Google Authenticator QR Code"
                  style={{ width: 190, height: 190, display: 'block' }}
                />
              </div>
            </div>

            {/* Manual Secret Key */}
            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>CANT SCAN? ENTER SECRET KEY:</span>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#0f172a', letterSpacing: 1 }}>
                    {setupData.secret}
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
                >
                  {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Verification Code Box */}
            <form onSubmit={handleConfirmEnable}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                2. Enter the 6-Digit Code from the App
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="login-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', letterSpacing: 6, fontSize: 18, fontWeight: 600 }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep('status')}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || verifyCode.trim().length !== 6}
                  style={{ flex: 2 }}
                >
                  {loading ? 'Verifying...' : 'Activate 2FA'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ---------------- VIEW: DISABLE 2FA ---------------- */}
        {step === 'disable' && (
          <form onSubmit={handleConfirmDisable}>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.5 }}>
                To disable Two-Step Verification, enter your current account password and the 6-digit code currently shown in your Google Authenticator app.
              </p>
            </div>

            <div className="input-group">
              <label className="input-label">Account Password</label>
              <div className="input-field-wrapper">
                <Lock className="input-field-icon" size={18} />
                <input
                  type="password"
                  className="login-input"
                  placeholder="Your current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">6-Digit Google Authenticator Code</label>
              <div className="input-field-wrapper">
                <Key className="input-field-icon" size={18} />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="login-input"
                  placeholder="123456"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep('status')}
                style={{ flex: 1 }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '10px 16px',
                }}
              >
                {loading ? 'Disabling...' : 'Confirm Disable'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
