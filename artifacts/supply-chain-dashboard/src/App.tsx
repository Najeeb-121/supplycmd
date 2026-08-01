import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AppShell } from './components/layout/shell';
import NotFound from '@/pages/not-found';
import { useAuth } from '@/lib/auth';

import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import DashboardPage from './pages/dashboard';
import InventoryPage from './pages/inventory';
import ProductionPage from './pages/production';
import DemandPage from './pages/demand';
import LogisticsPage from './pages/logistics';
import EquationsPage from './pages/equations';
import ImportPage from './pages/import';
import ErpIntegrationPage from './pages/erp-integration';
import OperationalIntelligencePage from './pages/operational-intelligence';
import AiDecisionEnginePage from './pages/ai-decision-engine';
import ExecutiveIntelligencePage from './pages/executive-intelligence';

const queryClient = new QueryClient();

function AuthedApp() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/production" component={ProductionPage} />
        <Route path="/demand" component={DemandPage} />
        <Route path="/logistics" component={LogisticsPage} />
        <Route path="/equations" component={EquationsPage} />
        <Route path="/import" component={ImportPage} />
        <Route path="/erp-integration" component={ErpIntegrationPage} />
        <Route path="/operational-intelligence" component={OperationalIntelligencePage} />
        <Route path="/ai-decision-engine" component={AiDecisionEnginePage} />
        <Route path="/executive-intelligence" component={ExecutiveIntelligencePage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <LoginPage />}
      </Route>
      <Route path="/signup">
        {isAuthenticated ? <Redirect to="/" /> : <SignupPage />}
      </Route>
      <Route>
        {isLoading ? null : isAuthenticated ? <AuthedApp /> : <Redirect to="/login" />}
      </Route>
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