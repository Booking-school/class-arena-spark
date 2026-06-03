
-- 1) Bookings: prevent self-approval via trigger
CREATE OR REPLACE FUNCTION public.bookings_prevent_user_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Allow the owner to cancel their own (not-yet-finalised) booking.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'cancelled'::booking_status
     AND OLD.status IN ('pending'::booking_status, 'approved'::booking_status)
     AND NEW.approver_id IS NOT DISTINCT FROM OLD.approver_id
     AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason THEN
    RETURN NEW;
  END IF;

  IF NEW.status        IS DISTINCT FROM OLD.status
     OR NEW.approver_id   IS DISTINCT FROM OLD.approver_id
     OR NEW.approved_at   IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Only admins can change booking approval fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prevent_user_approval_trg ON public.bookings;
CREATE TRIGGER bookings_prevent_user_approval_trg
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_prevent_user_approval();

-- 2) Fix SECURITY DEFINER view
ALTER VIEW public.daily_quests_safe SET (security_invoker = on);

-- 3) Hide classroom join_code from members; expose only to owners/admin via function
REVOKE SELECT (join_code) ON public.classrooms FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_classroom_join_code(_classroom_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT join_code
  FROM public.classrooms
  WHERE id = _classroom_id
    AND (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
$$;
GRANT EXECUTE ON FUNCTION public.get_classroom_join_code(uuid) TO authenticated;

-- 4) Signup rate-limit: explicit deny policy (table is service-role only)
CREATE POLICY "signup_rate_limit no client access"
ON public.signup_rate_limit
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
