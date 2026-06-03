ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS rubric jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sample_video_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS late_penalty_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_late boolean NOT NULL DEFAULT true;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_assignment_type_check,
  ADD CONSTRAINT assignments_assignment_type_check
    CHECK (assignment_type IN ('individual','group'));

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_status_check,
  ADD CONSTRAINT assignments_status_check
    CHECK (status IN ('draft','published','closed'));

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_late_penalty_check,
  ADD CONSTRAINT assignments_late_penalty_check
    CHECK (late_penalty_percent >= 0 AND late_penalty_percent <= 100);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_member_ids uuid[];