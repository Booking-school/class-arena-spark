
-- 1) Storage: restrict uploads bucket SELECT to owner + teachers/admins
DROP POLICY IF EXISTS "uploads read auth" ON storage.objects;
CREATE POLICY "uploads read own or staff"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'uploads' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
  )
);

-- 2) user_achievements: remove self-insert; only definer fn (award_quest_attempt) inserts
DROP POLICY IF EXISTS "ua insert own" ON public.user_achievements;
CREATE POLICY "ua admin insert"
ON public.user_achievements FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Profiles: prevent students from editing XP/gold/level/streak/etc.
CREATE OR REPLACE FUNCTION public.protect_profile_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.xp := OLD.xp;
  NEW.gold := OLD.gold;
  NEW.level := OLD.level;
  NEW.quests_completed := OLD.quests_completed;
  NEW.perfect_scores := OLD.perfect_scores;
  NEW.streak_days := OLD.streak_days;
  NEW.last_quest_date := OLD.last_quest_date;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_protect_stats ON public.profiles;
CREATE TRIGGER profiles_protect_stats
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_stats();

-- 4) Submissions: prevent students from setting their own score/feedback
CREATE OR REPLACE FUNCTION public.protect_submission_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin')
     OR public.has_role(auth.uid(), 'admin')
     OR public.is_assignment_owner(NEW.assignment_id, auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.score := OLD.score;
  NEW.feedback := OLD.feedback;
  NEW.graded_at := OLD.graded_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS submissions_protect_grading ON public.submissions;
CREATE TRIGGER submissions_protect_grading
BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.protect_submission_grading();

-- 5) user_titles: prevent users from swapping title_id (only is_active toggle allowed)
CREATE OR REPLACE FUNCTION public.protect_user_title_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin')
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'teacher') THEN
    RETURN NEW;
  END IF;
  NEW.title_id := OLD.title_id;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_titles_protect_id ON public.user_titles;
CREATE TRIGGER user_titles_protect_id
BEFORE UPDATE ON public.user_titles
FOR EACH ROW EXECUTE FUNCTION public.protect_user_title_id();
