
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'admin@student.scholarhall.local',
    crypt('Admin', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('student_id','admin','display_name','Admin'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@student.scholarhall.local'),
    'email', new_user_id::text, now(), now(), now());

  INSERT INTO public.profiles (id, display_name) VALUES (new_user_id, 'Admin')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
