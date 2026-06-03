
-- Fix 1: revoke direct read of quiz answer keys from students
REVOKE SELECT (questions) ON public.daily_quests FROM authenticated;
REVOKE SELECT (questions) ON public.daily_quests FROM anon;

-- Fix 2: convert daily_quests_safe view to security_invoker so RLS applies as the caller
ALTER VIEW public.daily_quests_safe SET (security_invoker = on);

-- Fix 3: revoke direct read of classroom join codes; teachers/admins use get_classroom_join_code RPC
REVOKE SELECT (join_code) ON public.classrooms FROM authenticated;
REVOKE SELECT (join_code) ON public.classrooms FROM anon;
