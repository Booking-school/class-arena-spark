
CREATE TABLE public.daily_quest_question_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  q_index integer NOT NULL,
  answer text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id, q_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_quest_question_progress TO authenticated;
GRANT ALL ON public.daily_quest_question_progress TO service_role;

ALTER TABLE public.daily_quest_question_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dqqp own read" ON public.daily_quest_question_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "dqqp own insert" ON public.daily_quest_question_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "dqqp own update" ON public.daily_quest_question_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dqqp own delete" ON public.daily_quest_question_progress
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER dqqp_updated
  BEFORE UPDATE ON public.daily_quest_question_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
