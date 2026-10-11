// lib/game/gameState.ts
// Score, streak, and multiplier logic without React dependencies.

import type { GameAction, GameState, Multiplier } from "@/types/game";

export const BASE_POINTS = 10;

/**
 * The multiplier depends on the current streak:
 *   0–2 -> 1x,   3–5 -> 1.5x,   6 or more (streak > 5) -> 2x
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

/** Reducer that returns the next game state for an action. */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "correct": {
      const streak = state.streak + 1;
      return {
        ...state,
        // Score this answer with the multiplier that was active before it.
        score: state.score + BASE_POINTS * state.multiplier,
        streak,
        maxStreak: Math.max(state.maxStreak, streak),
        multiplier: getMultiplier(streak), // Multiplier for the next word.
        correct: state.correct + 1,
      };
    }

    case "wrong":
      // A mistake resets the streak and multiplier but preserves the score.
      return { ...state, streak: 0, multiplier: 1, mistakes: state.mistakes + 1 };

    case "reset":
      return initialGameState;
  }
}
