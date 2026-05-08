import { useQueryClient } from "@tanstack/react-query";

/**
 * Typed shorthand over `useQueryClient` for the most common cache operations.
 *
 * Usage:
 *   const { invalidate, reset } = useCache();
 *   invalidate(["admin-users"]);
 *   reset(["admin-orders"]);
 */
export function useCache() {
  const queryClient = useQueryClient();

  function invalidate(keys: string[]) {
    queryClient.invalidateQueries({ queryKey: keys });
  }

  function reset(keys: string[]) {
    queryClient.resetQueries({ queryKey: keys });
  }

  return { invalidate, reset, queryClient };
}
