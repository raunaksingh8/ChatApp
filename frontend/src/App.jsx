import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PWAProvider } from './context/PWAContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import OfflineBanner from './components/OfflineBanner';
import InstallModal from './components/InstallModal';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat';

// Root redirect helper based on auth status
const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <Navigate to="/chat" replace /> : <Navigate to="/login" replace />;
};

const AppContent = () => {
  const { loading } = useAuth();
  const { theme } = useTheme();
  const [showSplash, setShowSplash] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      // Trigger smooth fade-out when genuine initialization completes
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setShowSplash(false);
        // Once splash unmounts, update Android status-bar theme color to active theme
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
          metaTheme.setAttribute('content', theme === 'light' ? '#f2f8f5' : '#07110f');
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [loading, theme]);

  return (
    <>
      {showSplash && <SplashScreen isFadingOut={isFadingOut} />}
      <div className="app-container" style={{ visibility: showSplash && !isFadingOut ? 'hidden' : 'visible' }}>
        <OfflineBanner />
        <Navbar />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          {/* Fallback route */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
        <InstallModal />
      </div>
    </>
  );
};

function App() {
  return (
    <ThemeProvider>
      <PWAProvider>
        <AuthProvider>
          <Router>
            <AppContent />
          </Router>
        </AuthProvider>
      </PWAProvider>
    </ThemeProvider>
  );
}

export default App;

