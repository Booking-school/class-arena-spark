
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.classroom_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  user_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  quests_completed integer NOT NULL DEFAULT 0,
  streak_days integer NOT NULL DEFAULT 0,
  perfect_scores integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, user_id)
);

ALTER TABLE public.classroom_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs read members" ON public.classroom_scores FOR SELECT TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cs owner insert" ON public.classroom_scores FOR INSERT TO authenticated
WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cs owner update" ON public.classroom_scores FOR UPDATE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cs owner delete" ON public.classroom_scores FOR DELETE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_classroom_scores_updated_at
BEFORE UPDATE ON public.classroom_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_classroom_scores_classroom ON public.classroom_scores(classroom_id);
CREATE INDEX idx_classroom_scores_user ON public.classroom_scores(user_id);
