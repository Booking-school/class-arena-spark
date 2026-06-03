import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

import { tr } from "@/i18n";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/92 backdrop-blur">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Link to="/" className="group flex min-h-11 min-w-0 items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-transform group-hover:-translate-y-0.5">
              SH
            </div>
            <span className="font-semibold leading-tight">Scholar Hall</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            {user ? (
              <Button asChild>
                <Link to="/dashboard">{tr("เข้าสู่แดชบอร์ด")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to="/login">{tr("เข้าสู่ระบบ")}</Link>
                </Button>
                <Button asChild>
                  <Link to="/login" search={{ mode: "signup" }}>
                    {tr("สมัครสมาชิก")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <MonitorPlay className="size-4" />
              {tr("Connected classroom สำหรับโรงเรียนไทย")}
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] text-balance sm:text-6xl">
              Scholar Hall
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              {tr(
                "เชื่อมห้องเรียน ห้องประชุม เควสต์การเรียนรู้ AI ผู้ช่วย และงานแอดมินให้อยู่ในจังหวะเดียวกัน ครู นักเรียน และทีมดูแลระบบเห็นงานสำคัญก่อนเสมอ",
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/book">
                  <DoorOpen className="size-4" />
                  {tr("เริ่มจองห้อง")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to={user ? "/classrooms" : "/login"}>
                  <BookOpen className="size-4" />
                  {user ? tr("เปิดห้องเรียน") : tr("เข้าห้องเรียน")}
                </Link>
              </Button>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section className="border-y border-border/70 bg-secondary/55">
          <div className="mx-auto grid max-w-6xl gap-0 px-5 py-8 sm:px-6 md:grid-cols-4">
            <ProofPoint
              icon={<Calendar className="size-5" />}
              label={tr("จองห้อง")}
              value={tr("ผู้เยี่ยมชมใช้ได้ทันที")}
            />
            <ProofPoint
              icon={<Users className="size-5" />}
              label={tr("ห้องเรียน")}
              value={tr("ครูและนักเรียนทำงานร่วมกัน")}
            />
            <ProofPoint
              icon={<Trophy className="size-5" />}
              label={tr("รางวัล")}
              value={tr("XP, Gold, Achievement")}
            />
            <ProofPoint
              icon={<ShieldCheck className="size-5" />}
              label={tr("แอดมิน")}
              value={tr("อนุมัติและดูแลระบบ")}
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-balance">
                {tr("ออกแบบให้คนแต่ละบทบาทเห็นงานของตัวเองก่อน")}
              </h2>
              <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
                {tr(
                  "หน้า public พาไปจองห้องหรือเข้าสู่ระบบ ส่วนหลังบ้านแยกงานนักเรียน ครู และแอดมินให้สแกนเร็วกว่าเดิม",
                )}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleLine
                icon={<DoorOpen className="size-5" />}
                title={tr("ผู้จองทั่วไป")}
                text={tr("เลือกห้อง กรอกข้อมูล รออนุมัติ")}
              />
              <RoleLine
                icon={<BookOpen className="size-5" />}
                title={tr("นักเรียน")}
                text={tr("เข้าเรียน ทำเควสต์ สะสม XP")}
              />
              <RoleLine
                icon={<ClipboardCheck className="size-5" />}
                title={tr("ครู")}
                text={tr("สร้างห้อง สั่งงาน เช็กชื่อ")}
              />
              <RoleLine
                icon={<ShieldCheck className="size-5" />}
                title={tr("แอดมิน")}
                text={tr("ดูแลผู้ใช้ ห้อง และคำขอจอง")}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Scholar Hall
        </div>
      </footer>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-3 border-b bg-secondary/70 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <span className="font-semibold text-foreground">{tr("Live classroom hub")}</span>
          <p className="text-xs text-muted-foreground">
            {tr("ตารางสอน งานค้าง และสถานะห้องอยู่ในหน้าจอเดียว")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <SignalPill icon={<CheckCircle2 className="size-3.5" />} label={tr("พร้อมสอน")} />
          <SignalPill icon={<Bot className="size-3.5" />} label={tr("AI พร้อมตอบ")} />
        </div>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-[1fr_1fr_1.1fr]">
        <PreviewPanel
          icon={<Calendar className="size-4" />}
          title={tr("คำขอจอง")}
          value="12"
          detail={tr("รออนุมัติ 3 รายการ")}
        />
        <PreviewPanel
          icon={<BookOpen className="size-4" />}
          title={tr("ห้องเรียน")}
          value="8"
          detail={tr("มีบทเรียนและเควสต์ที่เปิดใช้งาน")}
        />
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Bot className="size-4" />
            </span>
            <span className="text-xs text-muted-foreground">{tr("AI ผู้ช่วย")}</span>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-lg bg-secondary/65 px-3 py-2">
              {tr("สรุปบทเรียนล่าสุดให้นักเรียนอ่านซ้ำ")}
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-primary">
              {tr("แนะนำ Daily Quest จากเนื้อหาที่ครูสอน")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-2.5 py-1 font-medium text-primary">
      {icon}
      {label}
    </span>
  );
}

function PreviewPanel({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold leading-none">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProofPoint({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border/70 py-4 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function RoleLine({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/35">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h3 className="text-xl font-semibold leading-tight">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      <ArrowRight className="mt-4 size-4 text-primary" aria-hidden />
    </div>
  );
}
