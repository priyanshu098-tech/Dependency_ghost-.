import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import NewScan from "@/pages/new-scan";
import ScanDetail from "@/pages/scan-detail";
import Settings from "@/pages/settings";
import { Ghost, Activity, Bell } from "lucide-react";

const queryClient = new QueryClient();

function Nav() {
  const [location] = useLocation();
  const navLink = (href: string, label: string, testId: string, icon?: React.ReactNode) => {
    const active = location === href;
    return (
      <Link
        href={href}
        className={`text-xs font-mono flex items-center gap-1.5 transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
        data-testid={testId}
      >
        {icon}
        {label}
      </Link>
    );
  };
  return (
    <nav className="flex items-center gap-5">
      {navLink("/scan/new", "[NEW_SCAN]", "link-new-scan")}
      {navLink("/settings", "[ALERTS]", "link-settings", <Bell className="w-3 h-3" />)}
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground">
      <header className="border-b border-border bg-card p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
            <Ghost className="w-6 h-6 text-primary" />
            <span className="font-bold tracking-tighter text-lg">DEPENDENCY_GHOST</span>
          </Link>
          <div className="h-4 w-px bg-border mx-2" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Activity className="w-3 h-3 text-primary animate-pulse" />
            <span>SYSTEM: ONLINE</span>
          </div>
        </div>
        <Nav />
      </header>
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scan/new" component={NewScan} />
      <Route path="/scan/:id" component={ScanDetail} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
