import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });

  async function logout() {
    await supabase.auth.signOut();

    queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
    queryClient.clear();

    window.location.href = "/login";
  }

  return {
    user: isError ? null : user,
    isLoading,
    isAuthenticated: !isError && !!user,
    logout,
  };
}