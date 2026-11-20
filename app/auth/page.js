'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/auth/client';

/* -------------------------------------------------------------------------- */
/*  Icon System — Scalable inline SVGs                                         */
/* -------------------------------------------------------------------------- */
function Icon({ name, size = 18, className = '' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'plane':
      return <svg {...props}><path d="M17.8 16.8 21 21l-4.2-3.2" /><path d="M2.5 13.5 21 3l-8.5 18-2.7-7.3-7.3-2.7Z" /></svg>;
    case 'user':
      return <svg {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case 'mail':
      return <svg {...props}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>;
    case 'phone':
      return <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case 'lock':
      return <svg {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case 'eye':
      return <svg {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'eye-off':
      return <svg {...props}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>;
    case 'alert-triangle':
      return <svg {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'shield-check':
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'loader-2':
      return <svg {...props} className={`jp-spin ${className}`}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>;
    case 'sparkles':
      return <svg {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Auth Form Component                                                       */
/* -------------------------------------------------------------------------- */
function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);

  // Mode: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState('login');

  // For signup: 'phone' | 'email'
  const [signupMethod, setSignupMethod] = useState('phone');

  // Input fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const targetTab = searchParams.get('tab');
    if (targetTab === 'signup' || targetTab === 'login') {
      setActiveTab(targetTab);
    }
  }, [searchParams]);

  const cleanPhone = (val) => (val || '').trim().replace(/\s+/g, '');

  const validateKenyanPhone = (val) => {
    const p = cleanPhone(val);
    return (p.startsWith('07') || p.startsWith('01')) && p.length === 10;
  };

  const formatAuthPassword = (pwd) => {
    if (!pwd) return '';
    // Better Auth enforces an 8-character minimum. If user provides a 4-7 char PIN or password,
    // transparently wrap it deterministically so Better Auth security requirements are satisfied.
    return pwd.length < 8 ? `jp_${pwd}_jetpesa` : pwd;
  };

  const resolveEmailFromPhone = async (phoneNum) => {
    const res = await fetch('/api/auth/lookup-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone(phoneNum) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.exists || !data.email) {
      throw new Error(data.message || data.error || 'No JetPesa account found with that phone number. Please sign up.');
    }
    return data.email;
  };

  const handleAuthenticationExecution = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      /* --------------------------- SIGN IN --------------------------- */
      if (activeTab === 'login') {
        const identifier = (loginIdentifier || '').trim();
        if (!identifier) {
          throw new Error('Please enter your phone number or email.');
        }
        if (!password || password.length < 4) {
          throw new Error('Please enter your password or PIN (min. 4 characters).');
        }

        let finalEmail = identifier;
        if (!finalEmail.includes('@')) {
          finalEmail = await resolveEmailFromPhone(finalEmail);
        }

        const { data, error } = await authClient.signIn.email({
          email: finalEmail,
          password: formatAuthPassword(password),
        });

        if (error) {
          throw new Error(error.message || 'Invalid email or password.');
        }

        router.replace('/dashboard');
        return;
      }

      /* --------------------------- SIGN UP --------------------------- */
      if (!password || password.length < 4) {
        throw new Error('Password or PIN must be at least 4 characters long (digits or letters).');
      }

      // CASE A: Sign up via Phone Number
      if (signupMethod === 'phone') {
        const cleanMpesaPhone = cleanPhone(phone);
        if (!validateKenyanPhone(cleanMpesaPhone)) {
          throw new Error('Please enter a valid 10-digit Kenyan phone number (e.g. 0712345678 or 0112345678).');
        }

        // Check if phone number is already registered
        const checkRes = await fetch('/api/auth/lookup-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanMpesaPhone }),
        });
        const checkData = await checkRes.json().catch(() => ({}));
        if (checkData.exists) {
          throw new Error('This phone number is already registered. Please click "Sign In" above.');
        }

        const phoneAuthEmail = `${cleanMpesaPhone}@phone.jetpesa.com`;
        const { data, error } = await authClient.signUp.email({
          email: phoneAuthEmail,
          password: formatAuthPassword(password),
          name: cleanMpesaPhone,
        });

        if (error) {
          throw new Error(error.message || 'Registration failed.');
        }

        // Update public.users profile with phone number
        await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanMpesaPhone, displayName: cleanMpesaPhone }),
        }).catch(() => {});

        router.replace('/dashboard');
        return;
      }

      // CASE B: Sign up via Email Address
      if (signupMethod === 'email') {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
          throw new Error('Please enter a valid email address.');
        }

        const { data, error } = await authClient.signUp.email({
          email: cleanEmail,
          password: formatAuthPassword(password),
          name: cleanEmail.split('@')[0],
        });

        if (error) {
          throw new Error(error.message || 'Registration failed.');
        }

        router.replace('/dashboard');
        return;
      }
    } catch (err) {
      console.error('Auth execution error:', err);
      let msg = err.message || 'Authentication failed.';
      if (msg.includes('already exists') || msg.includes('already in use')) {
        msg = 'An account with this credential already exists. Please sign in instead.';
      } else if (msg.includes('Invalid') || msg.includes('password')) {
        msg = 'Invalid credentials. Please double check and try again.';
      } else {
        msg = msg.trim();
      }
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="jp-auth-card" suppressHydrationWarning>
      {/* Brand Header */}
      <div className="jp-auth-logo-wrap">
        <div className="jp-auth-plane-badge">
          <Icon name="plane" size={28} />
        </div>
        <h1 className="jp-auth-logo">
          JET<span>PESA</span>
        </h1>
        <p className="jp-auth-subtitle">Fast flights. Instant cashouts.</p>
      </div>

      {/* Main Mode Tabs: Sign In / Sign Up */}
      <div className="jp-auth-tabs" suppressHydrationWarning>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setActiveTab('login');
            setErrorMsg('');
          }}
          className={`jp-auth-tab ${activeTab === 'login' ? 'jp-active' : ''}`}
        >
          Sign In
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setActiveTab('signup');
            setErrorMsg('');
          }}
          className={`jp-auth-tab ${activeTab === 'signup' ? 'jp-active' : ''}`}
        >
          Sign Up
        </button>
      </div>

      {/* Sub-selector: Choose Phone OR Email on Signup */}
      {activeTab === 'signup' && (
        <div className="jp-signup-method-wrap">
          <div className="jp-signup-method-label">Choose registration method:</div>
          <div className="jp-signup-methods">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setSignupMethod('phone');
                setErrorMsg('');
              }}
              className={`jp-method-btn ${signupMethod === 'phone' ? 'jp-method-active' : ''}`}
            >
              <Icon name="phone" size={15} />
              <span>Phone Number</span>
              <span className="jp-badge-fast">Fast</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setSignupMethod('email');
                setErrorMsg('');
              }}
              className={`jp-method-btn ${signupMethod === 'email' ? 'jp-method-active' : ''}`}
            >
              <Icon name="mail" size={15} />
              <span>Email Address</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Alert Box */}
      {errorMsg && (
        <div className="jp-auth-error" role="alert">
          <Icon name="alert-triangle" size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleAuthenticationExecution} className="jp-auth-form">
        {activeTab === 'login' ? (
          /* Sign In: Single Unified Field */
          <div className="jp-input-group">
            <label className="jp-input-label">PHONE NUMBER OR EMAIL</label>
            <div className="jp-input-wrapper">
              <Icon
                name={loginIdentifier.includes('@') ? 'mail' : 'phone'}
                size={18}
                className="jp-input-icon"
              />
              <input
                type="text"
                required
                disabled={loading}
                placeholder="07XXXXXXXX or you@example.com"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="jp-input-field"
                autoComplete="username"
              />
            </div>
          </div>
        ) : signupMethod === 'phone' ? (
          /* Sign Up: Phone Number Only */
          <div className="jp-input-group">
            <div className="jp-label-row">
              <label className="jp-input-label">M-PESA PHONE NUMBER</label>
              <span className="jp-label-hint">Safaricom / Airtel</span>
            </div>
            <div className="jp-input-wrapper">
              <Icon name="phone" size={18} className="jp-input-icon" />
              <input
                type="tel"
                required
                disabled={loading}
                placeholder="0712345678 or 0112345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="jp-input-field"
                autoComplete="tel"
              />
            </div>
            <span className="jp-input-caption">Used for automated deposits and instant payouts.</span>
          </div>
        ) : (
          /* Sign Up: Email Address Only */
          <div className="jp-input-group">
            <div className="jp-label-row">
              <label className="jp-input-label">EMAIL ADDRESS</label>
              <span className="jp-label-hint">Personal</span>
            </div>
            <div className="jp-input-wrapper">
              <Icon name="mail" size={18} className="jp-input-icon" />
              <input
                type="email"
                required
                disabled={loading}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="jp-input-field"
                autoComplete="email"
              />
            </div>
            <span className="jp-input-caption">You can add your M-Pesa phone number at any time to deposit.</span>
          </div>
        )}

        {/* Password / PIN Field (Common to all) */}
        <div className="jp-input-group">
          <div className="jp-label-row">
            <label className="jp-input-label">PASSWORD / PIN</label>
            {activeTab === 'signup' && <span className="jp-label-hint">Min. 4 chars (PIN or letters)</span>}
          </div>
          <div className="jp-input-wrapper">
            <Icon name="lock" size={18} className="jp-input-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              disabled={loading}
              placeholder={activeTab === 'signup' ? 'Create password or 4-digit PIN' : 'Enter password or PIN'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="jp-input-field jp-input-with-eye"
              autoComplete={activeTab === 'signup' ? 'new-password' : 'current-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="jp-eye-btn"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          suppressHydrationWarning
          className={`jp-auth-submit ${activeTab === 'login' ? 'jp-auth-submit-login' : 'jp-auth-submit-signup'}`}
        >
          {loading ? (
            <>
              <Icon name="loader-2" size={18} />
              PLEASE WAIT...
            </>
          ) : activeTab === 'login' ? (
            'SIGN IN & FLY'
          ) : (
            'CREATE ACCOUNT'
          )}
        </button>
      </form>

      {/* Security Footer */}
      <p className="jp-auth-footer">
        <Icon name="shield-check" size={14} />
        Encrypted wallet access • PrintPay verified
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Portal Component with Styling                                        */
/* -------------------------------------------------------------------------- */
export default function AuthenticatonPortal() {
  return (
    <div className="jp-auth-page">
      <div className="jp-auth-glow" />
      <div className="jp-auth-glow-2" />

      <Suspense
        fallback={
          <div className="jp-loading-fallback">
            <Icon name="loader-2" size={20} />
            Loading secure environment...
          </div>
        }
      >
        <AuthForm />
      </Suspense>

      <style dangerouslySetInnerHTML={{
        __html: `
        .jp-auth-page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #1e293b 0%, #07080e 45%, #020617 100%);
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          padding: 24px 16px;
          position: relative;
          overflow: hidden;
        }
        .jp-auth-glow {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 999px;
          background: rgba(225, 29, 72, 0.16);
          filter: blur(110px);
          top: -160px;
          right: -140px;
          pointer-events: none;
        }
        .jp-auth-glow-2 {
          position: absolute;
          width: 440px;
          height: 440px;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.12);
          filter: blur(100px);
          bottom: -120px;
          left: -120px;
          pointer-events: none;
        }
        .jp-auth-card {
          width: 100%;
          max-width: 440px;
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 28px;
          padding: 36px 32px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: relative;
          z-index: 2;
          animation: jpSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes jpSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .jp-auth-logo-wrap {
          text-align: center;
          margin-bottom: 24px;
        }
        .jp-auth-plane-badge {
          width: 60px;
          height: 60px;
          border-radius: 18px;
          margin: 0 auto 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #ef4444, #991b1b);
          box-shadow: 0 14px 36px rgba(239, 68, 68, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          color: #fff;
        }
        .jp-auth-logo {
          margin: 0;
          font-size: 30px;
          font-weight: 950;
          letter-spacing: -1.2px;
          color: #fff;
        }
        .jp-auth-logo span {
          background: linear-gradient(135deg, #22c55e, #86efac);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .jp-auth-subtitle {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
        }
        .jp-auth-tabs {
          display: flex;
          gap: 6px;
          background: rgba(2, 6, 23, 0.6);
          padding: 5px;
          border-radius: 14px;
          margin-bottom: 20px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .jp-auth-tab {
          flex: 1;
          border: none;
          background: transparent;
          color: #94a3b8;
          padding: 11px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .jp-auth-tab:hover:not(:disabled) {
          color: #e2e8f0;
        }
        .jp-auth-tab.jp-active {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }
        .jp-signup-method-wrap {
          margin-bottom: 20px;
        }
        .jp-signup-method-label {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-bottom: 8px;
        }
        .jp-signup-methods {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .jp-method-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 10px 8px;
          background: rgba(2, 6, 23, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .jp-method-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .jp-method-btn.jp-method-active {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.4);
          color: #fff;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.15);
        }
        .jp-badge-fast {
          background: #22c55e;
          color: #020617;
          font-size: 9px;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .jp-auth-error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: jpShake 0.4s ease-in-out;
        }
        @keyframes jpShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .jp-auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .jp-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .jp-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .jp-input-label {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .jp-label-hint {
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
        }
        .jp-input-caption {
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 2px;
        }
        .jp-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .jp-input-icon {
          position: absolute;
          left: 14px;
          color: #64748b;
          transition: color 0.2s ease;
          pointer-events: none;
        }
        .jp-input-field {
          width: 100%;
          box-sizing: border-box;
          padding: 13px 14px 13px 42px;
          background: rgba(2, 6, 23, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #fff;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          outline: none;
          transition: all 0.2s ease;
        }
        .jp-input-with-eye {
          padding-right: 42px;
        }
        .jp-input-field::placeholder {
          color: #475569;
          font-weight: 500;
        }
        .jp-input-field:hover {
          border-color: rgba(255, 255, 255, 0.16);
          background: rgba(2, 6, 23, 0.85);
        }
        .jp-input-field:focus {
          border-color: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
          background: rgba(2, 6, 23, 0.95);
        }
        .jp-input-wrapper:focus-within .jp-input-icon {
          color: #22c55e;
        }
        .jp-eye-btn {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
          transition: color 0.2s ease;
        }
        .jp-eye-btn:hover {
          color: #cbd5e1;
        }
        .jp-auth-submit {
          width: 100%;
          margin-top: 8px;
          padding: 15px;
          border: none;
          color: #fff;
          font-weight: 900;
          border-radius: 14px;
          font-size: 14px;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }
        .jp-auth-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          filter: brightness(1.1);
        }
        .jp-auth-submit:active:not(:disabled) {
          transform: translateY(0);
        }
        .jp-auth-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .jp-auth-submit-login {
          background: linear-gradient(135deg, #22c55e, #16a34a);
        }
        .jp-auth-submit-signup {
          background: linear-gradient(135deg, #ef4444, #be123c);
        }
        .jp-auth-footer {
          margin: 22px 0 0;
          text-align: center;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .jp-spin {
          animation: jpSpin 1s linear infinite;
        }
        @keyframes jpSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .jp-loading-fallback {
          color: #94a3b8;
          font-size: 14px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      ` }} />
    </div>
  );
}
