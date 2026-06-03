DROP FUNCTION IF EXISTS public.self_check_in(text);

CREATE OR REPLACE FUNCTION public.self_check_in(p_code text)
RETURNS TABLE(out_session_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_status public.attendance_status;
  v_minutes integer := 0;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ต้องเข้าสู่ระบบ';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.attendance_sessions AS s
  WHERE s.check_in_code = trim(upper(p_code))
    AND (s.check_in_opens_at IS NULL OR s.check_in_opens_at <= now())
    AND (s.check_in_expires_at IS NULL OR s.check_in_expires_at > now())
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'รหัสไม่ถูกต้องหรือหมดอายุ';
  END IF;

  IF NOT (
    public.is_classroom_member(v_session.classroom_id, v_user_id)
    OR public.is_classroom_owner(v_session.classroom_id, v_user_id)
    OR public.has_role(v_user_id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'คุณไม่ได้อยู่ในห้องเรียนนี้';
  END IF;

  IF v_session.check_in_opens_at IS NOT NULL THEN
    v_minutes := floor(extract(epoch FROM (now() - v_session.check_in_opens_at)) / 60)::integer;
  END IF;

  v_status := CASE
    WHEN v_minutes > 5 THEN 'late'::public.attendance_status
    ELSE 'present'::public.attendance_status
  END;

  INSERT INTO public.attendance_records (session_id, user_id, status)
  VALUES (v_session.id, v_user_id, v_status)
  ON CONFLICT ON CONSTRAINT attendance_records_session_id_user_id_key
  DO UPDATE
    SET status = EXCLUDED.status,
        marked_at = now();

  RETURN QUERY SELECT v_session.id, v_status::text;
END;
$$;