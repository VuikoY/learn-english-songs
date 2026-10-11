// lib/mock/explanations.ts
// Готові "AI-пояснення" для макетних рядків (lib/mock-lyrics.ts). Потрібні, щоб перевіряти
// інтерфейс без Gemini: у .env.local постав MOCK_AI=true. Для інших рядків — загальна заглушка.

import type { Explanation } from "@/lib/types";
import type { Language } from "@/types/game";

type MockMap = Record<string, Partial<Record<Language, Explanation>>>;

const MOCK: MockMap = {
  "I've been running late, but I'm almost there": {
    uk: {
      translation: "Я запізнювався, але вже майже на місці.",
      grammar: "Present Perfect Continuous (have been + -ing): дія почалася в минулому й триває до цього моменту.",
      slang: "",
    },
    en: {
      translation: "I've been late for a while, but I'm nearly at the destination.",
      grammar: "Present perfect continuous (have been + verb-ing): an action that began in the past and is still relevant now.",
      slang: "",
    },
  },
  "Ain't nobody gonna tell me where to go": {
    uk: {
      translation: "Ніхто не збирається казати мені, куди йти.",
      grammar: "Подвійне заперечення (ain't nobody) — нестандартне, але поширене в розмовній мові; where to go = питальне слово + інфінітив.",
      slang: "ain't — розмовне «isn't/aren't»; gonna = going to.",
    },
    en: {
      translation: "Nobody is going to tell me where to go.",
      grammar: "The double negative (ain't nobody) is non-standard but common in speech; 'where to go' is a wh-word + infinitive.",
      slang: "ain't = isn't/aren't; gonna = going to.",
    },
  },
  "If you wanna stay, then you better keep up": {
    uk: {
      translation: "Якщо хочеш залишитись, то краще не відставай.",
      grammar: "Умовне речення 1-го типу; «you better» — скорочення від «you had better» (тобі краще б...).",
      slang: "wanna = want to; keep up — не відставати.",
    },
    en: {
      translation: "If you want to stay, you'd better not fall behind.",
      grammar: "First conditional; 'you better' is short for 'you had better' + base verb.",
      slang: "wanna = want to; keep up = stay at the same pace.",
    },
  },
  "'Cause I'm not looking back, I'm already gone": {
    uk: {
      translation: "Бо я не озираюся назад, я вже пішов.",
      grammar: "Present Continuous із запереченням; gone тут — прикметник зі значенням «пішов, зник».",
      slang: "'cause — розмовне скорочення від because.",
    },
    en: {
      translation: "Because I'm not looking back; I'm already gone.",
      grammar: "Present continuous negative; 'gone' works as an adjective meaning 'left'.",
      slang: "'cause = because.",
    },
  },
  "She's been chilling on the rooftop since noon": {
    uk: {
      translation: "Вона відпочиває на даху з полудня.",
      grammar: "Present Perfect Continuous + since: дія триває від конкретного моменту в минулому (since noon).",
      slang: "to chill — розслаблятися, відпочивати.",
    },
    en: {
      translation: "She has been relaxing on the rooftop since noon.",
      grammar: "Present perfect continuous + 'since' marks a starting point ('She's' = 'She has' here).",
      slang: "to chill = to relax.",
    },
  },
  "We were never meant to play it safe": {
    uk: {
      translation: "Нам ніколи не судилося діяти обережно.",
      grammar: "was/were meant to + інфінітив — «мати бути / бути призначеним»; Past Simple Passive.",
      slang: "play it safe — не ризикувати (ідіома).",
    },
    en: {
      translation: "We were never supposed to take the cautious route.",
      grammar: "'Be meant to' + infinitive expresses intended purpose or destiny.",
      slang: "play it safe = avoid risks (idiom).",
    },
  },
  "Gimme one more night and I'll be fine": {
    uk: {
      translation: "Дай мені ще одну ніч, і я буду в порядку.",
      grammar: "Наказовий спосіб + and + Future Simple працює як умовне речення: «дай — і буде».",
      slang: "gimme = give me.",
    },
    en: {
      translation: "Give me one more night and I'll be okay.",
      grammar: "Imperative + 'and' + future simple works like a conditional ('If you give me…, I'll be…').",
      slang: "gimme = give me.",
    },
  },
  "Had I known better, I'd have stayed": {
    uk: {
      translation: "Якби я знав краще, я б залишився.",
      grammar: "Інверсія в умовному реченні 3-го типу: Had I known = If I had known; I'd have stayed = I would have stayed.",
      slang: "",
    },
    en: {
      translation: "If I had known better, I would have stayed.",
      grammar: "Inverted third conditional: 'Had I known' replaces 'If I had known' (more formal or literary).",
      slang: "",
    },
  },
};

// Загальна заглушка для рядків, яких немає в MOCK
const GENERIC: Record<Language, (text: string) => Explanation> = {
  uk: (text) => ({
    translation: `[Демо] Тут буде переклад рядка: «${text}»`,
    grammar: "Демо-режим (MOCK_AI=true): справжнє пояснення граматики з'явиться, коли вимкнеш мок.",
    slang: "",
  }),
  en: (text) => ({
    translation: `[Demo] A translation of "${text}" will appear here.`,
    grammar: "Demo mode (MOCK_AI=true): a real grammar explanation appears once you turn the mock off.",
    slang: "",
  }),
  pl: (text) => ({
    translation: `[Demo] Tutaj pojawi się tłumaczenie wersu: „${text}”`,
    grammar: "Tryb demo (MOCK_AI=true): prawdziwe wyjaśnienie gramatyki pojawi się po wyłączeniu mocka.",
    slang: "",
  }),
  es: (text) => ({
    translation: `[Demo] Aquí aparecerá la traducción de: «${text}»`,
    grammar: "Modo demo (MOCK_AI=true): la explicación real de la gramática aparece al desactivar el mock.",
    slang: "",
  }),
};

export function mockExplanation(text: string, target: Language): Explanation {
  const known = MOCK[text.trim()];
  return known?.[target] ?? known?.en ?? GENERIC[target](text.trim());
}
