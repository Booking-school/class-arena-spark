import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function assertPairedLabel(source, id, context) {
  assertIncludes(source, `htmlFor="${id}"`, `${context} must label #${id}.`);
  assertIncludes(source, `id="${id}"`, `${context} must expose #${id}.`);
}

const landing = read("src/routes/index.tsx");
assert(!landing.includes("text-shine"), "Landing must not use gradient/shine text.");
assert(
  !landing.includes("hover:shadow-2xl"),
  "Landing CTA cards must avoid large decorative shadows.",
);
assert(
  landing.includes("Connected classroom สำหรับโรงเรียนไทย"),
  "Landing must explain the full Scholar Hall product, not only ask a generic question.",
);
assert(
  landing.includes("flex-wrap"),
  "Landing header actions must wrap instead of clipping on mobile.",
);

const booking = read("src/routes/book.tsx");
for (const id of [
  "booking-room",
  "booking-purpose",
  "booking-start",
  "booking-end",
  "booking-name",
  "booking-email",
  "booking-phone",
  "booking-notes",
]) {
  assert(
    booking.includes(`htmlFor="${id}"`),
    `Booking field ${id} needs a visible label connected with htmlFor.`,
  );
  assert(booking.includes(`id="${id}"`), `Booking control ${id} needs a stable id.`);
}
assert(
  !booking.includes("grid grid-cols-2 gap-3"),
  "Booking form must stack paired fields on mobile before using two columns.",
);
assert(
  booking.includes("aria-invalid"),
  "Booking form must expose validation state to assistive tech.",
);
assert(
  booking.includes("fieldErrors"),
  "Booking form must render inline field errors, not toast-only validation.",
);

const login = read("src/routes/login.tsx");
assert(login.includes("redirect:"), "Login search schema must accept an internal redirect.");
assert(
  login.includes("redirectDestination"),
  "Login must centralize redirect handling after auth.",
);
assert(
  !/navigate\(\{\s*to:\s*"\/dashboard"\s*\}\)/.test(login),
  "Login must not always navigate to /dashboard after sign-in.",
);

const checkin = read("src/routes/checkin.tsx");
assert(
  checkin.includes("encodeURIComponent(initial)"),
  "Check-in redirect must preserve the code safely.",
);
assert(
  checkin.includes('htmlFor="checkin-code"'),
  "Check-in code field must have an associated label.",
);

const card = read("src/components/ui/card.tsx");
assert(!card.includes("hover:shadow-lg"), "Base Card must not add heavy hover shadow by default.");
assert(!card.includes("hover:-translate-y"), "Base Card must not lift every card by default.");

const showcase = read("src/components/showcase-sections.tsx");
assert(
  !showcase.includes("shadow-xl"),
  "Showcase sections must avoid default shadow-xl treatment.",
);
assert(!showcase.includes("border-2"), "Showcase sections must avoid thick rounded borders.");

const product = read("PRODUCT.md");
assertIncludes(product, "## Register", "PRODUCT.md must document the public registration surface.");
assertIncludes(product, "Role first", "PRODUCT.md must explain role-first registration behavior.");

const rewards = read("src/routes/_authenticated/rewards.tsx");
assert(
  !rewards.includes("bg-gradient-to-r from-amber-200"),
  "Legendary reward style should use a restrained token-like treatment, not a gradient strip.",
);

const classrooms = read("src/routes/_authenticated/classrooms.index.tsx");
assert(
  !classrooms.includes('return <p className="text-muted-foreground text-sm">{tr("ยังไม่มี")}</p>;'),
  "Classroom empty states must explain the next action.",
);

const button = read("src/components/ui/button.tsx");
assertIncludes(
  button,
  'sm: "h-11 min-w-11 rounded-md px-3 text-xs"',
  "Small buttons must preserve 44px touch targets.",
);
assertIncludes(button, 'icon: "h-11 w-11"', "Icon buttons must preserve 44px touch targets.");

const tabs = read("src/components/ui/tabs.tsx");
assertIncludes(tabs, "h-11 min-w-11", "Tab triggers must preserve 44px touch targets.");
assertNotIncludes(tabs, "h-9", "Tabs should not regress to compact h-9 controls.");

const dialog = read("src/components/ui/dialog.tsx");
assertIncludes(dialog, "size-11", "Dialog close controls must preserve 44px touch targets.");
assertNotIncludes(
  dialog,
  "zoom-in-95",
  "Dialogs should avoid scale animation that can jitter layout.",
);
assertNotIncludes(
  dialog,
  "zoom-out-95",
  "Dialogs should avoid scale animation that can jitter layout.",
);

const sidebar = read("src/components/ui/sidebar.tsx");
assertIncludes(
  sidebar,
  'className={cn("size-11", className)}',
  "Sidebar trigger must preserve a 44px touch target.",
);
assertIncludes(
  sidebar,
  'default: "h-11 text-sm"',
  "Sidebar menu buttons must preserve 44px default touch targets.",
);
assertIncludes(
  sidebar,
  'sm: "h-11 text-xs"',
  "Sidebar small menu buttons must preserve 44px touch targets.",
);
assertIncludes(
  sidebar,
  "group-data-[collapsible=icon]:!size-11",
  "Collapsed sidebar buttons must preserve 44px icon targets.",
);

