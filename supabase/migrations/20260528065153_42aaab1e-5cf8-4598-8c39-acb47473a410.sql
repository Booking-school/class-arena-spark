CREATE OR REPLACE FUNCTION public.finalize_quest_from_progress(_user_id uuid, _quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q RECORD;
  _total INT := 0;
  _max INT := 0;
  _per JSONB := '[]'::jsonb;
  _answers JSONB := '[]'::jsonb;
  _qcount INT;
  _row RECORD;
  _ratio NUMERIC;
  _xp INT;
  _gold INT;
  _is_perfect BOOLEAN;
  _answered_count INT := 0;
  _today DATE := CURRENT_DATE;
  _prof RECORD;
  _new_streak INT;
  _new_xp INT;
  _new_level INT;
  _q_max INT;
  i INT;
BEGIN
  SELECT * INTO _q FROM public.daily_quests WHERE id = _quest_id;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'quest not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_quest_attempts WHERE quest_id=_quest_id AND user_id=_user_id) THEN
    RAISE EXCEPTION 'already attempted';
  END IF;

  _qcount := COALESCE(jsonb_array_length(_q.questions), 0);
  FOR i IN 0.._qcount-1 LOOP
    _q_max := COALESCE((_q.questions->i->>'points')::int, (_q.questions->i->>'max_score')::int, 10);
    SELECT * INTO _row FROM public.daily_quest_question_progress
      WHERE user_id=_user_id AND quest_id=_quest_id AND q_index=i;
    IF FOUND AND _row.result IS NOT NULL THEN
      _total := _total + COALESCE((_row.result->>'score')::int, 0);
      _max := _max + COALESCE((_row.result->>'max_score')::int, _q_max);
      _per := _per || jsonb_build_array(_row.result);
      _answers := _answers || jsonb_build_array(COALESCE(_row.answer, ''));
      _answered_count := _answered_count + 1;
    ELSE
      _max := _max + _q_max;
      _per := _per || jsonb_build_array(jsonb_build_object(
        'idx', i, 'score', 0, 'max_score', _q_max, 'correct', false, 'feedback', 'ไม่ได้ตอบ'
      ));
      _answers := _answers || jsonb_build_array('');
    END IF;
  END LOOP;

  IF _answered_count = 0 THEN
    RAISE EXCEPTION 'no answers to finalize';
  END IF;

  _ratio := GREATEST(0, LEAST(1, _total::numeric / NULLIF(_max,0)));
  _xp := ROUND(_q.max_xp_reward * _ratio);
  _gold := ROUND(_q.max_gold_reward * _ratio);
  _is_perfect := (_max > 0 AND _total >= _max);

  INSERT INTO public.daily_quest_attempts(quest_id,user_id,answers,score,max_score,xp_awarded,gold_awarded,ai_feedback,per_question)
  VALUES (_quest_id,_user_id,_answers,_total,_max,_xp,_gold,'สรุปคะแนนจากคำตอบที่ทำไว้',_per);

  SELECT * INTO _prof FROM public.profiles WHERE id=_user_id;
  _new_streak := CASE
    WHEN _prof.last_quest_date = _today THEN _prof.streak_days
    WHEN _prof.last_quest_date = _today - INTERVAL '1 day' THEN _prof.streak_days + 1
    ELSE 1
  END;

  UPDATE public.profiles
  SET xp = xp + _xp, gold = gold + _gold,
      quests_completed = quests_completed + 1,
      perfect_scores = perfect_scores + CASE WHEN _is_perfect THEN 1 ELSE 0 END,
      streak_days = _new_streak, last_quest_date = _today,
      level = GREATEST(level, 1 + (xp + _xp)/100)
  WHERE id=_user_id
  RETURNING xp, level INTO _new_xp, _new_level;

  INSERT INTO public.classroom_scores(classroom_id,user_id,xp,quests_completed,streak_days,perfect_scores)
  VALUES (_q.classroom_id,_user_id,_xp,1,_new_streak,CASE WHEN _is_perfect THEN 1 ELSE 0 END)
  ON CONFLICT (classroom_id,user_id) DO UPDATE
  SET xp = public.classroom_scores.xp + EXCLUDED.xp,
      quests_completed = public.classroom_scores.quests_completed + 1,
      streak_days = GREATEST(public.classroom_scores.streak_days, EXCLUDED.streak_days),
      perfect_scores = public.classroom_scores.perfect_scores + EXCLUDED.perfect_scores,
      updated_at = now();

  DELETE FROM public.daily_quest_question_progress WHERE user_id=_user_id AND quest_id=_quest_id;

  RETURN jsonb_build_object(
    'xp_gained',_xp,'gold_gained',_gold,'gold_awarded',_gold,
    'score',_total,'max_score',_max,
    'total_xp',_new_xp,'level',_new_level,'streak',_new_streak,'perfect',_is_perfect
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_my_quest_progress(_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN public.finalize_quest_from_progress(_uid, _quest_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.finalize_quest_from_progress(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_my_quest_progress(uuid) TO authenticated;

-- Backfill stuck attempts
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT dqqp.user_id, dqqp.quest_id
    FROM public.daily_quest_question_progress dqqp
    LEFT JOIN public.daily_quest_attempts dqa
      ON dqa.user_id=dqqp.user_id AND dqa.quest_id=dqqp.quest_id
    WHERE dqa.id IS NULL
  LOOP
    BEGIN
      PERFORM public.finalize_quest_from_progress(r.user_id, r.quest_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % %: %', r.user_id, r.quest_id, SQLERRM;
    END;
  END LOOP;
END $$;