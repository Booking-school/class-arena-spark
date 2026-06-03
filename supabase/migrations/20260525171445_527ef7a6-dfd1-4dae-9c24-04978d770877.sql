
-- 1. Sessions
CREATE TABLE public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  host_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','question_revealed','finished')),
  current_question_idx int NOT NULL DEFAULT 0,
  join_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 6)),
  question_started_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs read" ON public.quiz_sessions FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "qs host insert" ON public.quiz_sessions FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin')));
CREATE POLICY "qs host update" ON public.quiz_sessions FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "qs host delete" ON public.quiz_sessions FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- 2. Questions
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  idx int NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL, -- array of strings
  correct_idx int NOT NULL,
  time_limit_seconds int NOT NULL DEFAULT 20,
  points int NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, idx)
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qq read" ON public.quiz_questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quiz_sessions s WHERE s.id = session_id
    AND (s.host_id = auth.uid() OR is_classroom_member(s.classroom_id, auth.uid()) OR has_role(auth.uid(),'admin')))
);
CREATE POLICY "qq host all" ON public.quiz_questions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quiz_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.quiz_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- 3. Participants
CREATE TABLE public.quiz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  total_score int NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qp read" ON public.quiz_participants FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quiz_sessions s WHERE s.id = session_id
    AND (s.host_id = auth.uid() OR is_classroom_member(s.classroom_id, auth.uid()) OR has_role(auth.uid(),'admin')))
);
CREATE POLICY "qp self insert" ON public.quiz_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. Answers
CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  answer_idx int NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  time_taken_ms int NOT NULL DEFAULT 0,
  score_awarded int NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa read host or self" ON public.quiz_answers FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.quiz_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_answers;

-- 6. RPC: join by code
CREATE OR REPLACE FUNCTION public.join_quiz_by_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  uid uuid := auth.uid();
  dname text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO s FROM public.quiz_sessions WHERE join_code = upper(_code);
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรหัสควิซ'; END IF;
  IF s.status NOT IN ('lobby','active','question_revealed') THEN RAISE EXCEPTION 'ควิซจบแล้ว'; END IF;
  SELECT COALESCE(display_name, 'นักเรียน') INTO dname FROM public.profiles WHERE id = uid;
  INSERT INTO public.quiz_participants (session_id, user_id, display_name)
    VALUES (s.id, uid, dname)
    ON CONFLICT (session_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('session_id', s.id);
END; $$;
GRANT EXECUTE ON FUNCTION public.join_quiz_by_code(text) TO authenticated;

-- 7. RPC: start session
CREATE OR REPLACE FUNCTION public.start_quiz_session(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quiz_sessions WHERE id = _session_id AND host_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.quiz_sessions
    SET status = 'active', current_question_idx = 0, started_at = now(), question_started_at = now()
    WHERE id = _session_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.start_quiz_session(uuid) TO authenticated;

-- 8. RPC: reveal answer (move to revealed state)
CREATE OR REPLACE FUNCTION public.reveal_quiz_question(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quiz_sessions WHERE id = _session_id AND host_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.quiz_sessions SET status = 'question_revealed' WHERE id = _session_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.reveal_quiz_question(uuid) TO authenticated;

-- 9. RPC: next question
CREATE OR REPLACE FUNCTION public.next_quiz_question(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  total int;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = _session_id AND host_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COUNT(*) INTO total FROM public.quiz_questions WHERE session_id = _session_id;
  IF s.current_question_idx + 1 >= total THEN
    UPDATE public.quiz_sessions SET status='finished', finished_at=now() WHERE id=_session_id;
    RETURN jsonb_build_object('finished', true);
  END IF;
  UPDATE public.quiz_sessions
    SET current_question_idx = current_question_idx + 1,
        status = 'active',
        question_started_at = now()
    WHERE id = _session_id;
  RETURN jsonb_build_object('finished', false);
END; $$;
GRANT EXECUTE ON FUNCTION public.next_quiz_question(uuid) TO authenticated;

-- 10. RPC: finish session + award XP/gold to top 3
CREATE OR REPLACE FUNCTION public.finish_quiz_session(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record;
  rank int := 0;
  xp_bonus int;
  gold_bonus int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quiz_sessions WHERE id = _session_id AND host_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.quiz_sessions SET status='finished', finished_at=now() WHERE id=_session_id;

  FOR p IN
    SELECT user_id, total_score FROM public.quiz_participants
    WHERE session_id = _session_id AND total_score > 0
    ORDER BY total_score DESC LIMIT 3
  LOOP
    rank := rank + 1;
    xp_bonus := CASE rank WHEN 1 THEN 100 WHEN 2 THEN 60 ELSE 30 END;
    gold_bonus := CASE rank WHEN 1 THEN 50 WHEN 2 THEN 30 ELSE 15 END;
    UPDATE public.profiles
      SET xp = xp + xp_bonus, gold = gold + gold_bonus
      WHERE id = p.user_id;
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (p.user_id, '🏅 ผลควิซสด', 'คุณได้อันดับ '||rank||'! +'||xp_bonus||' XP, +'||gold_bonus||' ทอง',
      'quiz', '/classrooms');
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.finish_quiz_session(uuid) TO authenticated;

-- 11. RPC: submit answer (scoring: faster = more points)
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(_question_id uuid, _answer_idx int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q record;
  s record;
  uid uuid := auth.uid();
  elapsed_ms int;
  is_corr boolean;
  awarded int := 0;
  ratio float;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO q FROM public.quiz_questions WHERE id = _question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบคำถาม'; END IF;
  SELECT * INTO s FROM public.quiz_sessions WHERE id = q.session_id;
  IF s.status NOT IN ('active') OR s.current_question_idx <> q.idx THEN
    RAISE EXCEPTION 'ตอบไม่ทันหรือยังไม่เริ่ม';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_participants WHERE session_id = s.id AND user_id = uid) THEN
    RAISE EXCEPTION 'คุณยังไม่ได้เข้าร่วม';
  END IF;

  elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (now() - s.question_started_at)) * 1000)::int;
  IF elapsed_ms > q.time_limit_seconds * 1000 THEN RAISE EXCEPTION 'หมดเวลาแล้ว'; END IF;

  is_corr := (_answer_idx = q.correct_idx);
  IF is_corr THEN
    ratio := 1.0 - (elapsed_ms::float / (q.time_limit_seconds * 1000));
    awarded := GREATEST((q.points * 0.5)::int, (q.points * ratio)::int);
  END IF;

  INSERT INTO public.quiz_answers (session_id, question_id, user_id, answer_idx, is_correct, time_taken_ms, score_awarded)
    VALUES (s.id, _question_id, uid, _answer_idx, is_corr, elapsed_ms, awarded);

  IF awarded > 0 THEN
    UPDATE public.quiz_participants SET total_score = total_score + awarded
      WHERE session_id = s.id AND user_id = uid;
  END IF;

  RETURN jsonb_build_object('is_correct', is_corr, 'score', awarded);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, int) TO authenticated;
