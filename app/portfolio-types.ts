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
};

export const budgetPayload = (amount: string, period: BudgetPeriod) => amount === '' ? null : ({
  amount: Number(amount), period, currency: 'USD', enforcement: 'notify_only',
  warning_thresholds: [50, 75, 90, 100], timezone: 'America/New_York',
});

export const money = (value?: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(value || 0);
