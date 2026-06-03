
-- 1) Remove members' direct SELECT on daily_quests (answer keys leak via questions JSONB)
DROP POLICY IF EXISTS "dq read members active" ON public.daily_quests;

-- 2) Lock down realtime.messages so only authenticated users can subscribe,
--    and quiz-* topics are restricted to the session's classroom members.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime authenticated read" ON realtime.messages;
DROP POLICY IF EXISTS "realtime authenticated write" ON realtime.messages;

CREATE POLICY "realtime authenticated read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Quiz broadcast/presence channels: must be classroom member or host
  CASE
    WHEN realtime.topic() LIKE 'quiz-%' THEN EXISTS (
      SELECT 1 FROM public.quiz_sessions s
      WHERE s.id::text = substring(realtime.topic() from 6)
        AND (
          s.host_id = auth.uid()
          OR public.is_classroom_member(s.classroom_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
    -- Other topics: allow authenticated users (postgres_changes still gated by table RLS)
    ELSE true
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
      WHERE s.id::text = substring(realtime.topic() from 6)
        AND (
          s.host_id = auth.uid()
          OR public.is_classroom_member(s.classroom_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
    ELSE true
  END
);
