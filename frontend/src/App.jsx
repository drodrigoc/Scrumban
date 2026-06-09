import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Layout from './components/layout/Layout';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import KanbanBoard from './pages/KanbanBoard';
import CalendarView from './pages/CalendarView';
import GanttView from './pages/GanttView';
import BacklogView from './pages/BacklogView';
import TeamView from './pages/TeamView';
import UnitsAdmin from './pages/UnitsAdmin';
import Users from './pages/Users';
import SGCAdmin from './pages/SGCAdmin';
import MyTasks from './pages/MyTasks';
import NotFound from './pages/NotFound';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="my-tasks" element={<MyTasks />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects/:id/backlog" element={<BacklogView />} />
        <Route path="projects/:id/kanban" element={<KanbanBoard />} />
        <Route path="projects/:id/calendar" element={<CalendarView />} />
        <Route path="projects/:id/gantt" element={<GanttView />} />
        <Route path="team" element={
          <PrivateRoute roles={['admin', 'coordinator', 'superViewer']}>
            <TeamView />
          </PrivateRoute>
        } />
        <Route path="units" element={
          <PrivateRoute roles={['admin']}>
            <UnitsAdmin />
          </PrivateRoute>
        } />
        <Route path="users" element={
          <PrivateRoute roles={['admin']}>
            <Users />
          </PrivateRoute>
        } />
        <Route path="sgc" element={
          <PrivateRoute roles={['admin', 'superViewer']}>
            <SGCAdmin />
          </PrivateRoute>
        } />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function ThemedToast() {
  const { dark } = useTheme();
  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnHover
      theme={dark ? 'dark' : 'light'}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <ThemedToast />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
