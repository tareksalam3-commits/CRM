import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/layout';
import {
  LoginPage,
  DashboardPage,
  UsersPage,
  BranchesPage,
  OrganizationPage,
  ClientsPage,
  PoliciesPage,
  CollectionsPage,
  TargetsPage,
  ReportsPage,
  MonthClosingPage,
  NotificationsPage,
  TasksPage,
  AuditLogPage,
  SettingsPage,
} from './pages';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (profile) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'development_manager']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="branches"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'development_manager']}>
              <BranchesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="organization"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'development_manager', 'general_supervisor']}>
              <OrganizationPage />
            </ProtectedRoute>
          }
        />

        <Route path="clients" element={<ClientsPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="targets" element={<TargetsPage />} />
        <Route path="reports" element={<ReportsPage />} />

        <Route
          path="month-closing"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'development_manager']}>
              <MonthClosingPage />
            </ProtectedRoute>
          }
        />

        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="tasks" element={<TasksPage />} />

        <Route
          path="audit-log"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
