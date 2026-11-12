// One page of an app: the pages v2 has built, or "Soon" with the phase of the plan that builds it.
import { Link, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Account } from './Account';
import { Activity } from './Activity';
import { Agents } from './Agents';
import { AutoQA } from './AutoQA';
import { AiProviders, AiSwitch, AiUsage } from './AiSettings';
import { findPage, isBuilt, menuOf } from './menu';
import { Calendar } from './Calendar';
import { Conversations } from './Conversations';
import { Fields } from './Fields';
import { Calibrations } from './Calibration';
import { Coaching } from './Coaching';
import { CategoryStats } from './CategoryStats';
import { Dashboard } from './Dashboard';
import { Disputes } from './Disputes';
import { ExportCentre } from './ExportCentre';
import { GettingStarted } from './GettingStarted';
import { Goals } from './Goals';
import { ImprovementPlans } from './ImprovementPlans';
import { People } from './People';
import { Personalize } from './Personalize';
import { Pins } from './Pins';
import { Planner } from './Planner';
import { Prefs } from './Prefs';
import { QAEntry } from './QAEntry';
import { QuickFlags } from './QuickFlags';
import { Recognition } from './Recognition';
import { ReportBuilder } from './ReportBuilder';
import { ReviewerQA } from './ReviewerQA';
import { Reviews } from './Reviews';
import { Library, RootCauses, SystemSettings } from './QualitySetup';
import { Roles } from './Roles';
import { SavedReports } from './SavedReports';
import { Scorecards } from './Scorecards';
import { useSession } from './session';
import { Skills } from './Skills';
import { Tasks } from './Tasks';
import { TeamReview } from './TeamReview';
import { TopicDashboards } from './TopicDashboards';
import { Teams } from './Teams';
import type { CompanyRef } from './ui';
import { Workload } from './Workload';
import { Workspaces } from './Workspaces';

const PAGES: Record<string, (company: CompanyRef, email: string | null) => ReactNode> = {
  'admin/users': (company, email) => <People company={company} myEmail={email} />,
  'admin/teams': (company) => <Teams company={company} />,
  'admin/workspaces': (company) => <Workspaces company={company} />,
  'admin/skills': (company) => <Skills company={company} />,
  'admin/profile': (company) => <Account tab="profile" company={company} />,
  'admin/password': (company) => <Account tab="password" company={company} />,
  'admin/appearance': (company) => <Account tab="appearance" company={company} />,
  'admin/language': (company) => <Account tab="language" company={company} />,
  'admin/notifications-and-confirmations': () => <Prefs />,
  'admin/scorecards': (company) => <Scorecards company={company} />,
  'quality/dashboard': (company) => <Dashboard company={company} />,
  'quality/personalize': (company) => <Personalize company={company} />,
  'quality/getting-started': (company) => <GettingStarted company={company} />,
  'quality/qa-entry': (company) => <QAEntry company={company} />,
  'quality/reviews': (company) => <Reviews company={company} />,
  'quality/disputes': (company) => <Disputes company={company} />,
  'quality/quick-flags': (company) => <QuickFlags company={company} />,
  'quality/calibration': (company) => <Calibrations company={company} />,
  'quality/reviewer-qa': (company) => <ReviewerQA company={company} />,
  'quality/pins': (company) => <Pins company={company} />,
  'quality/agents': (company) => <Agents company={company} />,
  'quality/team-review': (company) => <TeamReview company={company} />,
  'quality/category-stats': (company) => <CategoryStats company={company} />,
  'quality/topic-dashboards': (company) => <TopicDashboards company={company} />,
  'quality/goals-and-kpis': (company) => <Goals company={company} />,
  'quality/improvement-plans': (company) => <ImprovementPlans company={company} />,
  'quality/tasks': (company) => <Tasks company={company} />,
  'quality/coaching': (company) => <Coaching company={company} />,
  'quality/recognition': (company) => <Recognition company={company} />,
  'quality/review-planner': (company) => <Planner company={company} />,
  'quality/qa-workload': (company) => <Workload company={company} />,
  'quality/calendar': (company) => <Calendar company={company} />,
  'quality/report-builder': (company) => <ReportBuilder company={company} />,
  'quality/saved-and-scheduled': (company) => <SavedReports company={company} />,
  'quality/export-centre': (company) => <ExportCentre company={company} />,
  'admin/categories': (company) => <Library company={company} />,
  'admin/root-causes': (company) => <RootCauses company={company} />,
  'admin/system-settings': (company) => <SystemSettings company={company} />,
  'admin/ai-provider': (company) => <AiProviders company={company} />,
  'admin/fields': (company) => <Fields company={company} />,
  'quality/conversations': (company) => <Conversations company={company} />,
  'quality/autoqa': (company) => <AutoQA company={company} />,
  'admin/ai-usage-limits': (company) => <AiUsage company={company} />,
  'admin/ai-on-or-off': (company) => <AiSwitch company={company} />,
  'admin/all-roles': (company) => <Roles company={company} />,
  'admin/agent': (company) => <Roles company={company} role="agent" />,
  'admin/trainer': (company) => <Roles company={company} role="trainer" />,
  'admin/team-lead': (company) => <Roles company={company} role="lead" />,
  'admin/reviewer': (company) => <Roles company={company} role="reviewer" />,
  'admin/admin': (company) => <Roles company={company} role="admin" />,
  'quality/all-activity': (company) => <Activity kind="all" company={company} />,
  'quality/my-activity': (company) => <Activity kind="mine" company={company} />,
  'quality/sign-ins': (company) => <Activity kind="signins" company={company} />,
  'quality/exports-and-downloads': (company) => <Activity kind="exports" company={company} />,
};

export function NotFound() {
  const { t } = useTranslation();
  return (
    <section className="grid gap-3 max-w-xl">
      <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('notFound.title')}</h1>
      <p className="text-mu">{t('notFound.text')}</p>
      <Link to="/" className="text-ac font-semibold hover:underline">
        {t('notFound.home')}
      </Link>
    </section>
  );
}

export function PageView() {
  const { t } = useTranslation();
  const { app, page } = useParams({ from: '/$app/$page' });
  const { company, me } = useSession();
  const found = company ? findPage(menuOf(company), app, page) : undefined;
  if (!company || !found) return <NotFound />;
  const draw = PAGES[`${found.app.id}/${found.page.id}`];
  if (draw && isBuilt(found.app.id, found.page)) return <div key={company.id}>{draw(company, me.email)}</div>;
  return (
    <section className="grid gap-3 max-w-2xl">
      <p className="text-sm text-mu">
        {t(`menu.apps.${found.app.id === 'admin' && company.role !== 'admin' ? 'settings' : found.app.id}`)} ›{' '}
        {t(`menu.groups.${found.group.id}`)}
      </p>
      <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">
        {t(`menu.pages.${found.page.key}`)}
      </h1>
      <div className="bg-pn border border-bd rounded-m p-5 grid gap-2">
        <p>{t('soon.text', { phase: found.page.phase, name: t(`phases.${found.page.phase}`) })}</p>
        <p className="text-sm text-mu">{t('soon.today')}</p>
      </div>
    </section>
  );
}
