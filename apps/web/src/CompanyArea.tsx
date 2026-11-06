// A company's people, teams, workspaces, and skills and languages, as tabs. (The menu as apps, next in Phase 1,
// moves these into Admin.) Skills & languages is an admin page; the others are read by everyone.
import { can } from '@qsmart/shared';
import { type KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { People } from './People';
import { Skills } from './Skills';
import { Teams } from './Teams';
import type { CompanyRef } from './ui';
import { Workspaces } from './Workspaces';

type Tab = 'people' | 'teams' | 'workspaces' | 'skills';

export function CompanyArea({ company, myEmail }: { company: CompanyRef; myEmail: string | null }) {
  const { t } = useTranslation();
  const tabs: Tab[] = can(company.role, 'people.manage')
    ? ['people', 'teams', 'workspaces', 'skills']
    : ['people', 'teams', 'workspaces'];
  const [tab, setTab] = useState<Tab>('people');

  // arrow keys move between the tabs, as in any tab list
  function onKey(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    if (!next) return;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t('tabs.label')} className="flex flex-wrap gap-1 border-b border-bd">
        {tabs.map((id) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onKey}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === id ? 'border-brand text-tx' : 'border-transparent text-mu hover:text-tx'
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'people' && <People company={company} myEmail={myEmail} />}
        {tab === 'teams' && <Teams company={company} />}
        {tab === 'workspaces' && <Workspaces company={company} />}
        {tab === 'skills' && <Skills company={company} />}
      </div>
    </div>
  );
}
