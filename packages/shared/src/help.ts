// Help inside the app and the script builder (Phase 6, piece 4; today's Help Center pages): the FAQ, the glossary, the video
// tutorials, the guided tours and the call scripts. Staff write them, everybody reads them. Q-smart's own starter lists
// (the glossary and two tours) come in the three languages, so a company can start from them and then change them.
import type { Language } from './roles.js';

export const HELP_KINDS = ['faq', 'glossary', 'video', 'tour', 'script'] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/** Who a tour is for: everybody, or one role. */
export const TOUR_ROLES = ['all', 'admin', 'reviewer', 'lead', 'trainer', 'agent'] as const;
export type TourRole = (typeof TOUR_ROLES)[number];

/** A step of a tour (a page to open and what to do there) or of a script (what to say). */
export interface HelpStep {
  title: string;
  text: string;
  /** a tour step: the page it opens, such as quality/reviews; empty for a script step */
  page: string;
}

/** A video link must be a secure one, so nothing but a web address is ever opened. */
export const isSecureLink = (link: string) => /^https:\/\/[^\s]+$/i.test(link);

export interface StarterTour {
  title: string;
  role: TourRole;
  steps: HelpStep[];
}
const step = (page: string, title: string): HelpStep => ({ page, title, text: '' });

const GLOSSARY: Record<Language, [string, string][]> = {
  en: [
    ['Scorecard', 'The list of questions a review is scored with. Each question has points; together they make 100.'],
    ['Critical item', 'A question of the scorecard that makes the whole review fail when it is missed.'],
    ['Pass mark', 'The score a review must reach to pass (85% unless an admin set another one for the team).'],
    ['AutoQA', 'Reviews scored by the AI. A person can check and change every score.'],
    ['Calibration', 'Reviewers score the same conversation and compare, so everybody scores the same way.'],
    ['Dispute', 'An agent does not agree with a review and explains why; a reviewer answers and may change the score.'],
    ['Quick flag', 'A red or green flag on a conversation, without a full review.'],
    ['Root cause', 'The real reason behind a mistake, chosen when a review fails.'],
    ['One-to-One', 'A planned talk between a team lead and one agent, with notes and next steps.'],
    ['Improvement plan', 'Goals for an agent over a few weeks, followed up until they are reached.'],
    ['CSAT', 'Customer satisfaction: the score customers give in a survey after a conversation, from 1 to 5.'],
    ['Reviewer QA', 'Checking the reviews themselves: are they fair and do they follow the scorecard?'],
  ],
  bg: [
    [
      'Оценъчна карта',
      'Списъкът с въпроси, по който се оценява прегледът. Всеки въпрос има точки; заедно те правят 100.',
    ],
    ['Критичен въпрос', 'Въпрос от оценъчната карта, при чийто пропуск целият преглед пропада.'],
    [
      'Праг за успех',
      'Оценката, която прегледът трябва да достигне, за да е успешен (85%, освен ако админ не е задал друга за екипа).',
    ],
    ['AutoQA', 'Прегледи, оценени от изкуствения интелект. Човек може да провери и промени всяка оценка.'],
    [
      'Калибриране',
      'Прегледващите оценяват един и същ разговор и сравняват, за да оценяват всички по един и същ начин.',
    ],
    ['Оспорване', 'Агент не е съгласен с преглед и обяснява защо; прегледащият отговаря и може да промени оценката.'],
    ['Бърз флаг', 'Червен или зелен флаг на разговор, без пълен преглед.'],
    ['Първопричина', 'Истинската причина зад грешката, избрана, когато прегледът пропадне.'],
    ['Среща един на един', 'Планиран разговор между ръководител на екип и един агент, с бележки и следващи стъпки.'],
    ['План за подобрение', 'Цели за агент за няколко седмици, проследявани, докато бъдат постигнати.'],
    ['CSAT', 'Удовлетвореност на клиентите: оценката, която клиентите дават в анкета след разговор, от 1 до 5.'],
    ['Преглед на прегледите', 'Проверка на самите прегледи: справедливи ли са и следват ли оценъчната карта?'],
  ],
  fr: [
    [
      'Grille',
      'La liste de questions avec laquelle une évaluation est notée. Chaque question a des points; ensemble, ils font 100.',
    ],
    ['Point critique', "Une question de la grille qui fait échouer toute l'évaluation quand elle est ratée."],
    [
      'Seuil de réussite',
      "La note qu'une évaluation doit atteindre pour réussir (85 % sauf si un admin en a fixé une autre pour l'équipe).",
    ],
    ['AutoQA', "Évaluations notées par l'IA. Une personne peut vérifier et modifier chaque note."],
    [
      'Calibrage',
      'Les évaluateurs notent la même conversation et comparent, pour que tout le monde note de la même façon.',
    ],
    [
      'Contestation',
      "Un agent n'est pas d'accord avec une évaluation et explique pourquoi; un évaluateur répond et peut changer la note.",
    ],
    ['Drapeau rapide', 'Un drapeau rouge ou vert sur une conversation, sans évaluation complète.'],
    ['Cause racine', "La vraie raison d'une erreur, choisie quand une évaluation échoue."],
    [
      'Entretien individuel',
      "Un échange planifié entre un chef d'équipe et un agent, avec des notes et les prochaines étapes.",
    ],
    [
      "Plan d'amélioration",
      "Des objectifs pour un agent sur quelques semaines, suivis jusqu'à ce qu'ils soient atteints.",
    ],
    ['CSAT', 'Satisfaction client: la note que les clients donnent dans une enquête après une conversation, de 1 à 5.'],
    ['Contrôle des évaluateurs', 'Vérifier les évaluations elles-mêmes: sont-elles justes et suivent-elles la grille?'],
  ],
};

