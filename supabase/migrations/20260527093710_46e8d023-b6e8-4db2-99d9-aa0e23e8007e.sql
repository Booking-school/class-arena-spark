GRANT SELECT ON public.classroom_scores TO authenticated;
GRANT ALL ON public.classroom_scores TO service_role;

GRANT SELECT, INSERT ON public.daily_quest_attempts TO authenticated;
GRANT ALL ON public.daily_quest_attempts TO service_role;