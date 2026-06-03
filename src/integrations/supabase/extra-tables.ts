// Local type augmentation for Supabase tables that exist in app code but are
// not yet present in the generated `types.ts` (pending DB migration of the
// weekly gamification system spec). This keeps the build green while the
// runtime fallback in the consuming routes handles the missing tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as baseSupabase } from "./client";
import type { Database as BaseDatabase, Json } from "./types";

type Timestamp = string;

type TableShape<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

type WeeklyMissionRow = {
  id: string;
  classroom_id: string;
  title: string;
  week_start: string;
  week_end: string;
  main_assignment_id: string | null;
  practice_quest_id: string | null;
  flashcard_deck_id: string | null;
  participation_xp: number;
  quality_xp_max: number;
  status: string;
  team_mode: boolean;
  created_by: string;
  published_at: Timestamp | null;
  closed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type WeeklyMissionItemRow = {
  id: string;
  mission_id: string;
  type: string;
  title: string;
  description: string | null;
  xp_max: number;
  required: boolean;
  sort_order: number;
  source_table: string | null;
  source_id: string | null;
  created_at: Timestamp;
};

type WeeklyMissionTeamRow = {
  id: string;
  mission_id: string;
  name: string;
  team_goal: string | null;
  contribution_target: number;
  created_by: string;
  created_at: Timestamp;
};

type WeeklyMissionTeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role_label: string | null;
  contribution_mark: number;
  helper_mark: boolean;
  joined_at: Timestamp;
};

type MissionProgressRow = {
  id: string;
  mission_id: string;
  item_id: string;
  user_id: string;
  status: string;
  participation_xp_awarded: number;
  quality_xp_awarded: number;
  ai_xp_awarded: number;
  completed_at: Timestamp | null;
  reviewed_at: Timestamp | null;
  updated_at: Timestamp;
};

type WeeklyMissionRecapRow = {
  id: string;
  mission_id: string;
  classroom_id: string;
  user_id: string | null;
  audience: string;
  summary: string | null;
  ai_summary: string | null;
  generated_at: Timestamp;
  created_by: string;
};

type TermBonusRuleRow = {
  id: string;
  grade_level: string | null;
  classroom_id: string | null;
  name: string;
  rule_type: string;
  bonus_points: number;
  criteria_json: Json | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ExtraTables = {
  weekly_missions: TableShape<WeeklyMissionRow>;
  weekly_mission_items: TableShape<WeeklyMissionItemRow>;
  weekly_mission_teams: TableShape<WeeklyMissionTeamRow>;
  weekly_mission_team_members: TableShape<WeeklyMissionTeamMemberRow>;
  mission_progress: TableShape<MissionProgressRow>;
  weekly_mission_recaps: TableShape<
    WeeklyMissionRecapRow,
    Omit<Partial<WeeklyMissionRecapRow>, "summary" | "ai_summary"> & {
      summary?: Json | null;
      ai_summary?: Json | null;
    }
  >;
  term_bonus_rules: TableShape<TermBonusRuleRow>;
};

export type Database = Omit<BaseDatabase, "public"> & {
  public: Omit<BaseDatabase["public"], "Tables"> & {
    Tables: BaseDatabase["public"]["Tables"] & ExtraTables;
  };
};

export type { Json };

export const supabase = baseSupabase as unknown as SupabaseClient<Database>;
