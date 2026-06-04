DROP POLICY IF EXISTS "subs read own" ON public.submissions;

CREATE POLICY "subs read own or group or owner"
ON public.submissions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (group_member_ids IS NOT NULL AND auth.uid() = ANY(group_member_ids))
  OR is_assignment_owner(assignment_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);