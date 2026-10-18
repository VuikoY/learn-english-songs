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

const labels: Record<Language, { genre: string; difficulty: string; artist: string; all: string; genres: Record<SongGenre, string>; difficulties: Record<SongDifficulty, string>; aiHint: string; analyzeError: string }> = {
  ru: {
    genre: "Жанр", difficulty: "Сложность", artist: "Исполнитель", all: "Все", aiHint: "AI оценивает жанр по названию и тексту песни. Сложность — по лексике и структуре строк. Проверьте и при необходимости измените.", analyzeError: "Не удалось определить жанр и сложность автоматически. Выберите их вручную.",
    genres: { pop: "Поп", rock: "Рок", "hip-hop": "Хип-хоп / рэп", "r-and-b": "R&B / соул", electronic: "Электронная / танцевальная", jazz: "Джаз", blues: "Блюз", "country-folk": "Кантри / фолк", "metal-punk": "Метал / панк", "indie-alternative": "Инди / альтернатива", "reggae-ska": "Регги / ска", latin: "Латинская", classical: "Классическая", soundtrack: "Саундтрек / мюзикл", gospel: "Госпел / религиозная", world: "Музыка народов мира", other: "Другое" },
    difficulties: { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" },
  },
  uk: {
    genre: "Жанр", difficulty: "Складність", artist: "Виконавець", all: "Усі", aiHint: "AI оцінює жанр за назвою й текстом пісні, а складність — за лексикою та структурою рядків. Перевірте й за потреби змініть.", analyzeError: "Не вдалося автоматично визначити жанр і складність. Оберіть їх вручну.",
    genres: { pop: "Поп", rock: "Рок", "hip-hop": "Хіп-хоп / реп", "r-and-b": "R&B / соул", electronic: "Електронна / танцювальна", jazz: "Джаз", blues: "Блюз", "country-folk": "Кантрі / фолк", "metal-punk": "Метал / панк", "indie-alternative": "Інді / альтернатива", "reggae-ska": "Реггі / ска", latin: "Латинська", classical: "Класична", soundtrack: "Саундтрек / мюзикл", gospel: "Госпел / релігійна", world: "Музика світу", other: "Інше" },
    difficulties: { beginner: "Початковий", intermediate: "Середній", advanced: "Просунутий" },
  },
  en: {
    genre: "Genre", difficulty: "Difficulty", artist: "Artist", all: "All", aiHint: "AI estimates genre from the title and lyrics, and difficulty from vocabulary and line structure. Review and adjust if needed.", analyzeError: "Could not determine genre and difficulty automatically. Choose them manually.",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Electronic / dance", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternative", "reggae-ska": "Reggae / ska", latin: "Latin", classical: "Classical", soundtrack: "Soundtrack / musical", gospel: "Gospel / worship", world: "World music", other: "Other" },
    difficulties: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
  },
  pl: {
    genre: "Gatunek", difficulty: "Poziom trudności", artist: "Wykonawca", all: "Wszystkie", aiHint: "AI szacuje gatunek na podstawie tytułu i tekstu, a trudność na podstawie słownictwa i struktury wersów. Sprawdź i w razie potrzeby zmień.", analyzeError: "Nie udało się automatycznie określić gatunku i poziomu. Wybierz je ręcznie.",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Elektroniczna / taneczna", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternatywa", "reggae-ska": "Reggae / ska", latin: "Latynoska", classical: "Klasyczna", soundtrack: "Ścieżka dźwiękowa / musical", gospel: "Gospel / religijna", world: "Muzyka świata", other: "Inny" },
    difficulties: { beginner: "Początkujący", intermediate: "Średnio zaawansowany", advanced: "Zaawansowany" },
  },
  es: {
    genre: "Género", difficulty: "Dificultad", artist: "Artista", all: "Todos", aiHint: "La IA estima el género a partir del título y la letra, y la dificultad según el vocabulario y la estructura de los versos. Revisa y cambia si hace falta.", analyzeError: "No se pudo determinar automáticamente el género y la dificultad. Elígelos manualmente.",
    genres: { pop: "Pop", rock: "Rock", "hip-hop": "Hip-hop / rap", "r-and-b": "R&B / soul", electronic: "Electrónica / baile", jazz: "Jazz", blues: "Blues", "country-folk": "Country / folk", "metal-punk": "Metal / punk", "indie-alternative": "Indie / alternativa", "reggae-ska": "Reggae / ska", latin: "Latina", classical: "Clásica", soundtrack: "Banda sonora / musical", gospel: "Góspel / religiosa", world: "Músicas del mundo", other: "Otro" },
    difficulties: { beginner: "Inicial", intermediate: "Intermedio", advanced: "Avanzado" },
  },
};

export function songMetadataLabels(language: Language) {
  return labels[language];
}
