DROP POLICY IF EXISTS "dq read owner only" ON public.daily_quests;
CREATE POLICY "dq read members" ON public.daily_quests FOR SELECT TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));