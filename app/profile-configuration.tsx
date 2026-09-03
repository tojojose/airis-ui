'use client';

import { INSPECTION_PROFILES } from './inspection-profiles';
import type { InspectionProject, InspectionProfile } from './pipeline-run';

export function ProfileConfiguration({ project, onChange }: {
  project: InspectionProject;
  onChange: (project: InspectionProject) => void;
}) {
  const enabled: InspectionProfile[] = project.inspection_profiles?.length
    ? project.inspection_profiles : ['visual_safety', 'regulatory_compliance'];
  const selectedDefault = project.default_inspection_profile && enabled.includes(project.default_inspection_profile)
    ? project.default_inspection_profile : enabled[0];

  function toggle(profile: InspectionProfile, checked: boolean) {
    const next = checked
      ? [...new Set([...enabled, profile])]
      : enabled.filter((item) => item !== profile);
    if (!next.length) return;
    onChange({
      ...project,
      inspection_profiles: next,
      default_inspection_profile: next.includes(selectedDefault) ? selectedDefault : next[0],
    });
  }

  return <div className="wide">
    <fieldset className="profile-config"><legend>Enabled inspection profiles</legend>
      {INSPECTION_PROFILES.map((profile) => <label key={profile.id}>
        <input type="checkbox" checked={enabled.includes(profile.id)} disabled={enabled.length === 1 && enabled[0] === profile.id} onChange={(event) => toggle(profile.id, event.target.checked)} />
        <span><strong>{profile.name}</strong><small>{profile.description}</small></span>
      </label>)}
    </fieldset>
    <label className="profile-default-field"><span>Default inspection profile</span>
      <select value={selectedDefault} onChange={(event) => onChange({ ...project, default_inspection_profile: event.target.value as InspectionProfile })}>
        {INSPECTION_PROFILES.filter((profile) => enabled.includes(profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
    </label>
  </div>;
}
