import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/common/Layout';
import LoginPage from './pages/LoginPage';

const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const UserManagement = lazy(() => import('./components/users/UserManagement'));
const OrgChart = lazy(() => import('./components/org/OrgChart'));
const ClientManagement = lazy(() => import('./components/clients/ClientManagement'));
const PolicyManagement = lazy(() => import('./components/policies/PolicyManagement'));
const CollectionManagement = lazy(() => import('./components/collections/CollectionManagement'));
const TargetManagement = lazy(() => import('./components/targets/TargetManagement'));
const TaskManagement = lazy(() => import('./components/tasks/TaskManagement'));
const Notifications = lazy(() => import('./components/notifications/Notifications'));
const MonthClosing = lazy(() => import('./components/closing/MonthClosing'));
const Reports = lazy(() => import('./components/reports/Reports'));
const AuditLogPage = lazy(() => import('./components/audit/AuditLog'));
const SystemSettings = lazy(() => import('./components/settings/SystemSettings'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="/users" element={<Suspense fallback={<PageLoader />}><UserManagement /></Suspense>} />
        <Route path="/org" element={<Suspense fallback={<PageLoader />}><OrgChart /></Suspense>} />
        <Route path="/clients" element={<Suspense fallback={<PageLoader />}><ClientManagement /></Suspense>} />
        <Route path="/policies" element={<Suspense fallback={<PageLoader />}><PolicyManagement /></Suspense>} />
        <Route path="/collections" element={<Suspense fallback={<PageLoader />}><CollectionManagement /></Suspense>} />
        <Route path="/targets" element={<Suspense fallback={<PageLoader />}><TargetManagement /></Suspense>} />
        <Route path="/tasks" element={<Suspense fallback={<PageLoader />}><TaskManagement /></Suspense>} />
        <Route path="/notifications" element={<Suspense fallback={<PageLoader />}><Notifications /></Suspense>} />
        <Route path="/closing" element={<Suspense fallback={<PageLoader />}><MonthClosing /></Suspense>} />
        <Route path="/reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
        <Route path="/audit" element={<Suspense fallback={<PageLoader />}><AuditLogPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SystemSettings /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-center"
            toastOptions={{
              className: 'text-sm font-medium',
              duration: 3000,
              style: { borderRadius: '12px', padding: '12px 16px' },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
