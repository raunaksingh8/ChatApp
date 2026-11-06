import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import InstallAppButton from '../components/InstallAppButton';
import '../styles/Signup.css';
import '../styles/Login.css';

export const Login = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Check if redirected with registration state or prefilled username
  useEffect(() => {
    if (location.state?.registeredUsername) {
      setUsername(location.state.registeredUsername);
      setInfoMessage('Account created successfully! Please enter your password to sign in.');
    } else {
      const savedUser = localStorage.getItem('pulsechat_remembered_user');
      if (savedUser) {
        setUsername(savedUser);
      }
    }
  }, [location.state]);

  // If already logged in, redirect to /chat
  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setLoading(true);

    try {
      await login(trimmedUser, password);

      // Handle remember me securely (store username only, NEVER store password)
      if (rememberMe) {
        localStorage.setItem('pulsechat_remembered_user', trimmedUser);
      } else {
        localStorage.removeItem('pulsechat_remembered_user');
      }

      navigate('/chat');
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        'Unable to log in. Please check your credentials or backend server.';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon-badge">
            <LogIn size={26} />
          </div>
          <p className="auth-brand">LetUsChat</p>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Private conversations, without the noise.</p>
        </div>

        {infoMessage && (
          <div className="auth-alert auth-alert-success" role="status">
            <CheckCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="auth-alert auth-alert-error" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">
              Username
            </label>
            <div className="input-wrapper">
              <User className="input-icon-left" size={18} />
              <input
                id="login-username"
                type="text"
                className="form-input"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <div className="input-wrapper">
              <Lock className="input-icon-left" size={18} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="input-action-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-options">
            <label className="remember-label">
              <input
                type="checkbox"
                className="remember-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember username</span>
            </label>
          </div>

          <button
            type="submit"
            className="btn-auth-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Log In</span>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>Don't have an account? </span>
          <Link to="/signup">Register here</Link>
        </div>

        <InstallAppButton />
      </div>
    </div>
  );
};

export default Login;
