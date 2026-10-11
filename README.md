# Supabase — відкладено на фінальний етап
Усі файли тут тимчасово НЕ використовуються. Коли дійдемо до бази:
1. Повернути їх на ті самі шляхи (без префікса `_supabase-later/`).
2. Виконати `supabase/schema.sql` і `supabase/schema_cache.sql`.
3. Замінити `lib/storage/vocabulary.ts` на реалізацію з Supabase (той самий інтерфейс).
Поля `VocabularyItem` у lib/types.ts вже названі як колонки таблиці `vocabulary`.
