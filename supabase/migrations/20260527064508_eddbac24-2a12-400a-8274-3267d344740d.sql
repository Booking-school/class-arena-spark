REVOKE EXECUTE ON FUNCTION public.self_check_in(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.self_check_in(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.self_check_in(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_check_in(text) TO service_role;