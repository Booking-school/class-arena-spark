
UPDATE auth.users SET email_confirmed_at = now()
  WHERE email IN ('teacher.test@scholar.local','student.test@scholar.local','admin.test@scholar.local');

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher'::app_role FROM auth.users WHERE email = 'teacher.test@scholar.local'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'admin.test@scholar.local'
ON CONFLICT (user_id, role) DO NOTHING;
