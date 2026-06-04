
CREATE TABLE IF NOT EXISTS public.student_passwords (
  user_id uuid PRIMARY KEY,
  password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.student_passwords TO authenticated;
GRANT ALL ON public.student_passwords TO service_role;

ALTER TABLE public.student_passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read passwords" ON public.student_passwords;
CREATE POLICY "admin read passwords"
ON public.student_passwords
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
