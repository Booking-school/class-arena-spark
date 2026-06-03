-- Allow classroom members to read active daily quests (answer keys are stripped by daily_quests_safe view)
CREATE POLICY "dq read members active"
ON public.daily_quests
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND is_classroom_member(classroom_id, auth.uid())
);