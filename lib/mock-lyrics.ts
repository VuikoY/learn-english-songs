// lib/mock-lyrics.ts
// Макетні дані для першої версії. Рядки придумані для прикладу (це НЕ справжня пісня),
// а таймкоди — умовні. Пізніше їх замінимо на реальні субтитри (youtube-transcript).

import type { LyricLine } from "./types";

// Офіційне демо-відео YouTube IFrame API. Підстав будь-який свій videoId.
export const DEMO_VIDEO_ID = "M7lc1UVf-VE";

export const MOCK_LYRICS: LyricLine[] = [
  { text: "I've been running late, but I'm almost there", start: 0, duration: 4 },
  { text: "Ain't nobody gonna tell me where to go", start: 4, duration: 4 },
  { text: "If you wanna stay, then you better keep up", start: 8, duration: 4 },
  { text: "'Cause I'm not looking back, I'm already gone", start: 12, duration: 4 },
  { text: "She's been chilling on the rooftop since noon", start: 16, duration: 4 },
  { text: "We were never meant to play it safe", start: 20, duration: 4 },
  { text: "Gimme one more night and I'll be fine", start: 24, duration: 4 },
  { text: "Had I known better, I'd have stayed", start: 28, duration: 4 },
];
