
CREATE TABLE public.canva_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.canva_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.canva_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  canva_url text NOT NULL,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_canva_sessions_classroom ON public.canva_sessions(classroom_id);
CREATE INDEX idx_canva_assignments_session ON public.canva_assignments(session_id);
CREATE INDEX idx_canva_assignments_student ON public.canva_assignments(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canva_sessions TO authenticated;
GRANT ALL ON public.canva_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canva_assignments TO authenticated;
GRANT ALL ON public.canva_assignments TO service_role;

ALTER TABLE public.canva_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canva_assignments ENABLE ROW LEVEL SECURITY;

-- canva_sessions policies
CREATE POLICY "Classroom owners manage canva sessions"
  ON public.canva_sessions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Members can view canva sessions"
  ON public.canva_sessions FOR SELECT
  USING (
    public.is_classroom_member(classroom_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- canva_assignments policies
CREATE POLICY "Classroom owners manage canva assignments"
  ON public.canva_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.canva_sessions s
      JOIN public.classrooms c ON c.id = s.classroom_id
      WHERE s.id = session_id AND c.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.canva_sessions s
      JOIN public.classrooms c ON c.id = s.classroom_id
      WHERE s.id = session_id AND c.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Students view own canva assignment"
  ON public.canva_assignments FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students update own canva assignment opened_at"
  ON public.canva_assignments FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE TRIGGER update_canva_sessions_updated_at
  BEFORE UPDATE ON public.canva_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_canva_assignments_updated_at
  BEFORE UPDATE ON public.canva_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
