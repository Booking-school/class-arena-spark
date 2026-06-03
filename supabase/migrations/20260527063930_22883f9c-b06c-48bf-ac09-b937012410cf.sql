CREATE OR REPLACE FUNCTION public.self_check_in(p_code text)
RETURNS TABLE(session_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_session record; v_status attendance_status; v_minutes int; v_sid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ต้องเข้าสู่ระบบ'; END IF;
  SELECT * INTO v_session FROM public.attendance_sessions s
    WHERE s.check_in_code = trim(p_code) AND s.check_in_expires_at > now() LIMIT 1;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'รหัสไม่ถูกต้องหรือหมดอายุ'; END IF;
  IF NOT public.is_classroom_member(v_session.classroom_id, auth.uid()) THEN
    RAISE EXCEPTION 'คุณไม่ได้อยู่ในห้องเรียนนี้';
  END IF;
  v_minutes := EXTRACT(EPOCH FROM (now() - v_session.check_in_opens_at)) / 60;
  v_status := CASE WHEN v_minutes > 5 THEN 'late'::attendance_status ELSE 'present'::attendance_status END;
  v_sid := v_session.id;
  INSERT INTO public.attendance_records AS ar (session_id, user_id, status)
    VALUES (v_sid, auth.uid(), v_status)
    ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status, marked_at = now();
  RETURN QUERY SELECT v_sid, v_status::text;
END; $function$;