import React from 'react';
import { AppProvider, useApp } from './app/providers/AppContext';
import { GlassHeader } from './components/navigation/GlassHeader';
import { GlobalSearchModal } from './components/navigation/GlobalSearchModal';
import { GlassButton, OfflineBanner, ToastContainer } from './components/glass/GlassPrimitives';
import { PageContainer } from './components/layout/PageContainer';
import { GlassDialog } from './components/glass/GlassOverlay';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ActivitiesPage } from './features/activities/ActivitiesPage';
import { ExhibitorsPage } from './features/exhibitors/ExhibitorsPage';
import { CertificatesPage } from './features/certificates/CertificatesPage';
import { GiftsPage } from './features/gifts/GiftsPage';
import { RedemptionPage } from './features/redemption/RedemptionPage';
import {
  AuditLogsPage,
  DepartmentsManagePage,
  GeneralSettingsPage,
  PasswordSettingsPage,
  ProfileSettingsPage,
  RedemptionSettingsPage,
  RolesManagePage,
  SecuritySettingsPage,
  SettingsHomePage,
  UsersManagePage,
} from './features/admin/AdminManagePages';
import { ExhibitorExternalPortal } from './features/external/ExhibitorExternalPortal';
import { GiftExternalPortal } from './features/external/GiftExternalPortal';

function AppShell() {
  const {
    portal,
    activeNav,
    settings,
    toasts,
    dismissToast,
    updateSystemSettings,
    pendingActivitySwitch,
    confirmPendingActivitySwitch,
    cancelPendingActivitySwitch,
  } = useApp();

  if (portal === 'login') {
    return (
      <>
        <LoginPage />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const renderContent = () => {
    if (portal === 'exhibitor') return <ExhibitorExternalPortal />;
    if (portal === 'gift') return <GiftExternalPortal />;

    switch (activeNav) {
      case 'dashboard':
        return <DashboardPage />;
      case 'activities':
        return <ActivitiesPage />;
      case 'exhibitors':
        return <ExhibitorsPage />;
      case 'certificates':
        return <CertificatesPage />;
      case 'gifts':
        return <GiftsPage />;
      case 'redemption':
        return <RedemptionPage />;
      case 'admin_settings':
        return <SettingsHomePage />;
      case 'admin_profile':
        return <ProfileSettingsPage />;
      case 'admin_password':
        return <PasswordSettingsPage />;
      case 'admin_general':
        return <GeneralSettingsPage />;
      case 'admin_redemption_settings':
        return <RedemptionSettingsPage />;
      case 'admin_security':
        return <SecuritySettingsPage />;
      case 'admin_users':
        return <UsersManagePage />;
      case 'admin_roles':
        return <RolesManagePage />;
      case 'admin_departments':
        return <DepartmentsManagePage />;
      case 'admin_audit':
        return <AuditLogsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="app-shell liquid-canvas">
      <GlassHeader />
      <main className="main-content">
        {settings?.simulateOffline && (
          <PageContainer>
            <OfflineBanner
              onReconnect={() => updateSystemSettings({ simulateOffline: false })}
            />
          </PageContainer>
        )}
        {renderContent()}
      </main>

      <GlobalSearchModal />

      <GlassDialog
        open={Boolean(pendingActivitySwitch)}
        title="确认切换活动"
        subtitle="当前表单有未保存修改，切换将放弃更改。"
        onClose={cancelPendingActivitySwitch}
        maxWidthClass="max-w-md"
      >
        <div className="flex justify-end gap-2 pt-2">
          <GlassButton variant="secondary" onClick={cancelPendingActivitySwitch}>
            留在当前活动
          </GlassButton>
          <GlassButton variant="danger" onClick={confirmPendingActivitySwitch}>
            放弃修改并切换活动
          </GlassButton>
        </div>
      </GlassDialog>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