const appSidebar = read("src/components/app-sidebar.tsx");
assertIncludes(
  appSidebar,
  'url: "/weekly-missions"',
  "App sidebar must expose the weekly mission workspace.",
);
assertIncludes(appSidebar, "ภารกิจสัปดาห์", "App sidebar must label weekly missions in Thai.");
assertIncludes(appSidebar, 'url: "/bonus-center"', "App sidebar must expose the bonus center.");
assertIncludes(appSidebar, "คะแนนพิเศษ", "App sidebar must label the bonus center in Thai.");

const auth = read("src/hooks/use-auth.tsx");
assertIncludes(
  auth,
  "restoreSessionWithGrace",
  "Auth should keep session restoration grace handling.",
);
assertIncludes(auth, "setLoading(true)", "Auth should stay loading while role checks are pending.");
assertIncludes(
  auth,
  "fetchRoles(nextUser.id).finally",
  "Auth role checks should resolve loading after the latest role fetch.",
);

const analytics = read("src/routes/_authenticated/analytics.tsx");
assertNotIncludes(
  analytics,
  "beforeLoad",
  "Analytics must not redirect before authenticated role loading settles.",
);

const flashcardsIndex = read("src/routes/_authenticated/flashcards.index.tsx");
assertNotIncludes(
  flashcardsIndex,
  "beforeLoad",
  "Flashcards index should rely on the authenticated layout guard.",
);
assertIncludes(
  flashcardsIndex,
  "flashcard_reviews",
  "Flashcards index should calculate mastery from real review data.",
);
assertIncludes(
  flashcardsIndex,
  "Flashcard Training",
  "Flashcards index should expose the training status panel.",
);
assertIncludes(flashcardsIndex, "Deck mastery", "Flashcards decks should show mastery progress.");
assertIncludes(
  flashcardsIndex,
  "DialogDescription",
  "Flashcards create deck dialog must include an accessible description.",
);
for (const id of ["flashcard-title", "flashcard-description", "flashcard-public"]) {
  assertPairedLabel(flashcardsIndex, id, "Flashcards create deck dialog");
}

const adminRooms = read("src/routes/_authenticated/admin/rooms.tsx");
assertIncludes(
  adminRooms,
  "DialogDescription",
  "Admin room dialog must include an accessible description.",
);
for (const id of [
  "room-name",
  "room-type",
  "room-capacity",
  "room-building",
  "room-floor",
  "room-location",
  "room-amenities",
  "room-image-url",
  "room-description",
]) {
  assertPairedLabel(adminRooms, id, "Admin room dialog");
}

const quizJoin = read("src/routes/_authenticated/quiz.join.tsx");
assertPairedLabel(quizJoin, "quiz-code", "Quiz join form");

const profile = read("src/routes/_authenticated/profile.tsx");
assertIncludes(
  profile,
  'className="size-11"',
  "Profile edit button must preserve a 44px touch target.",
);
assertIncludes(
  profile,
  'className="h-11 w-56',
  "Profile edit input must preserve a 44px touch target.",
);

const gamificationPanel = read("src/components/gamification-status-panel.tsx");
assertIncludes(
  gamificationPanel,
  "Weekly Mission Board",
  "Gamification panel must keep the weekly mission board.",
);
assertIncludes(
  gamificationPanel,
  "conic-gradient",
  "Gamification panel must keep the level progress ring.",
);
assertIncludes(
  gamificationPanel,
  'to: "/weekly-missions"',
  "Gamification missions must route students toward weekly missions.",
);

const weeklyMissions = read("src/routes/_authenticated/weekly-missions.tsx");
assertIncludes(
  weeklyMissions,
  'createFileRoute("/_authenticated/weekly-missions")',
  "Weekly missions route must stay registered.",
);
assertIncludes(
  weeklyMissions,
  "จัดรอบเรียน 2 ชั่วโมงต่อห้อง",
  "Weekly missions must reflect the real two-hour-per-class teaching cadence.",
);
assertIncludes(
  weeklyMissions,
  "AI ตรวจตามสัดส่วน",
  "Weekly missions must preserve proportional AI grading language.",
);
assertIncludes(
  weeklyMissions,
  "Team Rally",
  "Weekly missions must keep the classroom team rally layer.",
);
assertIncludes(
  weeklyMissions,
  "CampaignBriefPanel",
  "Weekly missions must expose the campaign brief controls.",
);
assertIncludes(
  weeklyMissions,
  "TeacherMissionBuilderPanel",
  "Weekly missions must expose a teacher mission builder.",
);
assertIncludes(
  weeklyMissions,
  "SessionDashboardPanel",
  "Weekly missions must expose the sync and recap dashboard.",
);
assertIncludes(
  weeklyMissions,
  "TeamPlannerPanel",
  "Weekly missions must keep the temporary team planner.",
);
assertIncludes(weeklyMissions, "BonusPathPanel", "Weekly missions must keep the term bonus path.");
assertIncludes(
  weeklyMissions,
  "weekly_missions",
  "Weekly missions route must read/write the persisted campaign table when available.",
);
assertIncludes(
  weeklyMissions,
  "term_bonus_rules",
  "Weekly missions route must surface term bonus rules when available.",
);
assertIncludes(
  weeklyMissions,
  "mission_progress",
  "Weekly missions route must sync mission progress rows.",
);
assertIncludes(
  weeklyMissions,
  "weekly_mission_recaps",
  "Weekly missions route must create weekly recaps.",
);
assertIncludes(
  weeklyMissions,
  "createTeamsMutation",
  "Weekly missions route must create temporary classroom teams.",
);
assertIncludes(
  weeklyMissions,
  "weekly-mission-title",
  "Weekly mission builder must label the title field.",
);

