import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useLogout as useLogoutMutation, getGetCurrentUserQueryKey } from "@workspace/api-client-react";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const logoutMutation = useLogoutMutation();

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
        queryClient.invalidateQueries();
        window.location.href = "/";
      },
    });
  }

  return {
    user: isError ? null : user,
    isLoading,
    isAuthenticated: !isError && !!user,
    logout,
  };
}