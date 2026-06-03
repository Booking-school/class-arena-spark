
CREATE OR REPLACE FUNCTION public.join_classroom_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO _cid FROM public.classrooms WHERE upper(join_code) = upper(trim(_code)) LIMIT 1;
  IF _cid IS NULL THEN RAISE EXCEPTION 'classroom not found'; END IF;
  INSERT INTO public.classroom_members (classroom_id, user_id)
  VALUES (_cid, _uid)
  ON CONFLICT DO NOTHING;
  RETURN _cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_classroom_by_code(text) TO authenticated;
