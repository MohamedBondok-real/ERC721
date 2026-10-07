import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "@breastcare/shared";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { PageSkeleton } from "./components/ui/Feedback";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { Dashboard } from "./pages/patient/Dashboard";
import { RecordsPage } from "./pages/patient/Records";
import { RiskAssessmentPage } from "./pages/patient/RiskAssessment";
import { SymptomsPage } from "./pages/patient/Symptoms";
import { NutritionPage } from "./pages/patient/Nutrition";
import { NutritionPlanPage, NutritionLogPage, NutritionAdherencePage } from "./pages/patient/NutritionSubpages";
import { TreatmentPlansPage, MedicationsPage, AppointmentsPage } from "./pages/patient/Treatments";
import { ReportsPage } from "./pages/patient/Reports";
import { ConsentPage } from "./pages/patient/Consent";
import { BlockchainPage } from "./pages/patient/Blockchain";
import { AssistantPage } from "./pages/patient/Assistant";
import { KnowledgePage } from "./pages/patient/Knowledge";
import { NotificationsPage } from "./pages/patient/Notifications";
import { SettingsPage } from "./pages/patient/Settings";
import { DoctorDashboard, DoctorPatients, DoctorPatientDetail } from "./pages/doctor/DoctorPages";
import { AdminOverview } from "./pages/admin/AdminPages";

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="clinical-shell py-10">
        <PageSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;

  return <>{children}</>;
}

function Shell({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  return (
    <RequireAuth roles={roles}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

export function App() {
  const { isAuthenticated, user, isLoading } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={isAuthenticated && !isLoading ? <Navigate to="/app/dashboard" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated && !isLoading ? <Navigate to="/app/dashboard" replace /> : <Register />}
      />

      {/* Patient + shared clinical workspace */}
      <Route path="/app/dashboard" element={<Shell>{user?.role === "doctor" ? <DoctorDashboard /> : <Dashboard />}</Shell>} />
      <Route path="/app/risk-assessment" element={<Shell><RiskAssessmentPage /></Shell>} />
      <Route path="/app/symptoms" element={<Shell><SymptomsPage /></Shell>} />
      <Route path="/app/nutrition" element={<Shell><NutritionPage /></Shell>} />
      <Route path="/app/nutrition/during-treatment" element={<Shell><NutritionPlanPage phase="during-treatment" /></Shell>} />
      <Route path="/app/nutrition/recovery" element={<Shell><NutritionPlanPage phase="recovery" /></Shell>} />
      <Route path="/app/nutrition/survivorship" element={<Shell><NutritionPlanPage phase="survivorship" /></Shell>} />
      <Route path="/app/nutrition/side-effects" element={<Shell><NutritionPlanPage phase="side-effect-support" /></Shell>} />
      <Route path="/app/nutrition/plan" element={<Shell><NutritionPlanPage /></Shell>} />
      <Route path="/app/nutrition/log" element={<Shell><NutritionLogPage /></Shell>} />
      <Route path="/app/nutrition/adherence" element={<Shell><NutritionAdherencePage /></Shell>} />
      <Route path="/app/treatments" element={<Shell><TreatmentPlansPage /></Shell>} />
      <Route path="/app/treatments/plans" element={<Shell><TreatmentPlansPage /></Shell>} />
      <Route path="/app/treatments/medications" element={<Shell><MedicationsPage /></Shell>} />
      <Route path="/app/treatments/appointments" element={<Shell><AppointmentsPage /></Shell>} />
      <Route path="/app/appointments" element={<Shell><AppointmentsPage /></Shell>} />
      <Route path="/app/records" element={<Shell><RecordsPage /></Shell>} />
      <Route path="/app/reports" element={<Shell><ReportsPage /></Shell>} />
      <Route path="/app/consent" element={<Shell><ConsentPage /></Shell>} />
      <Route path="/app/blockchain" element={<Shell><BlockchainPage /></Shell>} />
      <Route path="/app/assistant" element={<Shell><AssistantPage /></Shell>} />
      <Route path="/app/knowledge" element={<Shell><KnowledgePage /></Shell>} />
      <Route path="/app/notifications" element={<Shell><NotificationsPage /></Shell>} />
      <Route path="/app/settings" element={<Shell><SettingsPage /></Shell>} />

      {/* Clinician workspace */}
      <Route path="/app/patients" element={<Shell roles={["doctor", "admin"]}><DoctorPatients /></Shell>} />
      <Route path="/app/patients/:patientId" element={<Shell roles={["doctor", "admin"]}><DoctorPatientDetail /></Shell>} />

      {/* Administration */}
      <Route path="/app/admin" element={<Shell roles={["admin"]}><AdminOverview /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
