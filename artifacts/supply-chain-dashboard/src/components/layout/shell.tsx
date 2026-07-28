import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  BarChart3, 
  Boxes, 
  Calculator, 
  LayoutDashboard, 
  Truck,
  Upload
} from "lucide-react";

const navItems = [
  { path: "/", label: "Executive Dashboard", icon: LayoutDashboard },
  { path: "/inventory", label: "Inventory", icon: Boxes },
  { path: "/production", label: "Production", icon: Activity },
  { path: "/demand", label: "Demand Planning", icon: BarChart3 },
  { path: "/logistics", label: "Logistics", icon: Truck },
  { path: "/equations", label: "Equations Reference", icon: Calculator },
  { path: "/import", label: "ERP Import", icon: Upload },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Fixed Sidebar */}
      <aside className="w-64 fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
              SC
            </div>
            <span className="font-bold tracking-tight">SupplyCmd</span>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-3">
            Operations
          </div>
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-foreground">
              PM
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground">Prod Manager</span>
              <span className="text-xs text-sidebar-foreground/60">Shift 1 Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-w-0">
        {children}
      </main>
    </div>
  );
}
