// lib/game/gameState.ts
// Learning progress reducer without React dependencies.

import type { GameAction, GameState } from "@/types/game";

export const initialGameState: GameState = {
  wordsCompleted: 0,
  completedWordKeys: [],
  correct: 0,
  mistakes: 0,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "correct":
      return {
        ...state,
        wordsCompleted: state.completedWordKeys.includes(action.wordKey)
          ? state.wordsCompleted
          : state.wordsCompleted + 1,
        completedWordKeys: state.completedWordKeys.includes(action.wordKey)
          ? state.completedWordKeys
          : [...state.completedWordKeys, action.wordKey],
        correct: state.correct + 1,
      };
    case "revealed":
      return {
        ...state,
        wordsCompleted: state.completedWordKeys.includes(action.wordKey)
          ? state.wordsCompleted
          : state.wordsCompleted + 1,
        completedWordKeys: state.completedWordKeys.includes(action.wordKey)
          ? state.completedWordKeys
          : [...state.completedWordKeys, action.wordKey],
      };
    case "wrong":
      return { ...state, mistakes: state.mistakes + 1 };
    case "reset":
      return initialGameState;
  }
}
