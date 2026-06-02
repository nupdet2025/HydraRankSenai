export interface UserProfile {
  email: string;
  username: string;
  avatar: string; // Emoji character
  createdAt: string;
}

export interface WaterLog {
  id: string;
  email: string;
  date: string; // YYYY-MM-DD
  amount: number; // in milliliters (ml)
  timestamp: string;
}

export interface RankingItem {
  email: string;
  username: string;
  avatar: string;
  totalAmount: number;
}

export type RankingPeriod = 'today' | 'week' | 'month' | 'overall';
