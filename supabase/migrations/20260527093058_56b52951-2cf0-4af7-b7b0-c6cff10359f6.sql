CREATE OR REPLACE FUNCTION public.award_quest_attempt(
  _quest_id UUID,
  _answers JSONB,
  _score INT,
  _max_score INT,
  _feedback TEXT,
  _per_question JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _q RECORD;
  _ratio NUMERIC;
  _xp INT;
  _gold INT;
  _new_xp INT;
  _new_level INT;
  _is_perfect BOOLEAN;
  _today DATE := CURRENT_DATE;
  _prof RECORD;
  _new_streak INT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.daily_quest_attempts WHERE quest_id = _quest_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'already attempted';
  END IF;

  SELECT * INTO _q
  FROM public.daily_quests
  WHERE id = _quest_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF _q.id IS NULL THEN
    RAISE EXCEPTION 'quest not found';
  END IF;

  IF NOT (
    public.is_classroom_member(_q.classroom_id, _uid)
    OR public.is_classroom_owner(_q.classroom_id, _uid)
    OR public.has_role(_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'not a classroom member';
  END IF;

  _ratio := GREATEST(0, LEAST(1, _score::numeric / NULLIF(_max_score, 0)));
  _xp := ROUND(_q.max_xp_reward * _ratio);
  _gold := ROUND(_q.max_gold_reward * _ratio);
  _is_perfect := (_max_score > 0 AND _score >= _max_score);

  INSERT INTO public.daily_quest_attempts(
    quest_id,
    user_id,
    answers,
    score,
    max_score,
    xp_awarded,
    gold_awarded,
    ai_feedback,
    per_question
  ) VALUES (
    _quest_id,
    _uid,
    _answers,
    _score,
    _max_score,
    _xp,
    _gold,
    _feedback,
    _per_question
  );

  SELECT * INTO _prof FROM public.profiles WHERE id = _uid;
  _new_streak := CASE
    WHEN _prof.last_quest_date = _today THEN _prof.streak_days
    WHEN _prof.last_quest_date = _today - INTERVAL '1 day' THEN _prof.streak_days + 1
    ELSE 1
  END;

  UPDATE public.profiles
  SET xp = xp + _xp,
      gold = gold + _gold,
      quests_completed = quests_completed + 1,
      perfect_scores = perfect_scores + CASE WHEN _is_perfect THEN 1 ELSE 0 END,
      streak_days = _new_streak,
      last_quest_date = _today,
      level = GREATEST(level, 1 + (xp + _xp) / 100)
  WHERE id = _uid
  RETURNING xp, level INTO _new_xp, _new_level;

  INSERT INTO public.classroom_scores(
    classroom_id,
    user_id,
    xp,
    quests_completed,
    streak_days,
    perfect_scores
  ) VALUES (
    _q.classroom_id,
    _uid,
    _xp,
    1,
    _new_streak,
    CASE WHEN _is_perfect THEN 1 ELSE 0 END
  )
  ON CONFLICT (classroom_id, user_id) DO UPDATE
  SET xp = public.classroom_scores.xp + EXCLUDED.xp,
      quests_completed = public.classroom_scores.quests_completed + 1,
      streak_days = GREATEST(public.classroom_scores.streak_days, EXCLUDED.streak_days),
      perfect_scores = public.classroom_scores.perfect_scores + EXCLUDED.perfect_scores,
      updated_at = now();

  INSERT INTO public.user_achievements(user_id, achievement_id)
  SELECT _uid, a.id FROM public.achievements a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_achievements ua
    WHERE ua.user_id = _uid AND ua.achievement_id = a.id
  )
    AND (
      (a.criteria_type = 'level' AND _new_level >= a.criteria_value)
      OR (a.criteria_type = 'xp' AND _new_xp >= a.criteria_value)
      OR (a.criteria_type = 'quests' AND (SELECT quests_completed FROM public.profiles WHERE id = _uid) >= a.criteria_value)
      OR (a.criteria_type = 'perfect' AND (SELECT perfect_scores FROM public.profiles WHERE id = _uid) >= a.criteria_value)
      OR (a.criteria_type = 'streak' AND _new_streak >= a.criteria_value)
    );

  RETURN jsonb_build_object(
    'xp_gained', _xp,
    'gold_gained', _gold,
    'gold_awarded', _gold,
    'score', _score,
    'max_score', _max_score,
    'total_xp', _new_xp,
    'level', _new_level,
    'streak', _new_streak,
    'perfect', _is_perfect
  );
END;
$$;

INSERT INTO public.classroom_scores(
  classroom_id,
  user_id,
  xp,
  quests_completed,
  perfect_scores,
  streak_days
)
SELECT
  dq.classroom_id,
  dqa.user_id,
  COALESCE(SUM(dqa.xp_awarded), 0)::int AS xp,
  COUNT(*)::int AS quests_completed,
  COUNT(*) FILTER (WHERE dqa.max_score > 0 AND dqa.score >= dqa.max_score)::int AS perfect_scores,
  COALESCE(MAX(p.streak_days), 0)::int AS streak_days
FROM public.daily_quest_attempts dqa
JOIN public.daily_quests dq ON dq.id = dqa.quest_id
LEFT JOIN public.profiles p ON p.id = dqa.user_id
GROUP BY dq.classroom_id, dqa.user_id
ON CONFLICT (classroom_id, user_id) DO UPDATE
SET xp = GREATEST(public.classroom_scores.xp, EXCLUDED.xp),
    quests_completed = GREATEST(public.classroom_scores.quests_completed, EXCLUDED.quests_completed),
    perfect_scores = GREATEST(public.classroom_scores.perfect_scores, EXCLUDED.perfect_scores),
    streak_days = GREATEST(public.classroom_scores.streak_days, EXCLUDED.streak_days),
    updated_at = now();