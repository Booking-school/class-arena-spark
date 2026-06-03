
-- 1) attendance_sessions: hide check_in_code from students via a safe view
CREATE OR REPLACE VIEW public.attendance_sessions_safe
WITH (security_invoker = true) AS
SELECT
  id, classroom_id, title, session_date, created_at,
  check_in_opens_at, check_in_expires_at,
  CASE
    WHEN public.is_classroom_owner(classroom_id, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    THEN check_in_code
    ELSE NULL
  END AS check_in_code
FROM public.attendance_sessions;

GRANT SELECT ON public.attendance_sessions_safe TO authenticated;

-- Revoke direct column read of check_in_code from students; owners/admins read via the view (security_invoker honors RLS) and SECURITY DEFINER funcs (self_check_in) still work.
REVOKE SELECT (check_in_code) ON public.attendance_sessions FROM authenticated;
-- service_role keeps full access via earlier GRANT ALL.

-- 2) daily_quests: revoke direct read of the answers column; students must use daily_quests_safe view
REVOKE SELECT (questions) ON public.daily_quests FROM authenticated;
-- daily_quests_safe view + SECURITY DEFINER funcs (get_quest_for_grading) continue to work.

-- 3) Remove tables from realtime publication to stop broadcasting all rows to every authenticated subscriber
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_achievements;
