
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS check_in_code TEXT,
  ADD COLUMN IF NOT EXISTS check_in_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS attendance_sessions_code_idx
  ON public.attendance_sessions(check_in_code);

CREATE OR REPLACE FUNCTION public.open_attendance_check_in(p_session_id uuid, p_minutes int DEFAULT 15)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_classroom uuid; v_code text; v_expires timestamptz;
BEGIN
  SELECT classroom_id INTO v_classroom FROM attendance_sessions WHERE id = p_session_id;
  IF v_classroom IS NULL THEN RAISE EXCEPTION 'ไม่พบเซสชัน'; END IF;
  IF NOT (is_classroom_owner(v_classroom, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์';
  END IF;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  v_expires := now() + make_interval(mins => greatest(1, least(p_minutes, 180)));
  UPDATE attendance_sessions
    SET check_in_code = v_code, check_in_opens_at = now(), check_in_expires_at = v_expires
    WHERE id = p_session_id;
  RETURN QUERY SELECT v_code, v_expires;
END; $$;

CREATE OR REPLACE FUNCTION public.self_check_in(p_code text)
RETURNS TABLE(session_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session record; v_status attendance_status; v_minutes int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ต้องเข้าสู่ระบบ'; END IF;
  SELECT * INTO v_session FROM attendance_sessions
    WHERE check_in_code = trim(p_code) AND check_in_expires_at > now() LIMIT 1;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'รหัสไม่ถูกต้องหรือหมดอายุ'; END IF;
  IF NOT is_classroom_member(v_session.classroom_id, auth.uid()) THEN
    RAISE EXCEPTION 'คุณไม่ได้อยู่ในห้องเรียนนี้';
  END IF;
  v_minutes := EXTRACT(EPOCH FROM (now() - v_session.check_in_opens_at)) / 60;
  v_status := CASE WHEN v_minutes > 5 THEN 'late'::attendance_status ELSE 'present'::attendance_status END;
  INSERT INTO attendance_records(session_id, user_id, status)
    VALUES (v_session.id, auth.uid(), v_status)
    ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status, marked_at = now();
  RETURN QUERY SELECT v_session.id, v_status::text;
END; $$;

GRANT EXECUTE ON FUNCTION public.open_attendance_check_in(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_check_in(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announce read members" ON public.announcements FOR SELECT TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "announce owner insert" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK ((author_id = auth.uid()) AND (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "announce owner update" ON public.announcements FOR UPDATE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "announce owner delete" ON public.announcements FOR DELETE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS announcements_classroom_idx ON public.announcements(classroom_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_new_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications(user_id, title, body, type, link)
  SELECT cm.user_id, '📢 ประกาศใหม่: ' || NEW.title, NEW.body, 'announcement', '/classrooms/' || NEW.classroom_id::text
  FROM classroom_members cm WHERE cm.classroom_id = NEW.classroom_id AND cm.user_id <> NEW.author_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_new_announcement ON public.announcements;
CREATE TRIGGER trg_notify_new_announcement AFTER INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_announcement();
