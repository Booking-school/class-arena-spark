
-- 1. daily_quests: remove broad member SELECT; students must go through daily_quests_safe view
DROP POLICY IF EXISTS "dq read members" ON public.daily_quests;

-- 2. attendance_sessions: hide check_in_code from non-owner members via column-level revoke
REVOKE SELECT (check_in_code, check_in_expires_at, check_in_opens_at) ON public.attendance_sessions FROM authenticated, anon;
-- Owners/admins query through attendance_sessions_safe view (existing) which masks code by role

-- 3. classrooms: hide join_code via column-level revoke; owners access via get_classroom_join_code RPC
REVOKE SELECT (join_code) ON public.classrooms FROM authenticated, anon;

-- 4. user_titles & user_badges: restrict teacher award to their own classroom members
CREATE OR REPLACE FUNCTION public.is_teacher_of_user(_teacher uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_members cm
    JOIN public.classrooms c ON c.id = cm.classroom_id
    WHERE cm.user_id = _user
      AND c.owner_id = _teacher
  );
$$;

DROP POLICY IF EXISTS "Teachers/Admins award titles" ON public.user_titles;
CREATE POLICY "Teachers/Admins award titles"
ON public.user_titles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'teacher'::app_role)
    AND public.is_teacher_of_user(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Teachers/Admins award badges" ON public.user_badges;
CREATE POLICY "Teachers/Admins award badges"
ON public.user_badges
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'teacher'::app_role)
    AND public.is_teacher_of_user(auth.uid(), user_id)
  )
);
