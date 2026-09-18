import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hncdqdkyhfgummhkjiet.supabase.co';
// Public anon key — safe to commit. RLS enforces all access control.
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          photo_url: string | null;
          zip_code: string | null;
          qr_code: string | null;
          taste_profile: TasteProfile | null;
          notif_interval: 'daily' | 'every2days' | 'weekly' | 'custom';
          notif_custom_hours: number | null;
          expo_push_token: string | null;
          onboarding_done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']>;
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          tvdb_series_id: string;
          show_title: string;
          overview: string | null;
          poster_url: string | null;
          zip_code: string | null;
          score: number;
          recommended_at: string;
          seen: boolean;
        };
      };
      friends: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: 'pending' | 'accepted' | 'declined';
          created_at: string;
          updated_at: string;
        };
      };
      promotions: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string;
          tvdb_series_id: string;
          show_title: string;
          sent_at: string;
          acknowledged: boolean;
        };
      };
      rps_matches: {
        Row: {
          id: string;
          challenger_id: string;
          challenged_id: string;
          challenger_show_id: string;
          challenger_show_title: string;
          challenged_show_id: string | null;
          challenged_show_title: string | null;
          challenger_choice: 'rock' | 'paper' | 'scissors' | null;
          challenged_choice: 'rock' | 'paper' | 'scissors' | null;
          winner_id: string | null;
          status: 'pending' | 'accepted' | 'choosing' | 'resolved' | 'expired';
          created_at: string;
          expires_at: string;
          resolved_at: string | null;
        };
      };
    };
  };
};

export type TasteProfile = {
  genres?: string[];
  yearRange?: string;
  pace?: string;
  status?: string;
  language?: string;
  episodeLength?: string;
  mood?: string;
  networks?: string[];
};
