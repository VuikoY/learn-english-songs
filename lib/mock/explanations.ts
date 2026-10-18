// lib/mock/explanations.ts
// Sample AI explanations for demo lyrics. Set MOCK_AI=true in .env.local to use them.
// Other lines use a generic placeholder.

import type { Explanation } from "@/lib/types";
import type { Language } from "@/types/game";

type MockMap = Record<string, Partial<Record<Language, Explanation>>>;

const MOCK: MockMap = {
  "I've been running late, but I'm almost there": {
    ru: {
      translation: "Я опаздывал, но уже почти на месте.",
      grammar: "Present Perfect Continuous (have been + -ing): действие началось в прошлом и продолжается до настоящего момента.",
      slang: "",
    },
    en: {
      translation: "I've been late for a while, but I'm nearly at the destination.",
      grammar: "Present perfect continuous (have been + verb-ing): an action that began in the past and is still relevant now.",
      slang: "",
    },
  },
  "Ain't nobody gonna tell me where to go": {
    ru: {
      translation: "Никто не будет указывать мне, куда идти.",
      grammar: "Двойное отрицание (ain't nobody) — нестандартная, но распространённая разговорная конструкция; where to go = вопросительное слово + инфинитив.",
      slang: "ain't — разговорное сокращение от isn't/aren't; gonna = going to.",
    },
    en: {
      translation: "Nobody is going to tell me where to go.",
      grammar: "The double negative (ain't nobody) is non-standard but common in speech; 'where to go' is a wh-word + infinitive.",
      slang: "ain't = isn't/aren't; gonna = going to.",
    },
  },
  "If you wanna stay, then you better keep up": {
    ru: {
      translation: "Если хочешь остаться, лучше не отставай.",
      grammar: "Условное предложение первого типа; you better — сокращение от you had better (тебе лучше бы...).",
      slang: "wanna = want to; keep up = не отставать.",
    },
    en: {
      translation: "If you want to stay, you'd better not fall behind.",
      grammar: "First conditional; 'you better' is short for 'you had better' + base verb.",
      slang: "wanna = want to; keep up = stay at the same pace.",
    },
  },
  "'Cause I'm not looking back, I'm already gone": {
    ru: {
      translation: "Потому что я не оглядываюсь назад — я уже ушёл.",
      grammar: "Отрицательная форма Present Continuous; gone здесь — прилагательное в значении «ушёл, исчез».",
      slang: "'cause — разговорное сокращение от because.",
    },
    en: {
      translation: "Because I'm not looking back; I'm already gone.",
      grammar: "Present continuous negative; 'gone' works as an adjective meaning 'left'.",
      slang: "'cause = because.",
    },
  },
  "She's been chilling on the rooftop since noon": {
    ru: {
      translation: "Она отдыхает на крыше с полудня.",
      grammar: "Present Perfect Continuous + since: действие продолжается с определённого момента в прошлом (since noon).",
      slang: "to chill = расслабляться, отдыхать.",
    },
    en: {
      translation: "She has been relaxing on the rooftop since noon.",
      grammar: "Present perfect continuous + 'since' marks a starting point ('She's' = 'She has' here).",
      slang: "to chill = to relax.",
    },
  },
  "We were never meant to play it safe": {
    ru: {
      translation: "Нам никогда не суждено было играть осторожно.",
      grammar: "Конструкция was/were meant to + инфинитив выражает предназначение; это форма Past Simple Passive.",
      slang: "play it safe = не рисковать (идиома).",
    },
    en: {
      translation: "We were never supposed to take the cautious route.",
      grammar: "'Be meant to' + infinitive expresses intended purpose or destiny.",
      slang: "play it safe = avoid risks (idiom).",
    },
  },
  "Gimme one more night and I'll be fine": {
    ru: {
      translation: "Дай мне ещё одну ночь, и я буду в порядке.",
      grammar: "Повелительное наклонение + and + Future Simple работает как условное предложение: «дай — и всё будет хорошо».",
      slang: "gimme = give me.",
    },
    en: {
      translation: "Give me one more night and I'll be okay.",
      grammar: "Imperative + 'and' + future simple works like a conditional ('If you give me…, I'll be…').",
      slang: "gimme = give me.",
    },
  },
  "Had I known better, I'd have stayed": {
    ru: {
      translation: "Если бы я знал лучше, я бы остался.",
      grammar: "Инверсия в условном предложении третьего типа: Had I known = If I had known; I'd have stayed = I would have stayed.",
      slang: "",
    },
    en: {
      translation: "If I had known better, I would have stayed.",
      grammar: "Inverted third conditional: 'Had I known' replaces 'If I had known' (more formal or literary).",
      slang: "",
    },
  },
};

// Generic fallback for lines not listed in MOCK.
const GENERIC: Record<Language, (text: string) => Explanation> = {
  ru: (text) => ({
    translation: `[Демо] Здесь появится перевод строки: «${text}»`,
    grammar: "Демо-режим (MOCK_AI=true): настоящее объяснение грамматики появится после отключения заглушки.",
    slang: "",
  }),
  uk: (text) => ({
    translation: `[Демо] Тут з’явиться переклад рядка: «${text}»`,
    grammar: "Демо-режим (MOCK_AI=true): справжнє пояснення граматики з’явиться після вимкнення заглушки.",
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
