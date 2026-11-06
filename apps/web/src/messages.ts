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
    or: 'or',
    google: 'Sign in with Google',
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
  platform: {
    title: 'Platform owner area',
    intro: 'Only you, as the owner of Q-smart, see this: all client companies, and a new one with its first admin.',
    company: 'Company',
    people: 'People',
    admins: 'Admins',
    since: 'Since',
    new: 'New client company',
    adminName: 'First admin: name',
    adminEmail: 'First admin: e-mail',
    create: 'Create the company',
    created: '{{company}} is created. {{email}} gets it at their first sign-in with this e-mail.',
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
    or: 'или',
    google: 'Вход с Google',
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
  platform: {
    title: 'Собственик на платформата',
    intro:
      'Само вие, като собственик на Q-smart, виждате това: всички клиентски компании и нова компания с първия ѝ администратор.',
    company: 'Компания',
    people: 'Хора',
    admins: 'Администратори',
    since: 'От',
    new: 'Нова клиентска компания',
    adminName: 'Първи администратор: име',
    adminEmail: 'Първи администратор: имейл',
    create: 'Създай компанията',
    created: '{{company}} е създадена. {{email}} ще я получи при първия си вход с този имейл.',
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
    or: 'ou',
    google: 'Se connecter avec Google',
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
  platform: {
    title: 'Espace propriétaire de la plateforme',
    intro:
      'Vous seul, propriétaire de Q-smart, voyez ceci : toutes les entreprises clientes, et une nouvelle avec son premier administrateur.',
    company: 'Entreprise',
    people: 'Personnes',
    admins: 'Administrateurs',
    since: 'Depuis',
    new: 'Nouvelle entreprise cliente',
    adminName: 'Premier administrateur : nom',
    adminEmail: 'Premier administrateur : e-mail',
    create: 'Créer l’entreprise',
    created: '{{company}} est créée. {{email}} la recevra à sa première connexion avec cet e-mail.',
  },
};

export const messages: Record<Language, Messages> = { en, bg, fr };
