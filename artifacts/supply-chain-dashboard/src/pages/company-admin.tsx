import { Building2, ShieldCheck, UserCog, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CompanyAdminPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const canManageUsers = user.role === "owner" || user.role === "admin";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Company Administration
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your SupplyCMD company workspace and user access.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Company</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-4 w-4" />
              {user.companyName}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Company ID: {user.companyId}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Signed-in user</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCog className="h-4 w-4" />
              {user.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user.email}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Access level</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-4 w-4" />
              <Badge variant="secondary" className="capitalize">
                {user.role}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {canManageUsers
              ? "You can manage company users and invitations."
              : "You have member access to this company workspace."}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users & Invitations
          </CardTitle>
          <CardDescription>
            Company user management will be connected to the tenant-scoped
            administration API in the next step.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {canManageUsers ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              User list and invitation controls will appear here.
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Only company owners and administrators can manage users.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
