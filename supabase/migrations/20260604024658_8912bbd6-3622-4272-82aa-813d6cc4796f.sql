-- Restrict profile self-updates to safe (non-economy) columns
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, bio, birthday, grade_level, active_title_id) ON public.profiles TO authenticated;

-- Tighten daily_quest_attempts INSERT: students cannot self-award xp/gold/score
DROP POLICY IF EXISTS "dqa insert own" ON public.daily_quest_attempts;
CREATE POLICY "dqa insert own"
ON public.daily_quest_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND COALESCE(xp_awarded, 0) = 0
  AND COALESCE(gold_awarded, 0) = 0
  AND COALESCE(score, 0) = 0
);