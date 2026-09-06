import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

// Auth Guards
import { StaffGuard } from '@/components/guards/staff-guard';
import { PatientGuard } from '@/components/guards/patient-guard';

// Staff Pages
import LoginStaff from '@/pages/staff/login';
import Dashboard from '@/pages/staff/dashboard';
import NewAppointment from '@/pages/staff/appointments/new';
import AppointmentDetail from '@/pages/staff/appointments/[id]';
import PatientHistory from '@/pages/staff/patients/[id]/history';
import AdminStaffList from '@/pages/staff/admin/staff';
import AdminAuditLog from '@/pages/staff/admin/audit';

// Patient Pages
import PrepareLanding from '@/pages/patient/prepare/[token]/landing';
import PrepareOtp from '@/pages/patient/prepare/[token]/otp';
import PrepareConsent from '@/pages/patient/prepare/[token]/consent';
import PrepareQuestionnaire from '@/pages/patient/prepare/[token]/questionnaire';
import PrepareDocuments from '@/pages/patient/prepare/[token]/documents';
import PrepareDone from '@/pages/patient/prepare/[token]/done';

import NotFound from '@/pages/not-found';
import '@/lib/api'; // Ensure fetch patch is loaded first

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Staff Routes */}
      <Route path="/login" component={LoginStaff} />
      
      <Route path="/dashboard">
        <StaffGuard><Dashboard /></StaffGuard>
      </Route>
      <Route path="/appointments/new">
        <StaffGuard><NewAppointment /></StaffGuard>
      </Route>
      <Route path="/appointments/:id">
        <StaffGuard><AppointmentDetail /></StaffGuard>
      </Route>
      <Route path="/patients/:patientId/history">
        <StaffGuard><PatientHistory /></StaffGuard>
      </Route>
      <Route path="/admin/staff">
        <StaffGuard><AdminStaffList /></StaffGuard>
      </Route>
      <Route path="/admin/audit">
        <StaffGuard><AdminAuditLog /></StaffGuard>
      </Route>

      {/* Patient Routes */}
      <Route path="/prepare/:token" component={PrepareLanding} />
      <Route path="/prepare/:token/otp" component={PrepareOtp} />
      
      <Route path="/prepare/:token/consent">
        <PatientGuard><PrepareConsent /></PatientGuard>
      </Route>
      <Route path="/prepare/:token/questionnaire">
        <PatientGuard><PrepareQuestionnaire /></PatientGuard>
      </Route>
      <Route path="/prepare/:token/documents">
        <PatientGuard><PrepareDocuments /></PatientGuard>
      </Route>
      <Route path="/prepare/:token/done">
        <PatientGuard><PrepareDone /></PatientGuard>
      </Route>

      <Route path="/" component={() => <LoginStaff />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
