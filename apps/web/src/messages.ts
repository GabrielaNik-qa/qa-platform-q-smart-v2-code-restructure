// Every text of the pages, in English, Bulgarian and French (terms as in docs/i18n-glossary.md).
// A test checks that the three languages have exactly the same texts.
import type { Language } from '@qsmart/shared';

const en = {
  common: {
    language: 'Language',
    lightDark: 'Light or dark',
    preview: 'Q-smart v2 · Phase 0 preview',
    loading: 'Loading…',
    error: 'Something went wrong: {{message}}',
  },
  signIn: {
    title: 'Sign in',
    email: 'E-mail',
    password: 'Password',
    submit: 'Sign in',
    busy: 'Signing in…',
    wrong: 'The e-mail or password is wrong.',
    failed: 'Could not sign in. Please try again.',
    testAccounts: 'Test accounts on this PC: {{accounts}} · password: {{password}}',
  },
  home: {
    welcome: 'Welcome, {{name}}',
    companies: 'Your companies',
    noCompanies: 'You are not a member of any company yet.',
    choose: 'Choose a company to see its teams.',
    teams: 'Teams of {{company}}',
    staffTeam: 'staff',
    signOut: 'Sign out',
  },
};

export type Messages = typeof en;

const bg: Messages = {
  common: {
    language: 'Език',
    lightDark: 'Светъл или тъмен режим',
    preview: 'Q-smart v2 · преглед, фаза 0',
    loading: 'Зареждане…',
    error: 'Нещо се обърка: {{message}}',
  },
  signIn: {
    title: 'Вход',
    email: 'Имейл',
    password: 'Парола',
    submit: 'Вход',
    busy: 'Влизане…',
    wrong: 'Грешен имейл или парола.',
    failed: 'Входът не успя. Опитайте отново.',
    testAccounts: 'Тестови акаунти на този компютър: {{accounts}} · парола: {{password}}',
  },
  home: {
    welcome: 'Добре дошли, {{name}}',
    companies: 'Вашите компании',
    noCompanies: 'Все още не сте член на никоя компания.',
    choose: 'Изберете компания, за да видите екипите ѝ.',
    teams: 'Екипи на {{company}}',
    staffTeam: 'персонал',
    signOut: 'Изход',
  },
};

const fr: Messages = {
  common: {
    language: 'Langue',
    lightDark: 'Clair ou sombre',
    preview: 'Q-smart v2 · aperçu de la phase 0',
    loading: 'Chargement…',
    error: 'Une erreur s’est produite : {{message}}',
  },
  signIn: {
    title: 'Connexion',
    email: 'E-mail',
    password: 'Mot de passe',
    submit: 'Se connecter',
    busy: 'Connexion…',
    wrong: 'L’e-mail ou le mot de passe est incorrect.',
    failed: 'Connexion impossible. Veuillez réessayer.',
    testAccounts: 'Comptes de test sur ce PC : {{accounts}} · mot de passe : {{password}}',
  },
  home: {
    welcome: 'Bienvenue, {{name}}',
    companies: 'Vos entreprises',
    noCompanies: 'Vous n’êtes membre d’aucune entreprise pour l’instant.',
    choose: 'Choisissez une entreprise pour voir ses équipes.',
    teams: 'Équipes de {{company}}',
    staffTeam: 'personnel',
    signOut: 'Se déconnecter',
  },
};

export const messages: Record<Language, Messages> = { en, bg, fr };
