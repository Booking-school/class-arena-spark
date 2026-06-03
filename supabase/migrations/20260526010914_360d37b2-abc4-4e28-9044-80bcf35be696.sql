
-- 1. Helper to strip answer keys from quest questions JSONB
CREATE OR REPLACE FUNCTION public.strip_quest_answer_keys(qs jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      (q::jsonb) - 'answer' - 'expected_answer' - 'correct_answer' - 'correct'
                 - 'answer_key' - 'solution' - 'expected' - 'keywords'
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(qs, '[]'::jsonb)) q;
$$;

-- 2. Safe view for daily_quests (strips answers for non-owners)
CREATE OR REPLACE VIEW public.daily_quests_safe
WITH (security_invoker = on) AS
SELECT
  dq.id,
  dq.classroom_id,
  dq.lesson_id,
  dq.title,
  dq.topic,
  CASE
    WHEN public.is_classroom_owner(dq.classroom_id, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
    THEN dq.questions
    ELSE public.strip_quest_answer_keys(dq.questions)
  END AS questions,
  dq.max_xp_reward,
  dq.max_gold_reward,
  dq.difficulty,
  dq.min_level,
  dq.is_active,
  dq.created_by,
  dq.created_at,
  dq.expires_at
FROM public.daily_quests dq;

GRANT SELECT ON public.daily_quests_safe TO authenticated;

-- 3. Tighten daily_quests SELECT: only owners/admins can read the raw row (with answers)
DROP POLICY IF EXISTS "dq read members" ON public.daily_quests;
CREATE POLICY "dq read owner only"
  ON public.daily_quests FOR SELECT
  TO authenticated
  USING (
    public.is_classroom_owner(classroom_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 4. Safe view for quiz_questions (hides correct_idx until revealed)
CREATE OR REPLACE VIEW public.quiz_questions_safe
WITH (security_invoker = on) AS
SELECT
  q.id,
  q.session_id,
  q.idx,
  q.question,
  q.options,
  q.time_limit_seconds,
  q.points,
  q.created_at,
  CASE
    WHEN s.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR s.status = 'finished'
      OR (s.status = 'question_revealed' AND s.current_question_idx = q.idx)
      OR s.current_question_idx > q.idx
    THEN q.correct_idx
    ELSE NULL
  END AS correct_idx
FROM public.quiz_questions q
JOIN public.quiz_sessions s ON s.id = q.session_id;

GRANT SELECT ON public.quiz_questions_safe TO authenticated;

-- 5. Tighten quiz_questions SELECT: only host/admin can read raw rows (with correct_idx always)
DROP POLICY IF EXISTS "qq read" ON public.quiz_questions;
CREATE POLICY "qq read host only"
  ON public.quiz_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quiz_sessions s
      WHERE s.id = quiz_questions.session_id
        AND (s.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- 6. Remove quiz_answers from realtime broadcasts to prevent peer answer leaks
ALTER PUBLICATION supabase_realtime DROP TABLE public.quiz_answers;

-- 7. Server-side grading helper: returns the quest's full questions (with answer keys)
--    Used by the grade-quest-answer edge function with service-role; safe definer
CREATE OR REPLACE FUNCTION public.get_quest_for_grading(_quest_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT questions FROM public.daily_quests WHERE id = _quest_id;
$$;

REVOKE ALL ON FUNCTION public.get_quest_for_grading(uuid) FROM PUBLIC, anon, authenticated;
