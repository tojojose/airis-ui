export type BudgetPeriod = 'hourly' | 'daily' | 'monthly' | 'yearly';
export type Budget = {
  amount: number; period: BudgetPeriod; currency: string; enforcement: string;
  warning_thresholds: number[]; timezone: string;
  equivalents: Record<BudgetPeriod, number>;
};
export type ClientRecord = {
  org_id: string; name: string; status: string; countries?: string[];
  industries?: string[]; default_inspection_profiles?: string[]; budget?: Budget | null;
};
export type ProjectTemplate = {
  project_type: string; label: string; industry: string; domain: string;
  activity_tags: string[]; governing_authorities: string[];
  required_ppe: string[]; inspection_profiles: string[];
  default_inspection_profile: string;
};

export const budgetPayload = (amount: string, period: BudgetPeriod) => amount === '' ? null : ({
  amount: Number(amount), period, currency: 'USD', enforcement: 'hard_stop_90',
  warning_thresholds: [80, 90], timezone: 'America/New_York',
});

export const money = (value?: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  maximumFractionDigits: value && Math.abs(value) < 0.01 ? 4 : 2,
}).format(value || 0);
