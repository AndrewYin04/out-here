// Prompt for step 1 (parseIntent, fast model). The model reports what the user said about
// time as clock strings and minute counts; code resolves them into the ISO window.
import type { MuseMessage } from '../client';

export function parsePrompt(input: { text: string; nowLabel: string }): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You read one short "I\'m free" message from a young adult and extract their plan intent as JSON.',
        `Current local time (America/Los_Angeles): ${input.nowLabel}.`,
        'Rules:',
        '- understood: false only when the message has no recognizable plan, time, budget or activity (keyboard mash, random words).',
        '- activities: short lowercase words for what they want: "food" for hungry/eat/lunch/dinner/snack, plus any named dish or cuisine ("dumplings", "ramen", "boba", "tacos"); "music" for bands/shows/concerts; "climbing", "volleyball", "board games", "games", "thrifting", "study", "art", "outdoors", "running", "film photography". Empty list when they are open to anything. Never add "meet people" as an activity.',
        '- budgetMax: dollars per person when they say "$15", "under 15", "cheap" (use 15), "free"/"no money" meaning cost (use 0). Null otherwise. "I\'m free" is about time, not cost.',
        '- durationMinutes: how long they have ("40 min" -> 40, "an hour" -> 60, "next 2 hours" -> 120, "30 min before class" -> 30, "rn"/"right now" with no length -> 60). Null when not said.',
        '- startsInMinutes: "in 20 min" -> 20, "after class" -> 60. Null otherwise.',
        '- startClock / endClock: 24-hour "HH:MM" local time. "before 7" -> endClock "19:00" if it is afternoon now; "till 6" -> endClock "18:00"; "after 5" -> startClock "17:00"; "after work" -> startClock "17:00". Null when not said.',
        '- partOfDay: "now" for rn/right now, "afternoon", "evening", "tonight", or null.',
        '- maxWalkMinutes: only when they state a walking limit ("ok walking 30 min" -> 30, "nothing far" -> 10). Null otherwise.',
        '- wantsFriends: true unless they say they want to go alone or only with strangers.',
        '- openToNewPeople: true unless they say friends only.',
        '- vibe: one word like "chill", "loud", "low-key", "quiet", or null.',
        'Do not invent places, people or prices.',
      ].join('\n'),
    },
    { role: 'user', content: input.text },
  ];
}
