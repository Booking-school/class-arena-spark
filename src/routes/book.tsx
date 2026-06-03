import { createFileRoute, Link } from "@tanstack/react-router";
import { TestimonialsMarquee } from "@/components/testimonials-marquee";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

import { tr } from "@/i18n";
export const Route = createFileRoute("/book")({ component: PublicBookPage });

const emptyBookingForm = {
  room_id: "",
  purpose: "",
  starts_at: "",
  ends_at: "",
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  notes: "",
};

type BookingForm = typeof emptyBookingForm;
type BookingField = keyof BookingForm;
type BookingErrors = Partial<Record<BookingField, string>>;

function validateBookingForm(form: BookingForm) {
  const fieldErrors: BookingErrors = {};
  const startsAt = new Date(form.starts_at);
  const endsAt = new Date(form.ends_at);
  const now = new Date();

  if (!form.room_id) fieldErrors.room_id = tr("เลือกห้องที่ต้องการจอง");
  if (!form.purpose.trim()) fieldErrors.purpose = tr("กรอกวัตถุประสงค์การใช้งาน");
  if (!form.starts_at) fieldErrors.starts_at = tr("เลือกวันและเวลาเริ่มต้น");
  if (!form.ends_at) fieldErrors.ends_at = tr("เลือกวันและเวลาสิ้นสุด");
  if (!form.guest_name.trim()) fieldErrors.guest_name = tr("กรอกชื่อผู้จอง");
  if (!form.guest_email.trim()) fieldErrors.guest_email = tr("กรอกอีเมลสำหรับติดต่อกลับ");

  if (form.starts_at && isNaN(startsAt.getTime())) {
    fieldErrors.starts_at = tr("วันที่/เวลาเริ่มไม่ถูกต้อง");
  }
  if (form.ends_at && isNaN(endsAt.getTime())) {
    fieldErrors.ends_at = tr("วันที่/เวลาสิ้นสุดไม่ถูกต้อง");
  }
  if (!fieldErrors.starts_at && startsAt < now) {
    fieldErrors.starts_at = tr("ห้ามจองย้อนหลัง");
  }
  if (!fieldErrors.starts_at && !fieldErrors.ends_at && endsAt <= startsAt) {
    fieldErrors.ends_at = tr("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
  }
  if (
    !fieldErrors.starts_at &&
    !fieldErrors.ends_at &&
    endsAt.getTime() - startsAt.getTime() < 15 * 60 * 1000
  ) {
    fieldErrors.ends_at = tr("ระยะเวลาขั้นต่ำ 15 นาที");
  }
  if (form.guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guest_email)) {
    fieldErrors.guest_email = tr("อีเมลไม่ถูกต้อง");
  }

  return fieldErrors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function PublicBookPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<BookingForm>(emptyBookingForm);
  const [fieldErrors, setFieldErrors] = useState<BookingErrors>({});

  function updateField<K extends BookingField>(field: K, value: BookingForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  const { data: rooms } = useQuery({
    queryKey: ["public-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const errors = validateBookingForm(form);
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      if (firstError) throw new Error(firstError);
      const { error } = await supabase.from("bookings").insert({
        room_id: form.room_id,
        purpose: form.purpose.trim().slice(0, 200),
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        guest_name: form.guest_name.trim().slice(0, 100),
        guest_email: form.guest_email.trim().slice(0, 255),
        guest_phone: form.guest_phone ? form.guest_phone.trim().slice(0, 30) : null,
        notes: form.notes ? form.notes.slice(0, 1000) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      setFieldErrors({});
      toast.success(tr("ส่งคำขอจองแล้ว"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex min-h-11 items-center gap-2 rounded-md px-2">
            <ArrowLeft className="size-4" />
            <span className="font-display">{tr("กลับหน้าแรก")}</span>
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{tr("เข้าสู่ระบบ")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <h1 className="font-display text-4xl">{tr("จองห้องประชุม")}</h1>
          <p className="text-muted-foreground mt-2">
            {tr("ไม่ต้องสมัครสมาชิก กรอกข้อมูลแล้วรอแอดมินอนุมัติ")}
          </p>

          <div className="mt-6 space-y-3">
            <h2 className="font-display text-xl">{tr("ห้องที่เปิดให้จอง")}</h2>
            {rooms?.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-display">{r.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    {r.location} · {r.capacity} ที่นั่ง
                  </p>
                  {r.description && (
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{r.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {rooms?.length === 0 && (
              <p className="text-sm text-muted-foreground">{tr("ยังไม่มีห้องที่เปิดให้จอง")}</p>
            )}
          </div>
        </section>

        <section>
          {submitted ? (
            <Card>
              <CardContent className="pt-8 text-center space-y-3">
                <CheckCircle2 className="size-12 text-primary mx-auto" />
                <h2 className="font-display text-2xl">{tr("ส่งคำขอเรียบร้อย")}</h2>
                <p className="text-muted-foreground text-sm">
                  {tr("แอดมินจะตรวจสอบและติดต่อกลับทางอีเมลที่ระบุไว้")}
                </p>
                <Button
                  onClick={() => {
                    setSubmitted(false);
                    setForm(emptyBookingForm);
                    setFieldErrors({});
                  }}
                  variant="outline"
                >
                  {tr("จองห้องอื่น")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="font-display">{tr("แบบฟอร์มการจอง")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="booking-room">{tr("ห้อง *")}</Label>
                  <Select value={form.room_id} onValueChange={(v) => updateField("room_id", v)}>
                    <SelectTrigger
                      id="booking-room"
                      aria-invalid={!!fieldErrors.room_id}
                      aria-describedby={fieldErrors.room_id ? "booking-room-error" : undefined}
                    >
                      <SelectValue placeholder={tr("เลือกห้อง")} />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.capacity} ที่นั่ง)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="booking-room-error" message={fieldErrors.room_id} />
                </div>
                <div>
                  <Label htmlFor="booking-purpose">{tr("วัตถุประสงค์ *")}</Label>
                  <Input
                    id="booking-purpose"
                    value={form.purpose}
                    onChange={(e) => updateField("purpose", e.target.value)}
                    placeholder={tr("เช่น ประชุมผู้ปกครอง")}
                    aria-invalid={!!fieldErrors.purpose}
                    aria-describedby={fieldErrors.purpose ? "booking-purpose-error" : undefined}
                  />
                  <FieldError id="booking-purpose-error" message={fieldErrors.purpose} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="booking-start">{tr("เริ่ม *")}</Label>
                    <Input
                      id="booking-start"
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => updateField("starts_at", e.target.value)}
                      aria-invalid={!!fieldErrors.starts_at}
                      aria-describedby={fieldErrors.starts_at ? "booking-start-error" : undefined}
                    />
                    <FieldError id="booking-start-error" message={fieldErrors.starts_at} />
                  </div>
                  <div>
                    <Label htmlFor="booking-end">{tr("สิ้นสุด *")}</Label>
                    <Input
                      id="booking-end"
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => updateField("ends_at", e.target.value)}
                      aria-invalid={!!fieldErrors.ends_at}
                      aria-describedby={fieldErrors.ends_at ? "booking-end-error" : undefined}
                    />
                    <FieldError id="booking-end-error" message={fieldErrors.ends_at} />
                  </div>
                </div>
                <hr className="border-border/60 my-2" />
                <p className="text-xs font-medium text-muted-foreground">{tr("ข้อมูลผู้จอง")}</p>
                <div>
                  <Label htmlFor="booking-name">{tr("ชื่อ-นามสกุล *")}</Label>
                  <Input
                    id="booking-name"
                    value={form.guest_name}
                    onChange={(e) => updateField("guest_name", e.target.value)}
                    aria-invalid={!!fieldErrors.guest_name}
                    aria-describedby={fieldErrors.guest_name ? "booking-name-error" : undefined}
                  />
                  <FieldError id="booking-name-error" message={fieldErrors.guest_name} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="booking-email">{tr("อีเมล *")}</Label>
                    <Input
                      id="booking-email"
                      type="email"
                      value={form.guest_email}
                      onChange={(e) => updateField("guest_email", e.target.value)}
                      aria-invalid={!!fieldErrors.guest_email}
                      aria-describedby={fieldErrors.guest_email ? "booking-email-error" : undefined}
                    />
                    <FieldError id="booking-email-error" message={fieldErrors.guest_email} />
                  </div>
                  <div>
                    <Label htmlFor="booking-phone">{tr("เบอร์โทร")}</Label>
                    <Input
                      id="booking-phone"
                      value={form.guest_phone}
                      onChange={(e) => updateField("guest_phone", e.target.value)}
                      aria-invalid={!!fieldErrors.guest_phone}
                      aria-describedby={fieldErrors.guest_phone ? "booking-phone-error" : undefined}
                    />
                    <FieldError id="booking-phone-error" message={fieldErrors.guest_phone} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="booking-notes">{tr("หมายเหตุ")}</Label>
                  <Textarea
                    id="booking-notes"
                    value={form.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    aria-invalid={!!fieldErrors.notes}
                    aria-describedby={fieldErrors.notes ? "booking-notes-error" : undefined}
                  />
                  <FieldError id="booking-notes-error" message={fieldErrors.notes} />
                </div>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                  className="w-full"
                >
                  {tr("ส่งคำขอจอง")}
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <TestimonialsMarquee />
      </main>
    </div>
  );
}
