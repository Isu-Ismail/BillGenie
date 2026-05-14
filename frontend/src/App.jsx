import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/dashboard/Dashboard';
import Entry from './pages/entry/Entry';
import History from './pages/history/History';
import Reports from './pages/report/Reports';
import Settings from './pages/settings/Settings';
import Login from './pages/login/Login';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  return isAuthenticated ? (
    <div className="app-container">
      <Sidebar />
      <main className="content-area">
        {children}
      </main>
    </div>
  ) : <Navigate to="/login" />;
};

import { HistoryProvider } from './context/HistoryContext';

function App() {
  return (
    <HistoryProvider>
      <Router basename="/billgenie">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/entry" element={<ProtectedRoute><Entry /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/report" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        </Routes>
      </Router>
    </HistoryProvider>
  );
}


export default App;