const bonusCenter = read("src/routes/_authenticated/bonus-center.tsx");
assertIncludes(
  bonusCenter,
  'createFileRoute("/_authenticated/bonus-center")',
  "Bonus center route must stay registered.",
);
assertIncludes(bonusCenter, "Bonus Center", "Bonus center must expose its English product label.");
assertIncludes(bonusCenter, "term_bonus_rules", "Bonus center must read term bonus rules.");
assertIncludes(
  bonusCenter,
  "classroom_scores",
  "Bonus center must read classroom leaderboard scores.",
);
assertIncludes(
  bonusCenter,
  "mission_progress",
  "Bonus center must connect weekly mission progress to bonus milestones.",
);
assertIncludes(
  bonusCenter,
  "คะแนนพิเศษท้ายเทอม",
  "Bonus center must explain the term bonus purpose in Thai.",
);

const weeklyMissionMigration = read("supabase/migrations/20260603093000_weekly_mission_system.sql");
for (const tableName of [
  "weekly_missions",
  "weekly_mission_items",
  "mission_progress",
  "weekly_mission_teams",
  "weekly_mission_team_members",
  "weekly_mission_recaps",
  "quality_marks",
  "term_bonus_rules",
]) {
  assertIncludes(
    weeklyMissionMigration,
    `public.${tableName}`,
    `Weekly mission migration must create ${tableName}.`,
  );
}
assertIncludes(
  weeklyMissionMigration,
  "ENABLE ROW LEVEL SECURITY",
  "Weekly mission migration must enable RLS for new tables.",
);
assertIncludes(
  weeklyMissionMigration,
  "is_weekly_mission_owner",
  "Weekly mission migration must include owner helper for RLS.",
);

const supabaseTypes = read("src/integrations/supabase/types.ts");
for (const tableName of [
  "weekly_missions",
  "weekly_mission_items",
  "mission_progress",
  "weekly_mission_teams",
  "weekly_mission_team_members",
  "weekly_mission_recaps",
  "quality_marks",
  "term_bonus_rules",
]) {
  assertIncludes(supabaseTypes, `${tableName}: {`, `Supabase types must include ${tableName}.`);
}

const questsRoute = read("src/routes/_authenticated/quests.tsx");
assertNotIncludes(questsRoute, "Daily Quests", "Quest page must not present as daily-first.");
assertNotIncludes(
  questsRoute,
  "ยังไม่มี Daily Quest",
  "Quest empty state must use Practice Quest language.",
);
assertIncludes(
  questsRoute,
  "เควสต์ฝึกทักษะ",
  "Quest page must present as practice support for weekly missions.",
);

const classroomDetail = read("src/routes/_authenticated/classrooms.$id.tsx");
assertNotIncludes(
  classroomDetail,
  "ยังไม่มี Daily Quest",
  "Classroom detail quest empty state must use Practice Quest language.",
);
assertNotIncludes(
  classroomDetail,
  "h-7 w-7",
  "Classroom detail action buttons must not regress below 44px touch targets.",
);

const dashboard = read("src/routes/_authenticated/dashboard.tsx");
assertIncludes(dashboard, "AdminActivityCenter", "Admin dashboard must keep the activity center.");
assertIncludes(
  dashboard,
  "admin-activity-center",
  "Admin activity center must have a stable query key.",
);

const flashcardsDeck = read("src/routes/_authenticated/flashcards.$deckId.tsx");
assertIncludes(
  flashcardsDeck,
  "DialogDescription",
  "Flashcard detail add-card dialog must include an accessible description.",
);
assertIncludes(
  flashcardsDeck,
  "studyCards",
  "Flashcard detail should sort due cards first in study mode.",
);
assertIncludes(
  flashcardsDeck,
  "nextReview.review_count",
  "Flashcard review count should increment instead of resetting.",
);
for (const id of ["flashcard-front", "flashcard-back"]) {
  assertPairedLabel(flashcardsDeck, id, "Flashcard detail add-card dialog");
}

if (failures.length > 0) {
  console.error(`UX regression check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UX regression check passed.");
