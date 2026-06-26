import { useState } from 'react';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import Layout from './components/Layout';
import ToastContainer from './components/ToastContainer';
import { useToast } from './hooks/useToast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ClientsPage from './pages/ClientsPage';
import PoliciesPage from './pages/PoliciesPage';
import CollectionsPage from './pages/CollectionsPage';
import TargetsPage from './pages/TargetsPage';
import ReportsPage from './pages/ReportsPage';
import MonthlyClosingPage from './pages/MonthlyClosingPage';
import ActivityLogsPage from './pages/ActivityLogsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';

export type ToastContextType = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

function AppContent() {
  const { user, loading } = useAuthContext();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { toasts, addToast, removeToast } = useToast();

  const showSuccess = (message: string) => addToast('success', message);
  const showError = (message: string) => addToast('error', message);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    const pageProps = { showSuccess, showError };
    switch (currentPage) {
      case 'dashboard': return <DashboardPage {...pageProps} />;
      case 'users': return <UsersPage {...pageProps} />;
      case 'clients': return <ClientsPage {...pageProps} />;
      case 'policies': return <PoliciesPage {...pageProps} />;
      case 'collections': return <CollectionsPage {...pageProps} />;
      case 'targets': return <TargetsPage {...pageProps} />;
      case 'reports': return <ReportsPage {...pageProps} />;
      case 'monthly-closing': return <MonthlyClosingPage {...pageProps} />;
      case 'activity-logs': return <ActivityLogsPage {...pageProps} />;
      case 'settings': return <SettingsPage {...pageProps} />;
      case 'profile': return <ProfilePage {...pageProps} />;
      default: return <DashboardPage {...pageProps} />;
    }
  };

  return (
    <>
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </Layout>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
