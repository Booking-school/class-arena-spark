
CREATE OR REPLACE VIEW public.daily_quests_safe AS
SELECT id, classroom_id, lesson_id, title, topic,
  CASE WHEN is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
    THEN questions ELSE strip_quest_answer_keys(questions) END AS questions,
  max_xp_reward, max_gold_reward, difficulty, min_level, is_active, created_by, created_at, expires_at,
  required_title_code, is_secret
FROM public.daily_quests dq
WHERE (is_classroom_owner(classroom_id, auth.uid())
   OR is_classroom_member(classroom_id, auth.uid())
   OR has_role(auth.uid(), 'admin'::app_role));

ALTER VIEW public.daily_quests_safe SET (security_invoker = off);
GRANT SELECT ON public.daily_quests_safe TO authenticated;
