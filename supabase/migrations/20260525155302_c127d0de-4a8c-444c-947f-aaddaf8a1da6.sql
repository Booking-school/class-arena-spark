
-- LESSON CONTENTS
CREATE TABLE public.lesson_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_contents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lesson_classroom_date ON public.lesson_contents(classroom_id, lesson_date DESC);

CREATE POLICY "lesson read members" ON public.lesson_contents FOR SELECT TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "lesson owner insert" ON public.lesson_contents FOR INSERT TO authenticated
WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "lesson owner update" ON public.lesson_contents FOR UPDATE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "lesson owner delete" ON public.lesson_contents FOR DELETE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

CREATE TRIGGER lesson_touch BEFORE UPDATE ON public.lesson_contents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DAILY QUESTS
CREATE TABLE public.daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL,
  lesson_id UUID,
  title TEXT NOT NULL,
  topic TEXT,
  questions JSONB NOT NULL,
  min_level INT NOT NULL DEFAULT 1,
  max_xp_reward INT NOT NULL DEFAULT 100,
  max_gold_reward INT NOT NULL DEFAULT 30,
  difficulty TEXT NOT NULL DEFAULT 'normal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_dq_classroom ON public.daily_quests(classroom_id, created_at DESC);

CREATE POLICY "dq read members" ON public.daily_quests FOR SELECT TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "dq owner insert" ON public.daily_quests FOR INSERT TO authenticated
WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "dq owner update" ON public.daily_quests FOR UPDATE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "dq owner delete" ON public.daily_quests FOR DELETE TO authenticated
USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

-- DAILY QUEST ATTEMPTS
CREATE TABLE public.daily_quest_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL,
  user_id UUID NOT NULL,
  answers JSONB NOT NULL,
  score INT NOT NULL DEFAULT 0,
  max_score INT NOT NULL DEFAULT 100,
  xp_awarded INT NOT NULL DEFAULT 0,
  gold_awarded INT NOT NULL DEFAULT 0,
  ai_feedback TEXT,
  per_question JSONB,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quest_id, user_id)
);
ALTER TABLE public.daily_quest_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_dqa_user ON public.daily_quest_attempts(user_id);

CREATE POLICY "dqa read own or owner" ON public.daily_quest_attempts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.daily_quests dq WHERE dq.id = quest_id AND is_classroom_owner(dq.classroom_id, auth.uid()))
  OR has_role(auth.uid(),'admin')
);
CREATE POLICY "dqa insert own" ON public.daily_quest_attempts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ACHIEVEMENTS
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT NOT NULL DEFAULT 'common',
  criteria_type TEXT NOT NULL,
  criteria_value INT NOT NULL,
  xp_bonus INT NOT NULL DEFAULT 0,
  gold_bonus INT NOT NULL DEFAULT 0,
  title_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements read all" ON public.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievements admin manage" ON public.achievements FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_id UUID NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua read all" ON public.user_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "ua insert own" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- PROFILE EXTENSIONS
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_title_id UUID,
  ADD COLUMN IF NOT EXISTS quests_completed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_scores INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_quest_date DATE,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Allow public read on profiles for leaderboard (already public to authenticated; add anon read of limited cols via view)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT p.id, p.display_name, p.avatar_url, p.level, p.xp, p.gold,
       p.quests_completed, p.perfect_scores, p.streak_days,
       t.name AS active_title
