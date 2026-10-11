// lib/game/gameState.ts
// Очки, серія (streak) і множник. Чиста логіка без React — легко тестувати.

import type { GameAction, GameState, Multiplier } from "@/types/game";

export const BASE_POINTS = 10;

/**
 * Множник залежить від серії правильних відповідей поспіль:
 *   0–2 -> 1x,   3–5 -> 1.5x,   6 і більше (streak > 5) -> 2x
 */
export function getMultiplier(streak: number): Multiplier {
  if (streak > 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

export const initialGameState: GameState = {
  score: 0,
  streak: 0,
  maxStreak: 0,
  multiplier: 1,
  correct: 0,
  mistakes: 0,
};

/** Reducer для useReducer: приймає поточний стан і дію, повертає новий стан. */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "correct": {
      const streak = state.streak + 1;
      return {
        ...state,
        // Очки рахуємо з множником, який діяв ДО цього слова: +10 * multiplier
        score: state.score + BASE_POINTS * state.multiplier,
        streak,
        maxStreak: Math.max(state.maxStreak, streak),
        multiplier: getMultiplier(streak), // множник для НАСТУПНОГО слова
        correct: state.correct + 1,
      };
    }

    case "wrong":
      // Помилка: серія і множник скидаються, очки лишаються
      return { ...state, streak: 0, multiplier: 1, mistakes: state.mistakes + 1 };

    case "reset":
      return initialGameState;
  }
}
