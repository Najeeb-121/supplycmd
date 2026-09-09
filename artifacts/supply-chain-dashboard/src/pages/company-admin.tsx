import { Building2, ShieldCheck, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompanyInvitationsQueryKey,
  useCreateCompanyInvitation,
  useListCompanyInvitations,
  useListCompanyUsers,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CompanyAdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createInvitation = useCreateCompanyInvitation();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [createdInvitationToken, setCreatedInvitationToken] = useState<string | null>(
    null,
  );
  const {
    data: companyUsers = [],
    isLoading: usersLoading,
    isError: usersError,
  } = useListCompanyUsers();

  const {
    data: companyInvitations = [],
    isLoading: invitationsLoading,
    isError: invitationsError,
  } = useListCompanyInvitations();

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
            Company Users
          </CardTitle>
          <CardDescription>
            Users who currently belong to {user.companyName}.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : usersError ? (
            <p className="text-sm text-destructive">
              Unable to load company users.
            </p>
          ) : companyUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company users found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsers.map((companyUser) => (
                    <tr key={companyUser.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">{companyUser.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {companyUser.email}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="capitalize">
                          {companyUser.role}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite User</CardTitle>
          <CardDescription>
            Invite an administrator or member to {user.companyName}.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            className="grid gap-4 md:grid-cols-[1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();

              const email = inviteEmail.trim();
              if (!email) return;

              setCreatedInvitationToken(null);

              createInvitation.mutate(
                {
                  data: {
                    email,
                    role: inviteRole,
                  },
                },
                {
                  onSuccess: (result) => {
                    setInviteEmail("");
                    setCreatedInvitationToken(result.token);

                    void queryClient.invalidateQueries({
                      queryKey: getListCompanyInvitationsQueryKey(),
                    });
                  },
                },
              );
            }}
          >
            <Input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />

            <Select
              value={inviteRole}
              onValueChange={(value) =>
                setInviteRole(value as "admin" | "member")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="submit"
              disabled={!inviteEmail.trim() || createInvitation.isPending}
            >
              {createInvitation.isPending ? "Sending..." : "Create Invitation"}
            </Button>
          </form>

          {createInvitation.isError && (
            <p className="text-sm text-destructive">
              Unable to create the invitation. The email may already belong to an
              existing SupplyCMD account.
            </p>
          )}

          {createdInvitationToken && (
            <div className="rounded-md border bg-muted/40 p-4">
              <p className="text-sm font-medium">Invitation token</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy this token now. SupplyCMD only returns the raw token when an
                invitation is created or resent.
              </p>
              <code className="mt-3 block break-all rounded bg-background p-3 text-xs">
                {createdInvitationToken}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>
            Invitations created for {user.companyName}.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {invitationsLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading invitations...
            </p>
          ) : invitationsError ? (
            <p className="text-sm text-destructive">
              Unable to load company invitations.
            </p>
          ) : companyInvitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invitations found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Role</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {companyInvitations.map((invitation) => {
                    const status = invitation.acceptedAt
                      ? "Accepted"
                      : new Date(invitation.expiresAt).getTime() < Date.now()
                        ? "Expired"
                        : "Pending";

                    return (
                      <tr key={invitation.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">{invitation.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="capitalize">
                            {invitation.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{status}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
