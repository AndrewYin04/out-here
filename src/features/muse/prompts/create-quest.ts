// Prompt for POST /api/muse/create-quest (fast model): one line from the host ("boba after
// class at 4") becomes a plan draft. The model reports times the way the user said them;
// code resolves them, checks the place id, and clamps every number.
import type { MuseMessage } from '../client';

export type CreateQuestPromptInput = {
  text: string;
  nowLabel: string;
  hostFirstName: string;
  hostInterests: string[];
  /** Real places near the dropped pin; the model may pick one by id or none. */
  places: { placeId: string; name: string; category: string; typicalCost: string; walk: string }[];
  categories: readonly string[];
};

export function createQuestMessages(input: CreateQuestPromptInput): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook\'s Out Here tab. A young adult wants to host a small, real-life plan nearby.',
        'Turn their one line into a plan draft as JSON. They will review and post it themselves.',
        `Current local time (America/Los_Angeles): ${input.nowLabel}.`,
        'Rules:',
        '- title: short and casual, 2-6 words, like a friend would write it ("Boba after class"). No emoji, no hashtags.',
        '- emoji: one emoji that fits the activity.',
        `- category: one of ${input.categories.join(', ')}.`,
        '- description: one or two friendly sentences saying what happens. Do not invent prices, people or rules.',
        '- placeId: the id of the place from the list that fits what they said best, or null when none fits. Never invent a place.',
        '- startClock: 24-hour "HH:MM" local time when they name a time ("at 4" -> "16:00" if it is past 4 AM now). Null otherwise.',
        '- startsInMinutes: "in 20 min" -> 20, "after class" -> 60, "now"/"rn" -> 0. Null otherwise.',
        '- durationMinutes: how long it lasts; null to let the app pick.',
        '- capacity: total spots including the host when they say a number ("me + 3" -> 4); null otherwise.',
        '- priceMax: dollars per person only when they say it, or the chosen place\'s typical cost; 0 for free activities.',
        '- tags: 1-4 lowercase words people might search for.',
        '- bubbleText: a short pop-up line for the map, under 60 characters, inviting people in. May include one emoji.',
        '- pitch: one sentence to the host explaining your choices in plain words (for example why that place). Never mention JSON or field names.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        host: { firstName: input.hostFirstName, interests: input.hostInterests.slice(0, 8) },
        places: input.places,
        text: input.text,
      }),
    },
  ];
}
