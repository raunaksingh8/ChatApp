import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PWAProvider } from './context/PWAContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import OfflineBanner from './components/OfflineBanner';
import InstallModal from './components/InstallModal';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat';

// Root redirect helper based on auth status
const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <Navigate to="/chat" replace /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider>
      <PWAProvider>
        <AuthProvider>
          <Router>
            <div className="app-container">
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
          </Router>
        </AuthProvider>
      </PWAProvider>
    </ThemeProvider>
  );
}

export default App;

