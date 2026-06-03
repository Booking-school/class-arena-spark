CREATE OR REPLACE FUNCTION public.notify_booking_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room_name TEXT;
BEGIN
  SELECT name INTO _room_name FROM public.rooms WHERE id = NEW.room_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'booking_new',
    'มีคำขอจองห้องใหม่',
    COALESCE(_room_name,'ห้อง') || ' • ' || NEW.purpose,
    '/bookings'
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END $function$;