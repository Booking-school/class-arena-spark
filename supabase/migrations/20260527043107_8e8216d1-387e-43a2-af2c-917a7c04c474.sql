ALTER VIEW public.daily_quests_safe SET (security_invoker = off);
GRANT SELECT ON public.daily_quests_safe TO authenticated;