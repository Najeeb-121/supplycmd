import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppShell } from './components/layout/shell';
import NotFound from '@/pages/not-found';

import DashboardPage from './pages/dashboard';
import InventoryPage from './pages/inventory';
import ProductionPage from './pages/production';
import DemandPage from './pages/demand';
import LogisticsPage from './pages/logistics';
import EquationsPage from './pages/equations';
import ImportPage from './pages/import';
import ErpIntegrationPage from './pages/erp-integration';

const queryClient = new QueryClient();

function Router() {
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
        <Route component={NotFound} />
      </Switch>
    </AppShell>
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
