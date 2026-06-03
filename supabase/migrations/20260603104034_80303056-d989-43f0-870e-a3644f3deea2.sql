-- Weekly mission data model for the 2-hour-per-class gamification loop.

CREATE TABLE IF NOT EXISTS public.weekly_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  main_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  practice_quest_id uuid REFERENCES public.daily_quests(id) ON DELETE SET NULL,
  flashcard_deck_id uuid REFERENCES public.flashcard_decks(id) ON DELETE SET NULL,
  participation_xp integer NOT NULL DEFAULT 30 CHECK (participation_xp >= 0),
  quality_xp_max integer NOT NULL DEFAULT 60 CHECK (quality_xp_max >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  team_mode boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, week_start),
  CHECK (week_end >= week_start)
);

CREATE TABLE IF NOT EXISTS public.weekly_mission_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.weekly_missions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('main_work', 'ai_quest', 'flashcard', 'quiz', 'reflection', 'team_activity')
  ),
  title text NOT NULL,
  description text,
  xp_max integer NOT NULL DEFAULT 0 CHECK (xp_max >= 0),
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  source_table text,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.weekly_missions(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.weekly_mission_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (
    status IN ('not_started', 'in_progress', 'submitted', 'reviewed', 'completed')
  ),
  participation_xp_awarded integer NOT NULL DEFAULT 0 CHECK (participation_xp_awarded >= 0),
  quality_xp_awarded integer NOT NULL DEFAULT 0 CHECK (quality_xp_awarded >= 0),
  ai_xp_awarded integer NOT NULL DEFAULT 0 CHECK (ai_xp_awarded >= 0),
  completed_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, item_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.weekly_mission_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.weekly_missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  team_goal text,
  contribution_target integer NOT NULL DEFAULT 100 CHECK (contribution_target > 0),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_mission_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.weekly_mission_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_label text,
  contribution_mark integer NOT NULL DEFAULT 0 CHECK (
    contribution_mark >= 0 AND contribution_mark <= 100
  ),
  helper_mark boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.weekly_mission_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.weekly_missions(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id uuid,
  audience text NOT NULL DEFAULT 'teacher' CHECK (audience IN ('teacher', 'student', 'team')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.quality_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.weekly_missions(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  mark_type text NOT NULL,
  label text NOT NULL,
  xp_bonus integer NOT NULL DEFAULT 0 CHECK (xp_bonus >= 0),
  awarded_by uuid NOT NULL DEFAULT auth.uid(),
  awarded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.term_bonus_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level text,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (
    rule_type IN ('leaderboard', 'milestone', 'growth', 'helper')
  ),
  bonus_points numeric(4, 2) NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
  criteria_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_missions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_mission_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mission_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_mission_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_mission_team_members TO authenticated;
GRANT SELECT, INSERT ON public.weekly_mission_recaps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.term_bonus_rules TO authenticated;
GRANT ALL ON public.weekly_missions, public.weekly_mission_items, public.mission_progress, public.weekly_mission_teams, public.weekly_mission_team_members, public.weekly_mission_recaps, public.quality_marks, public.term_bonus_rules TO service_role;

CREATE OR REPLACE FUNCTION public.is_weekly_mission_owner(_mission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.weekly_missions wm
    WHERE wm.id = _mission_id
      AND (public.is_classroom_owner(wm.classroom_id, _user_id)
        OR public.has_role(_user_id, 'admin'::public.app_role))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_weekly_mission_member(_mission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.weekly_missions wm
    WHERE wm.id = _mission_id
      AND (public.is_classroom_owner(wm.classroom_id, _user_id)
        OR public.is_classroom_member(wm.classroom_id, _user_id)
        OR public.has_role(_user_id, 'admin'::public.app_role))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_weekly_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.weekly_mission_team_members wt
    WHERE wt.team_id = _team_id AND wt.user_id = _user_id
  );
$$;

ALTER TABLE public.weekly_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_mission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_mission_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_mission_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_mission_recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_bonus_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly missions read classroom" ON public.weekly_missions FOR SELECT TO authenticated
USING (public.is_classroom_owner(classroom_id, auth.uid()) OR public.is_classroom_member(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "weekly missions owner insert" ON public.weekly_missions FOR INSERT TO authenticated
WITH CHECK (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "weekly missions owner update" ON public.weekly_missions FOR UPDATE TO authenticated
USING (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "weekly missions owner delete" ON public.weekly_missions FOR DELETE TO authenticated
USING (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "weekly mission items read mission" ON public.weekly_mission_items FOR SELECT TO authenticated
USING (public.is_weekly_mission_member(mission_id, auth.uid()));
CREATE POLICY "weekly mission items owner insert" ON public.weekly_mission_items FOR INSERT TO authenticated
WITH CHECK (public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "weekly mission items owner update" ON public.weekly_mission_items FOR UPDATE TO authenticated
USING (public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "weekly mission items owner delete" ON public.weekly_mission_items FOR DELETE TO authenticated
USING (public.is_weekly_mission_owner(mission_id, auth.uid()));

CREATE POLICY "mission progress read own or owner" ON public.mission_progress FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "mission progress insert own or owner" ON public.mission_progress FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "mission progress update own or owner" ON public.mission_progress FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_weekly_mission_owner(mission_id, auth.uid()));

CREATE POLICY "weekly teams read mission" ON public.weekly_mission_teams FOR SELECT TO authenticated
USING (public.is_weekly_mission_member(mission_id, auth.uid()));
CREATE POLICY "weekly teams owner insert" ON public.weekly_mission_teams FOR INSERT TO authenticated
WITH CHECK (public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "weekly teams owner update" ON public.weekly_mission_teams FOR UPDATE TO authenticated
USING (public.is_weekly_mission_owner(mission_id, auth.uid()));
CREATE POLICY "weekly teams owner delete" ON public.weekly_mission_teams FOR DELETE TO authenticated
USING (public.is_weekly_mission_owner(mission_id, auth.uid()));

CREATE POLICY "weekly team members read" ON public.weekly_mission_team_members FOR SELECT TO authenticated
USING (public.is_weekly_team_member(team_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.weekly_mission_teams wt WHERE wt.id = team_id AND public.is_weekly_mission_owner(wt.mission_id, auth.uid())));
CREATE POLICY "weekly team members owner insert" ON public.weekly_mission_team_members FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.weekly_mission_teams wt WHERE wt.id = team_id AND public.is_weekly_mission_owner(wt.mission_id, auth.uid())));
CREATE POLICY "weekly team members owner update" ON public.weekly_mission_team_members FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.weekly_mission_teams wt WHERE wt.id = team_id AND public.is_weekly_mission_owner(wt.mission_id, auth.uid())));
CREATE POLICY "weekly team members owner delete" ON public.weekly_mission_team_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.weekly_mission_teams wt WHERE wt.id = team_id AND public.is_weekly_mission_owner(wt.mission_id, auth.uid())));

CREATE POLICY "weekly recaps read" ON public.weekly_mission_recaps FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "weekly recaps owner insert" ON public.weekly_mission_recaps FOR INSERT TO authenticated
WITH CHECK (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "quality marks read own or owner" ON public.quality_marks FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "quality marks owner insert" ON public.quality_marks FOR INSERT TO authenticated
WITH CHECK (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "quality marks owner update" ON public.quality_marks FOR UPDATE TO authenticated
USING (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "quality marks owner delete" ON public.quality_marks FOR DELETE TO authenticated
USING (public.is_classroom_owner(classroom_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "term bonus rules read auth" ON public.term_bonus_rules FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "term bonus rules owner insert" ON public.term_bonus_rules FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR (classroom_id IS NOT NULL AND public.is_classroom_owner(classroom_id, auth.uid())));
CREATE POLICY "term bonus rules owner update" ON public.term_bonus_rules FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR (classroom_id IS NOT NULL AND public.is_classroom_owner(classroom_id, auth.uid())));
CREATE POLICY "term bonus rules owner delete" ON public.term_bonus_rules FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR (classroom_id IS NOT NULL AND public.is_classroom_owner(classroom_id, auth.uid())));

CREATE TRIGGER weekly_missions_touch BEFORE UPDATE ON public.weekly_missions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER mission_progress_touch BEFORE UPDATE ON public.mission_progress
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER term_bonus_rules_touch BEFORE UPDATE ON public.term_bonus_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_weekly_missions_class_week ON public.weekly_missions(classroom_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_mission_items_mission ON public.weekly_mission_items(mission_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mission_progress_mission_user ON public.mission_progress(mission_id, user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_teams_mission ON public.weekly_mission_teams(mission_id);
CREATE INDEX IF NOT EXISTS idx_weekly_team_members_team ON public.weekly_mission_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_quality_marks_user_classroom ON public.quality_marks(user_id, classroom_id);
CREATE INDEX IF NOT EXISTS idx_term_bonus_rules_scope ON public.term_bonus_rules(classroom_id, grade_level);