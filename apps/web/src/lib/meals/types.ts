export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  meals: {
    Tables: {
      consumption: {
        Row: {
          cooking_event_id: string
          eaten_at: string
          eater_user_id: string
          id: string
          servings: number
        }
        Insert: {
          cooking_event_id: string
          eaten_at?: string
          eater_user_id: string
          id?: string
          servings?: number
        }
        Update: {
          cooking_event_id?: string
          eaten_at?: string
          eater_user_id?: string
          id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "consumption_cooking_event_id_fkey"
            columns: ["cooking_event_id"]
            isOneToOne: false
            referencedRelation: "cooking_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cooking_events: {
        Row: {
          cooked_at: string
          cooked_by_user_id: string
          id: string
          plan_id: string
          recipe_id: string
        }
        Insert: {
          cooked_at?: string
          cooked_by_user_id: string
          id?: string
          plan_id: string
          recipe_id: string
        }
        Update: {
          cooked_at?: string
          cooked_by_user_id?: string
          id?: string
          plan_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooking_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_events_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          created_at: string
          ext_id: string | null
          id: string
          macros_per_100g: Json
          name: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ext_id?: string | null
          id?: string
          macros_per_100g: Json
          name: string
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ext_id?: string | null
          id?: string
          macros_per_100g?: Json
          name?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      grocery_items: {
        Row: {
          checked_off_at: string | null
          food_id: string
          id: string
          plan_id: string
          total_quantity: number
          unit: string
        }
        Insert: {
          checked_off_at?: string | null
          food_id: string
          id?: string
          plan_id: string
          total_quantity: number
          unit: string
        }
        Update: {
          checked_off_at?: string | null
          food_id?: string
          id?: string
          plan_id?: string
          total_quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_members: {
        Row: {
          added_at: string
          display_name: string
          plan_id: string
          targets: Json
          user_id: string
        }
        Insert: {
          added_at?: string
          display_name: string
          plan_id: string
          targets: Json
          user_id: string
        }
        Update: {
          added_at?: string
          display_name?: string
          plan_id?: string
          targets?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_members_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          duration_days: number
          id: string
          name: string
          owner_user_id: string
          started_at: string | null
        }
        Insert: {
          created_at?: string
          duration_days?: number
          id?: string
          name: string
          owner_user_id: string
          started_at?: string | null
        }
        Update: {
          created_at?: string
          duration_days?: number
          id?: string
          name?: string
          owner_user_id?: string
          started_at?: string | null
        }
        Relationships: []
      }
      recipe_claimed_macros: {
        Row: {
          calories: number
          carbs_g: number
          fat_g: number
          id: string
          plan_member_user_id: string
          protein_g: number
          recipe_id: string
        }
        Insert: {
          calories: number
          carbs_g: number
          fat_g: number
          id?: string
          plan_member_user_id: string
          protein_g: number
          recipe_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          fat_g?: number
          id?: string
          plan_member_user_id?: string
          protein_g?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_claimed_macros_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredient_portions: {
        Row: {
          id: string
          plan_member_user_id: string
          quantity: number
          recipe_ingredient_id: string
        }
        Insert: {
          id?: string
          plan_member_user_id: string
          quantity: number
          recipe_ingredient_id: string
        }
        Update: {
          id?: string
          plan_member_user_id?: string
          quantity?: number
          recipe_ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_portions_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          food_id: string
          id: string
          position: number
          recipe_id: string
          total_quantity: number
          unit: string
        }
        Insert: {
          food_id: string
          id?: string
          position: number
          recipe_id: string
          total_quantity: number
          unit: string
        }
        Update: {
          food_id?: string
          id?: string
          position?: number
          recipe_id?: string
          total_quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          id: string
          instructions: string
          name: string
          plan_id: string
          planned_count: number
          position: number
          slot: string
        }
        Insert: {
          id?: string
          instructions?: string
          name: string
          plan_id: string
          planned_count?: number
          position: number
          slot: string
        }
        Update: {
          id?: string
          instructions?: string
          name?: string
          plan_id?: string
          planned_count?: number
          position?: number
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_plan_member: { Args: { p_plan_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  meals: {
    Enums: {},
  },
} as const
