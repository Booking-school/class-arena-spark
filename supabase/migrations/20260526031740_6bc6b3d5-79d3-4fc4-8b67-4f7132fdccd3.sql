
-- Teacher applications table
CREATE TABLE IF NOT EXISTS public.teacher_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ta read own or admin" ON public.teacher_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ta admin update" ON public.teacher_applications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ta admin delete" ON public.teacher_applications
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update new-user handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  final_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');

  IF lower(NEW.email) = 'threerat2541@gmail.com' THEN
    final_role := 'admin'::public.app_role;
  ELSIF requested_role = 'teacher' THEN
    -- Teachers start as students until admin approves
    final_role := 'student'::public.app_role;
    INSERT INTO public.teacher_applications (user_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    final_role := 'student'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role);
  RETURN NEW;
END;
$function$;

-- Approve teacher (admin only)
CREATE OR REPLACE FUNCTION public.approve_teacher_application(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'teacher');

  UPDATE public.teacher_applications
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_teacher_application(_user_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject';
  END IF;

  UPDATE public.teacher_applications
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), note = _note
    WHERE user_id = _user_id;
END;
$$;

-- If owner email already exists, ensure admin role
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'threerat2541@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin');
  END IF;
END $$;
