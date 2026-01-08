import { Route, Switch } from 'wouter'
import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Materiais from './pages/Materiais'
import Flowise from './pages/Flowise'
import Gamma from './pages/Gamma'
import PII from './pages/PII'
import Settings from './pages/Settings'
import HealthCheck from './pages/HealthCheck'
import AdminDashboard from './pages/AdminDashboard'
import AdminOrganizations from './pages/AdminOrganizations'
import AdminUsers from './pages/AdminUsers'
import AdminMateriais from './pages/AdminMateriais'
import CertificateGenerator from './pages/CertificateGenerator'
import MyCertificate from './pages/MyCertificate'
import NPS from './pages/NPS'
import NPSDashboard from './pages/NPSDashboard'
import AdminCredentials from './pages/AdminCredentials'
import AdminStorage from './pages/AdminStorage'
import FlowiseConfig from './pages/FlowiseConfig'
import DeepAnalysis from './pages/DeepAnalysis'
import ElevenLabsWidget from './components/ElevenLabsWidget'

function App() {
  const { isAuthenticated, loading, isSuperAdmin, features } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <>
      <Switch>
        <Route path="/" component={Materiais} />
        <Route path="/flowise" component={Flowise} />
        <Route path="/gamma" component={Gamma} />
        <Route path="/pii" component={PII} />
        <Route path="/deep-analysis" component={DeepAnalysis} />
        <Route path="/nps" component={NPS} />
        <Route path="/my-certificate" component={MyCertificate} />
        <Route path="/settings" component={Settings} />
        <Route path="/health-check" component={HealthCheck} />
        {isSuperAdmin && <Route path="/admin" component={AdminDashboard} />}
        {isSuperAdmin && <Route path="/admin/organizations" component={AdminOrganizations} />}
        {isSuperAdmin && <Route path="/admin/users" component={AdminUsers} />}
        {isSuperAdmin && <Route path="/nps/dashboard" component={NPSDashboard} />}
        {isSuperAdmin && <Route path="/admin/certificates" component={CertificateGenerator} />}
        {isSuperAdmin && <Route path="/admin/credentials" component={AdminCredentials} />}
        {isSuperAdmin && <Route path="/admin/storage" component={AdminStorage} />}
        {features.courseManagement && <Route path="/admin/materiais" component={AdminMateriais} />}
        <Route path="/flowise/config" component={FlowiseConfig} />
        <Route>
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <h1 className="text-2xl font-bold text-white">404 - Página não encontrada</h1>
          </div>
        </Route>
      </Switch>
      <ElevenLabsWidget />
    </>
  )
}

export default App
