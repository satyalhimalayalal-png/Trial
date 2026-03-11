-- Prevent direct client execution of SECURITY DEFINER RPC.
-- This function should only be called by trusted server code using service_role.
revoke all on function public.accept_friend_request(bigint, uuid) from public;
revoke all on function public.accept_friend_request(bigint, uuid) from anon;
revoke all on function public.accept_friend_request(bigint, uuid) from authenticated;
grant execute on function public.accept_friend_request(bigint, uuid) to service_role;
