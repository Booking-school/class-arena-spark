-- Phase 5: Auto-award XP/Gold for assignment grading and attendance check-in
-- Achievements are checked automatically by existing profiles trigger.

-- 1) Award XP/Gold when a submission is graded (graded_at goes from NULL to a value)
CREATE OR REPLACE FUNCTION public.award_submission_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _assignment RECORD;
  _ratio NUMERIC;
  _xp INT;
  _gold INT;
  _is_perfect BOOLEAN;
  _effective_score INT;
BEGIN
  -- Only when transitioning into graded state, and score is present
  IF NEW.graded_at IS NULL OR NEW.score IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.graded_at IS NOT NULL THEN
    -- Already graded once; don't double-award. (Re-grading does not change XP.)
    RETURN NEW;
  END IF;

  SELECT id, max_score, xp_reward, late_penalty_percent
    INTO _assignment
  FROM public.assignments WHERE id = NEW.assignment_id;
  IF _assignment.id IS NULL THEN RETURN NEW; END IF;

  _effective_score := NEW.score;
  IF NEW.is_late AND _assignment.late_penalty_percent > 0 THEN
    _effective_score := GREATEST(0, ROUND(NEW.score * (1 - _assignment.late_penalty_percent / 100.0))::INT);
  END IF;

  _ratio := GREATEST(0, LEAST(1, _effective_score::NUMERIC / NULLIF(_assignment.max_score, 0)));
  _xp := ROUND(_assignment.xp_reward * _ratio);
  _gold := ROUND(_xp / 4.0);  -- 1 gold per 4 XP
  _is_perfect := (_effective_score >= _assignment.max_score AND _assignment.max_score > 0);

  UPDATE public.profiles
    SET xp = xp + _xp,
        gold = gold + _gold,
        perfect_scores = perfect_scores + CASE WHEN _is_perfect THEN 1 ELSE 0 END,
        level = GREATEST(level, 1 + (xp + _xp) / 100)
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (NEW.user_id, '✅ งานถูกตรวจแล้ว',
    'คะแนน ' || _effective_score || '/' || _assignment.max_score ||
    ' • +' || _xp || ' XP, +' || _gold || ' ทอง',
    'grade', '/classrooms');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_award_xp ON public.submissions;
CREATE TRIGGER submissions_award_xp
AFTER INSERT OR UPDATE OF graded_at, score ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.award_submission_grade();


-- 2) Award XP + Gold + update streak when student checks in (present or late)
CREATE OR REPLACE FUNCTION public.award_attendance_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _xp INT;
  _gold INT;
  _prof RECORD;
  _today DATE := CURRENT_DATE;
  _new_streak INT;
BEGIN
  -- Only present/late give rewards; on update only if status moved into a rewarded one from a non-rewarded one
  IF NEW.status NOT IN ('present', 'late') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('present', 'late') THEN RETURN NEW; END IF;

  _xp := CASE WHEN NEW.status = 'present' THEN 15 ELSE 5 END;
  _gold := CASE WHEN NEW.status = 'present' THEN 5 ELSE 2 END;

  SELECT * INTO _prof FROM public.profiles WHERE id = NEW.user_id;
  _new_streak := CASE
    WHEN _prof.last_quest_date = _today THEN _prof.streak_days
    WHEN _prof.last_quest_date = _today - INTERVAL '1 day' THEN _prof.streak_days + 1
    ELSE 1
  END;

  UPDATE public.profiles
    SET xp = xp + _xp,
        gold = gold + _gold,
        streak_days = _new_streak,
        last_quest_date = _today,
        level = GREATEST(level, 1 + (xp + _xp) / 100)
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (NEW.user_id,
    CASE WHEN NEW.status = 'present' THEN '📚 เช็กชื่อสำเร็จ' ELSE '⏰ เช็กชื่อ (สาย)' END,
    '+' || _xp || ' XP, +' || _gold || ' ทอง • Streak ' || _new_streak || ' วัน',
    'attendance', '/classrooms');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_award_xp ON public.attendance_records;
CREATE TRIGGER attendance_award_xp
AFTER INSERT OR UPDATE OF status ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.award_attendance_checkin();