const TOURS: Record<Language, StarterTour[]> = {
  en: [
    {
      title: 'First day as an agent',
      role: 'agent',
      steps: [
        step('quality/dashboard', 'Your dashboard: your average score and what needs you now'),
        step('quality/reviews', 'Your reviews: open one to read the comments, and dispute it if you do not agree'),
        step('quality/tasks', 'Your tasks and targets: move them to Done when they are finished'),
        step('learning/my-learning', 'Your lessons and tests'),
      ],
    },
    {
      title: 'First day as a reviewer',
      role: 'reviewer',
      steps: [
        step('quality/qa-entry', 'Score a conversation here: choose the scorecard, then answer each question'),
        step('quality/reviews', 'All the reviews, with filters and the Excel export'),
        step('quality/disputes', 'Disputes wait for your decision here'),
        step('quality/calibration', 'Calibration: score the same conversation with the other reviewers'),
        step('quality/coaching', 'Coaching: what each agent needs to work on'),
      ],
    },
  ],
  bg: [
    {
      title: 'Първият ден като агент',
      role: 'agent',
      steps: [
        step('quality/dashboard', 'Вашето табло: средната ви оценка и какво изисква вниманието ви сега'),
        step(
          'quality/reviews',
          'Вашите прегледи: отворете един, за да прочетете коментарите, и го оспорете, ако не сте съгласни',
        ),
        step('quality/tasks', 'Вашите задачи и цели: преместете ги в Готови, когато приключат'),
        step('learning/my-learning', 'Вашите уроци и тестове'),
      ],
    },
    {
      title: 'Първият ден като прегледащ',
      role: 'reviewer',
      steps: [
        step('quality/qa-entry', 'Оценете разговор тук: изберете оценъчната карта и отговорете на всеки въпрос'),
        step('quality/reviews', 'Всички прегледи, с филтри и износ в Excel'),
        step('quality/disputes', 'Оспорванията чакат вашето решение тук'),
        step('quality/calibration', 'Калибриране: оценете същия разговор заедно с другите прегледащи'),
        step('quality/coaching', 'Коучинг: върху какво трябва да работи всеки агент'),
      ],
    },
  ],
  fr: [
    {
      title: 'Premier jour comme agent',
      role: 'agent',
      steps: [
        step('quality/dashboard', 'Votre tableau de bord: votre note moyenne et ce qui vous attend maintenant'),
        step(
          'quality/reviews',
          "Vos évaluations: ouvrez-en une pour lire les commentaires, et contestez-la si vous n'êtes pas d'accord",
        ),
        step('quality/tasks', 'Vos tâches et objectifs: passez-les à Terminé quand ils sont finis'),
        step('learning/my-learning', 'Vos leçons et vos tests'),
      ],
    },
    {
      title: 'Premier jour comme évaluateur',
      role: 'reviewer',
      steps: [
        step('quality/qa-entry', 'Notez une conversation ici: choisissez la grille, puis répondez à chaque question'),
        step('quality/reviews', 'Toutes les évaluations, avec filtres et export Excel'),
        step('quality/disputes', 'Les contestations attendent votre décision ici'),
        step('quality/calibration', 'Calibrage: notez la même conversation avec les autres évaluateurs'),
        step('quality/coaching', 'Coaching: ce que chaque agent doit travailler'),
      ],
    },
  ],
};

/** Q-smart's own glossary, in the language of the person who adds it. */
export const starterGlossary = (lang: Language) => GLOSSARY[lang].map(([title, body]) => ({ title, body }));
/** Q-smart's own tours, in the language of the person who adds them. */
export const starterTours = (lang: Language): StarterTour[] => TOURS[lang];
