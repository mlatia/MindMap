/**
 * App.jsx - Router untuk Mind Map Otomatis.
 *
 * Halaman:
 *   /              -> Landing (public)
 *   /login         -> Login (L-01)
 *   /register      -> Register (L-02)
 *   /dashboard     -> Dashboard daftar proyek (L-03)
 *   /new           -> Halaman Input Teks (L-04)
 *   /mindmap/:id   -> Visualisasi + Editor (L-05, L-06, L-07)
 */
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import Topbar from './components/Topbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewMindMap from './pages/NewMindMap';
import MindMapDetail from './pages/MindMapDetail';
import { getToken } from './services/api';
import './App.css';

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Topbar />
        <Routes>
          <Route path="/"          element={<Landing />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/register"  element={<Register />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/new"       element={<Protected><NewMindMap /></Protected>} />
          <Route path="/mindmap/:id" element={<Protected><MindMapDetail /></Protected>} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
