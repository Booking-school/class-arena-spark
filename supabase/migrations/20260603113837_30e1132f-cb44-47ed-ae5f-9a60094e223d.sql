-- 1) Trigger: silently strip `result` from any non-service-role write.
--    The grade-quest-answer edge function (service role) is the only path
--    allowed to set authoritative scores.
CREATE OR REPLACE FUNCTION public.dqqp_block_client_result_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.role() returns 'service_role' for service-key callers,
  -- 'authenticated' for end users. Block clients from setting `result`.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.result := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.result := OLD.result;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dqqp_block_client_result_writes ON public.daily_quest_question_progress;
CREATE TRIGGER dqqp_block_client_result_writes
BEFORE INSERT OR UPDATE ON public.daily_quest_question_progress
FOR EACH ROW EXECUTE FUNCTION public.dqqp_block_client_result_writes();

-- 2) Re-derive scores server-side in award_quest_attempt.
--    Signature is kept for client compatibility but `_score`/`_max_score`
--    are now ignored; the function recomputes from server-stored progress.
CREATE OR REPLACE FUNCTION public.award_quest_attempt(
  _quest_id uuid,
  _answers jsonb,
  _score integer,
  _max_score integer,
  _feedback text,
  _per_question jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Delegate to the trusted finalizer which only trusts server-stored
  -- daily_quest_question_progress.result values (written by the grading
  -- edge function via service role). Client-supplied _score/_max_score/
  -- _per_question are deliberately ignored.
  RETURN public.finalize_quest_from_progress(_uid, _quest_id);
END;
$$;

REVOKE ALL ON FUNCTION public.award_quest_attempt(uuid, jsonb, integer, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_quest_attempt(uuid, jsonb, integer, integer, text, jsonb) TO authenticated, service_role;