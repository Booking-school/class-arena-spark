
-- 1. Enable extension for overlap exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Rooms: add metadata fields
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'classroom'
    CHECK (room_type IN ('classroom','meeting_room','lab','auditorium')),
  ADD COLUMN IF NOT EXISTS building TEXT,
  ADD COLUMN IF NOT EXISTS floor INTEGER,
  ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Bookings: approval workflow + overlap prevention
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Overlap prevention: no two non-cancelled bookings for the same room can overlap
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('pending','approved'));
  END IF;
END $$;

-- 4. Notifications: extend
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'system';

-- Allow system inserts for notification triggers (security definer functions bypass RLS anyway,
-- but add an explicit insert policy for clarity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notif read own self'
  ) THEN
    NULL; -- placeholder, existing policies remain
  END IF;
END $$;

-- 5. Assignment comments (discussion thread under each assignment)
CREATE TABLE IF NOT EXISTS public.assignment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.assignment_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  is_edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_comments_assignment ON public.assignment_comments(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assignment_comments_author ON public.assignment_comments(author_id);

ALTER TABLE public.assignment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignment_comments read" ON public.assignment_comments;
CREATE POLICY "assignment_comments read"
ON public.assignment_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id
      AND (
        public.is_classroom_owner(a.classroom_id, auth.uid())
        OR public.is_classroom_member(a.classroom_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

DROP POLICY IF EXISTS "assignment_comments insert" ON public.assignment_comments;
CREATE POLICY "assignment_comments insert"
ON public.assignment_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id
      AND (
        public.is_classroom_owner(a.classroom_id, auth.uid())
        OR public.is_classroom_member(a.classroom_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

DROP POLICY IF EXISTS "assignment_comments update own" ON public.assignment_comments;
CREATE POLICY "assignment_comments update own"
ON public.assignment_comments FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "assignment_comments delete own or owner" ON public.assignment_comments;
CREATE POLICY "assignment_comments delete own or owner"
ON public.assignment_comments FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id AND public.is_classroom_owner(a.classroom_id, auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.touch_assignment_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.is_edited := true;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignment_comments_touch ON public.assignment_comments;
CREATE TRIGGER assignment_comments_touch
BEFORE UPDATE ON public.assignment_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_assignment_comment();

-- 6. Auto-notification triggers

-- 6a. Booking created -> notify all admins
CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _room_name TEXT;
BEGIN
  SELECT name INTO _room_name FROM public.rooms WHERE id = NEW.room_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'booking_new',
    'มีคำขอจองห้องใหม่',
    COALESCE(_room_name,'ห้อง') || ' • ' || NEW.purpose,
    '/admin/bookings'
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_notify_created ON public.bookings;
CREATE TRIGGER bookings_notify_created
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_created();

-- 6b. Booking status changed -> notify requester
CREATE OR REPLACE FUNCTION public.notify_booking_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _room_name TEXT;
  _title TEXT;
BEGIN
  IF NEW.status = OLD.status OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO _room_name FROM public.rooms WHERE id = NEW.room_id;
  _title := CASE NEW.status
    WHEN 'approved' THEN 'การจองได้รับการอนุมัติ'
    WHEN 'rejected' THEN 'การจองถูกปฏิเสธ'
    WHEN 'cancelled' THEN 'การจองถูกยกเลิก'
    ELSE 'สถานะการจองเปลี่ยนแปลง'
  END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'booking_' || NEW.status, _title,
    COALESCE(_room_name,'ห้อง') || ' • ' || NEW.purpose ||
      CASE WHEN NEW.status='rejected' AND NEW.rejection_reason IS NOT NULL
           THEN E'\nเหตุผล: ' || NEW.rejection_reason ELSE '' END,
    '/bookings');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_notify_status ON public.bookings;
CREATE TRIGGER bookings_notify_status
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_status();

-- 6c. Submission graded -> notify student
CREATE OR REPLACE FUNCTION public.notify_submission_graded()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _title TEXT;
  _classroom_id UUID;
BEGIN
  IF NEW.graded_at IS NULL OR (OLD.graded_at IS NOT NULL AND OLD.score = NEW.score) THEN
    RETURN NEW;
  END IF;
  SELECT a.title, a.classroom_id INTO _title, _classroom_id
    FROM public.assignments a WHERE a.id = NEW.assignment_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'assignment_graded',
    'งานของคุณได้รับการตรวจแล้ว',
    COALESCE(_title,'งาน') || ' • คะแนน ' || COALESCE(NEW.score::text,'-'),
    '/classrooms/' || _classroom_id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submissions_notify_graded ON public.submissions;
CREATE TRIGGER submissions_notify_graded
AFTER UPDATE OF score, graded_at ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_submission_graded();

-- 6d. New assignment -> notify all classroom members
CREATE OR REPLACE FUNCTION public.notify_assignment_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT cm.user_id, 'assignment_new',
    'มีงานใหม่ในห้องเรียน',
    NEW.title,
    '/classrooms/' || NEW.classroom_id::text
  FROM public.classroom_members cm WHERE cm.classroom_id = NEW.classroom_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignments_notify_created ON public.assignments;
CREATE TRIGGER assignments_notify_created
AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_assignment_created();

-- 6e. New comment -> notify assignment owner (teacher) + commenters in thread
CREATE OR REPLACE FUNCTION public.notify_assignment_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _classroom_id UUID;
  _owner_id UUID;
  _title TEXT;
BEGIN
  SELECT a.classroom_id, c.owner_id, a.title
    INTO _classroom_id, _owner_id, _title
  FROM public.assignments a
  JOIN public.classrooms c ON c.id = a.classroom_id
  WHERE a.id = NEW.assignment_id;
  IF _owner_id IS NOT NULL AND _owner_id <> NEW.author_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_owner_id, 'comment_new', 'มีความคิดเห็นใหม่',
      COALESCE(_title,'งาน') || ' • ' || left(NEW.content, 80),
      '/classrooms/' || _classroom_id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignment_comments_notify ON public.assignment_comments;
CREATE TRIGGER assignment_comments_notify
AFTER INSERT ON public.assignment_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_assignment_comment();
