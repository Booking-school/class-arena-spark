ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade_level text;
CREATE INDEX IF NOT EXISTS idx_profiles_grade_level ON public.profiles(grade_level);