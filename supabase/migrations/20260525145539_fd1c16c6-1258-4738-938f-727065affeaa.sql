
-- ============== ROOMS & BOOKINGS ==============
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms read all auth" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms admin insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "rooms admin update" ON public.rooms FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "rooms admin delete" ON public.rooms FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER rooms_touch BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.booking_status AS ENUM ('pending','approved','rejected','cancelled');

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings read own" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bookings admin read" ON public.bookings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "bookings insert own" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookings update own" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bookings admin update" ON public.bookings FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "bookings admin delete" ON public.bookings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_bookings_room_time ON public.bookings(room_id, starts_at);

-- ============== CLASSROOMS ==============
CREATE TABLE public.classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  join_code TEXT NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text),1,6)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER classrooms_touch BEFORE UPDATE ON public.classrooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.classroom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, user_id)
);
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

-- security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_classroom_member(_classroom_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classroom_members WHERE classroom_id = _classroom_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_owner(_classroom_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classrooms WHERE id = _classroom_id AND owner_id = _user_id);
$$;

CREATE POLICY "classroom read owner" ON public.classrooms FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin') OR is_classroom_member(id, auth.uid()));
CREATE POLICY "classroom teacher insert" ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND (has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'admin')));
CREATE POLICY "classroom owner update" ON public.classrooms FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "classroom owner delete" ON public.classrooms FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));

CREATE POLICY "cm read self or owner" ON public.classroom_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "cm insert self" ON public.classroom_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cm delete self or owner" ON public.classroom_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

-- ============== MATERIALS ==============
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials read" ON public.materials FOR SELECT TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "materials owner insert" ON public.materials FOR INSERT TO authenticated
  WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "materials owner update" ON public.materials FOR UPDATE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "materials owner delete" ON public.materials FOR DELETE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

-- ============== ASSIGNMENTS & SUBMISSIONS ==============
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  max_score INTEGER NOT NULL DEFAULT 100,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER assignments_touch BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "assignments read" ON public.assignments FOR SELECT TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "assignments owner manage insert" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "assignments owner manage update" ON public.assignments FOR UPDATE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "assignments owner manage delete" ON public.assignments FOR DELETE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT,
  file_url TEXT,
  score INTEGER,
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  UNIQUE(assignment_id, user_id)
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = _assignment_id AND c.owner_id = _user_id
  );
$$;

CREATE POLICY "subs read own" ON public.submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_assignment_owner(assignment_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "subs insert own" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subs update own or grader" ON public.submissions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_assignment_owner(assignment_id, auth.uid()) OR has_role(auth.uid(),'admin'));

-- ============== ATTENDANCE ==============
CREATE TYPE public.attendance_status AS ENUM ('present','late','absent','excused');

CREATE TABLE public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_sess read" ON public.attendance_sessions FOR SELECT TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_sess owner insert" ON public.attendance_sessions FOR INSERT TO authenticated
  WITH CHECK (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_sess owner update" ON public.attendance_sessions FOR UPDATE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_sess owner delete" ON public.attendance_sessions FOR DELETE TO authenticated
  USING (is_classroom_owner(classroom_id, auth.uid()) OR has_role(auth.uid(),'admin'));

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status attendance_status NOT NULL DEFAULT 'present',
  note TEXT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_attendance_session_owner(_session_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attendance_sessions s
    JOIN public.classrooms c ON c.id = s.classroom_id
    WHERE s.id = _session_id AND c.owner_id = _user_id
  );
$$;

CREATE POLICY "att_rec read own or owner" ON public.attendance_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_attendance_session_owner(session_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_rec owner insert" ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (is_attendance_session_owner(session_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_rec owner update" ON public.attendance_records FOR UPDATE TO authenticated
  USING (is_attendance_session_owner(session_id, auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "att_rec owner delete" ON public.attendance_records FOR DELETE TO authenticated
  USING (is_attendance_session_owner(session_id, auth.uid()) OR has_role(auth.uid(),'admin'));

-- ============== QUESTS ==============
CREATE TABLE public.quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  xp_reward INTEGER NOT NULL DEFAULT 25,
  gold_reward INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quests read all" ON public.quests FOR SELECT TO authenticated USING (true);
CREATE POLICY "quests teacher insert" ON public.quests FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'admin'));
CREATE POLICY "quests teacher update" ON public.quests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'admin'));
CREATE POLICY "quests teacher delete" ON public.quests FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'admin'));

CREATE TABLE public.user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, quest_id)
);
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uq read own" ON public.user_quests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "uq insert own" ON public.user_quests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uq update own" ON public.user_quests FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RPC to complete a quest and grant rewards
CREATE OR REPLACE FUNCTION public.complete_quest(_quest_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _xp INT;
  _gold INT;
  _new_xp INT;
  _new_level INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_quests WHERE user_id = _uid AND quest_id = _quest_id AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'already completed';
  END IF;
  SELECT xp_reward, gold_reward INTO _xp, _gold FROM public.quests WHERE id = _quest_id AND is_active = true;
  IF _xp IS NULL THEN RAISE EXCEPTION 'quest not found'; END IF;
  INSERT INTO public.user_quests(user_id, quest_id, completed_at)
    VALUES (_uid, _quest_id, now())
    ON CONFLICT (user_id, quest_id) DO UPDATE SET completed_at = now();
  UPDATE public.profiles
    SET xp = xp + _xp, gold = gold + _gold, level = GREATEST(level, 1 + (xp + _xp) / 100)
    WHERE id = _uid
    RETURNING xp, level INTO _new_xp, _new_level;
  RETURN jsonb_build_object('xp_gained', _xp, 'gold_gained', _gold, 'total_xp', _new_xp, 'level', _new_level);
END; $$;

-- ============== NOTIFICATIONS ==============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif read own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif delete own" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_notif_user_created ON public.notifications(user_id, created_at DESC);

-- ============== AI CHAT ==============
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER chat_conv_touch BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "chat_conv own all" ON public.chat_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_msg own all" ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_msg_conv ON public.chat_messages(conversation_id, created_at);
