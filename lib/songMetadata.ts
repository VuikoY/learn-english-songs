import type { Language } from "@/types/game";

export const SONG_GENRES = [
  "pop", "rock", "hip-hop", "r-and-b", "electronic", "jazz", "blues",
  "country-folk", "metal-punk", "indie-alternative", "reggae-ska", "latin",
  "classical", "soundtrack", "gospel", "world", "other",
] as const;
export type SongGenre = (typeof SONG_GENRES)[number];
export const SONG_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type SongDifficulty = (typeof SONG_DIFFICULTIES)[number];

export function isSongGenre(value: unknown): value is SongGenre {
  return typeof value === "string" && (SONG_GENRES as readonly string[]).includes(value);
}

export function isSongDifficulty(value: unknown): value is SongDifficulty {
  return typeof value === "string" && (SONG_DIFFICULTIES as readonly string[]).includes(value);
}

const labels: Record<Language, { genre: string; difficulty: string; all: string; genres: Record<SongGenre, string>; difficulties: Record<SongDifficulty, string> }> = {
  ru: {
    genre: "Жанр", difficulty: "Сложность", all: "Все",
    genres: { pop: "Поп", rock: "Рок", "hip-hop": "Хип-хоп / рэп", "r-and-b": "R&B / соул", electronic: "Электронная / танцевальная", jazz: "Джаз", blues: "Блюз", "country-folk": "Кантри / фолк", "metal-punk": "Метал / панк", "indie-alternative": "Инди / альтернатива", "reggae-ska": "Регги / ска", latin: "Латинская", classical: "Классическая", soundtrack: "Саундтрек / мюзикл", gospel: "Госпел / религиозная", world: "Музыка народов мира", other: "Другое" },
    difficulties: { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" },
  },
  uk: {
    genre: "Жанр", difficulty: "Складність", all: "Усі",
    genres: { pop: "Поп", rock: "Рок", "hip-hop": "Хіп-хоп / реп", "r-and-b": "R&B / соул", electronic: "Електронна / танцювальна", jazz: "Джаз", blues: "Блюз", "country-folk": "Кантрі / фолк", "metal-punk": "Метал / панк", "indie-alternative": "Інді / альтернатива", "reggae-ska": "Реггі / ска", latin: "Латинська", classical: "Класична", soundtrack: "Саундтрек / мюзикл", gospel: "Госпел / релігійна", world: "Музика світу", other: "Інше" },
    difficulties: { beginner: "Початковий", intermediate: "Середній", advanced: "Просунутий" },
  },
  en: {
    genre: "Genre", difficulty: "Difficulty", all: "All",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Electronic / dance", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternative", "reggae-ska": "Reggae / ska", latin: "Latin", classical: "Classical", soundtrack: "Soundtrack / musical", gospel: "Gospel / worship", world: "World music", other: "Other" },
    difficulties: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
  },
  pl: {
    genre: "Gatunek", difficulty: "Poziom trudności", all: "Wszystkie",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Elektroniczna / taneczna", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternatywa", "reggae-ska": "Reggae / ska", latin: "Latynoska", classical: "Klasyczna", soundtrack: "Ścieżka dźwiękowa / musical", gospel: "Gospel / religijna", world: "Muzyka świata", other: "Inny" },
    difficulties: { beginner: "Początkujący", intermediate: "Średnio zaawansowany", advanced: "Zaawansowany" },
  },
  es: {
    genre: "Género", difficulty: "Dificultad", all: "Todos",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Electrónica / baile", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternativa", "reggae-ska": "Reggae / ska", latin: "Latina", classical: "Clásica", soundtrack: "Banda sonora / musical", gospel: "Góspel / religiosa", world: "Músicas del mundo", other: "Otro" },
    difficulties: { beginner: "Inicial", intermediate: "Intermedio", advanced: "Avanzado" },
  },
};

export function songMetadataLabels(language: Language) {
  return labels[language];
}
