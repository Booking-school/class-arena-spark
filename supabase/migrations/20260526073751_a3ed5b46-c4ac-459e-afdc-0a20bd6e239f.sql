-- Tighten realtime.messages policies: deny by default outside quiz-% topics
DROP POLICY IF EXISTS "realtime authenticated read" ON realtime.messages;
DROP POLICY IF EXISTS "realtime authenticated write" ON realtime.messages;

CREATE POLICY "realtime authenticated read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'quiz-%' THEN EXISTS (
      SELECT 1 FROM public.quiz_sessions s
      WHERE s.id::text = substring(realtime.topic() FROM 6)
        AND (s.host_id = auth.uid()
             OR public.is_classroom_member(s.classroom_id, auth.uid())
             OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
    ELSE false
  END
);

CREATE POLICY "realtime authenticated write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'quiz-%' THEN EXISTS (
      SELECT 1 FROM public.quiz_sessions s
      WHERE s.id::text = substring(realtime.topic() FROM 6)
        AND (s.host_id = auth.uid()
             OR public.is_classroom_member(s.classroom_id, auth.uid())
             OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
    ELSE false
  END
);