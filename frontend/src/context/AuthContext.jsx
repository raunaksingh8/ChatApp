import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { disconnectSocket } from '../services/socket';
import { clearAppBadge } from '../services/appBadge';
import { ContactCache } from '../services/contactCache';

const AuthContext = createContext(null);

// Helper to parse JWT and check expiration
const isTokenValid = (jwtToken) => {
  if (!jwtToken) return false;
  try {
    const parts = jwtToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const getInitialAuth = () => {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }
  try {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && isTokenValid(storedToken)) {
      return {
        token: storedToken,
        user: storedUser ? JSON.parse(storedUser) : null,
      };
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (e) {
    console.error('Failed to restore auth session:', e);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  return { token: null, user: null };
};

export const AuthProvider = ({ children }) => {
  const [initial] = useState(getInitialAuth);
  const [user, setUser] = useState(initial.user);
  const [token, setToken] = useState(initial.token);
  const [loading, setLoading] = useState(false);

  // Logout handler
  const logout = useCallback(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.id) {
          ContactCache.clear(parsed.id);
        }
      }
    } catch (e) {
      console.error('Error clearing contact cache on logout:', e);
    }
    disconnectSocket();
    clearAppBadge();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // Listen for 401 unauthorized events from Axios interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  // Login handler
  const login = async (username, password) => {
    const data = await authAPI.login(username, password);
    if (data.success && data.token && data.user) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return data;
    }
    throw new Error(data.message || 'Login failed');
  };

  // Register handler
  const register = async (username, password) => {
    const data = await authAPI.register(username, password);
    return data;
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    loading,
    login,
    register,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
