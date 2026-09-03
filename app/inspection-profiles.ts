import type { InspectionProfile } from './pipeline-run';

export const INSPECTION_PROFILES: Array<{
  id: InspectionProfile;
  name: string;
  shortName: string;
  description: string;
  context: string;
}> = [
  {
    id: 'visual_safety',
    name: 'General Safety Rules',
    shortName: 'General Safety',
    description: 'Review visible work-site conditions using the general safety inspection profile.',
    context: 'Visual evidence and configured project context',
  },
  {
    id: 'regulatory_compliance',
    name: 'Regulatory Compliance',
    shortName: 'Regulatory Compliance',
    description: 'Check visible conditions against applicable retrieved regulations and approved sources.',
    context: 'Geography, industry, organization and project knowledge',
  },
];

export const profileInfo = (id?: string) =>
  INSPECTION_PROFILES.find((profile) => profile.id === id) || INSPECTION_PROFILES[1];

export const profileLabel = (id?: string) => profileInfo(id).shortName;