FROM public.profiles p
LEFT JOIN public.titles t ON t.id = p.active_title_id;
GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- RPC: award quest attempt
CREATE OR REPLACE FUNCTION public.award_quest_attempt(
  _quest_id UUID,
  _answers JSONB,
  _score INT,
  _max_score INT,
  _feedback TEXT,
  _per_question JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _q RECORD;
  _ratio NUMERIC;
  _xp INT;
  _gold INT;
  _new_xp INT;
  _new_level INT;
  _is_perfect BOOLEAN;
  _today DATE := CURRENT_DATE;
  _prof RECORD;
  _new_streak INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS(SELECT 1 FROM public.daily_quest_attempts WHERE quest_id=_quest_id AND user_id=_uid) THEN
    RAISE EXCEPTION 'already attempted';
  END IF;
  SELECT * INTO _q FROM public.daily_quests WHERE id=_quest_id AND is_active=true;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'quest not found'; END IF;

  _ratio := GREATEST(0, LEAST(1, _score::numeric / NULLIF(_max_score,0)));
  _xp := ROUND(_q.max_xp_reward * _ratio);
  _gold := ROUND(_q.max_gold_reward * _ratio);
  _is_perfect := (_score >= _max_score);

  INSERT INTO public.daily_quest_attempts(quest_id,user_id,answers,score,max_score,xp_awarded,gold_awarded,ai_feedback,per_question)
  VALUES(_quest_id,_uid,_answers,_score,_max_score,_xp,_gold,_feedback,_per_question);

  SELECT * INTO _prof FROM public.profiles WHERE id=_uid;
  _new_streak := CASE
    WHEN _prof.last_quest_date = _today THEN _prof.streak_days
    WHEN _prof.last_quest_date = _today - INTERVAL '1 day' THEN _prof.streak_days + 1
    ELSE 1
  END;

  UPDATE public.profiles SET
    xp = xp + _xp,
    gold = gold + _gold,
    quests_completed = quests_completed + 1,
    perfect_scores = perfect_scores + CASE WHEN _is_perfect THEN 1 ELSE 0 END,
    streak_days = _new_streak,
    last_quest_date = _today,
    level = GREATEST(level, 1 + (xp + _xp) / 100)
  WHERE id=_uid
  RETURNING xp, level INTO _new_xp, _new_level;

  -- auto-unlock achievements
  INSERT INTO public.user_achievements(user_id, achievement_id)
  SELECT _uid, a.id FROM public.achievements a
  WHERE NOT EXISTS (SELECT 1 FROM public.user_achievements ua WHERE ua.user_id=_uid AND ua.achievement_id=a.id)
    AND (
      (a.criteria_type='level' AND _new_level >= a.criteria_value)
      OR (a.criteria_type='xp' AND _new_xp >= a.criteria_value)
      OR (a.criteria_type='quests' AND (SELECT quests_completed FROM public.profiles WHERE id=_uid) >= a.criteria_value)
      OR (a.criteria_type='perfect' AND (SELECT perfect_scores FROM public.profiles WHERE id=_uid) >= a.criteria_value)
      OR (a.criteria_type='streak' AND _new_streak >= a.criteria_value)
    );

  RETURN jsonb_build_object(
    'xp_gained', _xp,
    'gold_gained', _gold,
    'score', _score,
    'max_score', _max_score,
    'total_xp', _new_xp,
    'level', _new_level,
    'streak', _new_streak,
    'perfect', _is_perfect
  );
END;
$$;

-- RPC: set active title
CREATE OR REPLACE FUNCTION public.set_active_title(_title_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _title_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.user_titles WHERE user_id=auth.uid() AND title_id=_title_id
  ) THEN
    RAISE EXCEPTION 'title not owned';
  END IF;
  UPDATE public.profiles SET active_title_id=_title_id WHERE id=auth.uid();
END;
$$;

-- Seed achievements
INSERT INTO public.achievements (code,name,description,icon,rarity,criteria_type,criteria_value,xp_bonus,gold_bonus,title_text) VALUES
('first_quest','ก้าวแรก','ทำเควสต์สำเร็จ 1 ข้อ','🌱','common','quests',1,10,5,NULL),
('quest_10','นักผจญภัย','ทำเควสต์ 10 ข้อ','⚔️','rare','quests',10,50,20,'นักผจญภัย'),
('quest_50','ตำนาน','ทำเควสต์ 50 ข้อ','🏆','epic','quests',50,200,100,'ตำนานแห่ง Scholar'),
('level_5','ระดับ 5','ถึงเลเวล 5','⭐','common','level',5,30,15,NULL),
('level_10','ระดับ 10','ถึงเลเวล 10','🌟','rare','level',10,80,40,'ผู้รู้แจ้ง'),
('level_25','ปราชญ์','ถึงเลเวล 25','💎','legendary','level',25,500,250,'ปราชญ์'),
('perfect_5','เพอร์เฟกต์','ตอบเต็มคะแนน 5 ครั้ง','💯','rare','perfect',5,75,30,'นักเรียนดีเด่น'),
('streak_7','สู้ไม่ถอย','ทำเควสต์ 7 วันติด','🔥','epic','streak',7,150,50,'นักสู้ไฟแรง'),
('streak_30','คนเก่งประจำเดือน','ทำเควสต์ 30 วันติด','👑','legendary','streak',30,1000,500,'King of Scholars');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;
