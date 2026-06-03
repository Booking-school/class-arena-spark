-- Allow classroom members to read daily_quests (filtered by safe view that strips answers)
CREATE POLICY "dq read members" ON public.daily_quests
FOR SELECT TO authenticated
USING (is_classroom_member(classroom_id, auth.uid()));