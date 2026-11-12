// Generates supabase/seed-content.json with Muse Ember (muse-ember-1.0).
// The outline below (handles, circles, groups, counts, images, times) is fixed in
// code; Muse fills only the text. Each batch's raw response is cached under
// .cache/muse/content/ keyed by a sha256 of the request, so a re-run never re-bills.
// Run: npm run gen:content   (node --env-file=.env.local scripts/gen-content.mjs)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- deterministic randomness ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLACES = [
  "Dumpling Den", "Noodle Theory", "Kaiten Bay", "Bobalicious Corner", "Hacker Way Courts",
  "Willow Thrift Co.", "Bayfront Park Overlook", "Belle Haven Library Study Room", "The Signal Room",
  "Gallery 1600", "Boulder Bay Gym", "Pho Saigon Willow", "Taco Trucks on Willow Rd", "Pixel Arcade",
  "Bay Trail Start (Bayfront)", "Ravenswood Board Game Cafe", "Menlo Film Lab", "El Camino Coffee Works",
];

// ---------- people outline ----------
// [handle, name, pronouns, age, currentCity, circles, interests, budgetMax, look (portrait), role hint, hometown|null]
const MP = "Menlo Park, CA", PA = "Palo Alto, CA", RC = "Redwood City, CA", EPA = "East Palo Alto, CA", ST = "Stanford, CA";
const P = [
  // demo personas
  ["alex", "Alex Rivera", "he/him", 23, MP, ["college", "coworkers", "hometown-alex"], ["dumplings", "local bands", "trying new food", "running"], 15, "Mexican-American man with short dark curly hair and round glasses, plain gray hoodie", "junior product analyst at a small health-tech startup in Menlo Park, started 3 weeks ago, moved from San Diego, knows almost nobody locally", "Sacramento, CA"],
  ["maya", "Maya Chen", "she/her", 23, RC, ["college", "maya-roommates"], ["dumplings", "local bands", "yoga", "houseplants"], 18, "Chinese-American woman with long black hair in a claw clip, oversized cream cardigan", "Alex's best friend from college, just moved to Redwood City for a UX research job, off work at 5:15 and usually free until 6", null],
  ["jordan", "Jordan Brooks", "they/them", 24, RC, ["local-shows", "maya-roommates"], ["indie music", "local bands", "vinyl", "thrifting"], 20, "Black nonbinary person with short twists and a faded thrifted band tee", "freelance graphic designer who makes gig posters, Maya's new roommate", null],
  ["priya", "Priya Natarajan", "she/her", 25, ST, ["stanford-grad"], ["film photography", "boba", "hiking", "museums"], 15, "South Asian woman with shoulder-length wavy hair and a corduroy jacket, film camera strap", "Stanford PhD student in civil engineering", null],
  ["sam", "Sam Okafor", "he/him", 22, MP, ["volleyball"], ["volleyball", "board games", "basketball"], 12, "Nigerian-American man, tall, close-cropped hair, athletic quarter-zip", "software engineering intern on the Peninsula for the fall", null],
  ["leo", "Leo Marchetti", "he/him", 24, MP, ["thrift"], ["thrifting", "film photography", "vintage denim"], 25, "Italian-American man with a mustache and messy brown hair, vintage denim jacket", "line cook who resells vintage clothes on the side", null],
  ["nina", "Nina Park", "she/her", 22, PA, ["board-games"], ["boba", "K-food", "board games", "sketching"], 12, "Korean-American woman with a short bob and bangs, striped long-sleeve shirt", "barista at a cafe in Palo Alto", null],
  ["kai", "Kai Nakamura", "he/him", 24, MP, ["coworkers", "climbing-gym"], ["climbing", "ramen", "camping"], 20, "Japanese-American man with a buzz cut and a fleece vest", "Alex's new coworker, backend engineer, climbs most evenings", null],
  // college (UC San Diego), mostly not local
  ["devon", "Devon Hayes", "he/him", 23, "Seattle, WA", ["college"], ["hiking", "coffee"], 20, "white man with a short red beard and a flannel shirt", "environmental consultant", null],
  ["sofia", "Sofia Alvarez", "she/her", 23, "Los Angeles, CA", ["college"], ["dance", "tacos"], 20, "Latina woman with long wavy brown hair and hoop earrings", "elementary school teacher", null],
  ["marcus", "Marcus Bell", "he/him", 24, "Chicago, IL", ["college"], ["basketball", "sneakers"], 25, "Black man with a fade haircut and a varsity jacket", "financial analyst", null],
  ["hannah", "Hannah Lindqvist", "she/her", 23, "Portland, OR", ["college"], ["houseplants", "thrifting"], 15, "white woman with freckles and a blonde braid, knit sweater", "plant shop manager", null],
  ["tariq", "Tariq Haddad", "he/him", 23, "San Diego, CA", ["college"], ["surfing", "photography"], 20, "Arab-American man with wavy black hair and a light stubble, linen shirt", "lab tech who surfs at dawn", null],
  ["emily", "Emily Tran", "she/her", 22, "Austin, TX", ["college"], ["pho", "concerts"], 20, "Vietnamese-American woman with long straight hair and a denim shirt", "marketing coordinator", null],
  ["ben", "Ben Goldstein", "he/him", 23, "New York, NY", ["college"], ["stand-up comedy", "bagels"], 25, "white man with curly brown hair and a navy crewneck", "paralegal doing open mics", null],
  ["aisha", "Aisha Mohammed", "she/her", 23, "Minneapolis, MN", ["college"], ["poetry", "baking"], 15, "Somali-American woman wearing a mustard hijab and a warm smile", "public health grad student", null],
  ["ryan", "Ryan Kealoha", "he/him", 24, "Honolulu, HI", ["college"], ["surfing", "ukulele"], 20, "Native Hawaiian man with shoulder-length hair and an aloha shirt", "marine biology tech", null],
  ["chloe", "Chloe Dubois", "she/her", 23, "Denver, CO", ["college"], ["skiing", "craft fairs"], 20, "white woman with brown bangs and a puffer vest", "nurse", null],
  ["isaac", "Isaac Mensah", "he/him", 23, PA, ["college", "board-games"], ["board games", "chess", "dumplings"], 15, "Ghanaian-American man with short locs and a green bomber jacket", "data engineer, the one college friend who also ended up on the Peninsula but works long hours", null],
  ["lena", "Lena Kowalski", "she/her", 22, "Mountain View, CA", ["college"], ["baking", "cycling"], 15, "Polish-American woman with a light brown ponytail and a rain jacket", "QA engineer", null],
  // hometown (Sacramento)
  ["jess", "Jess Thompson", "she/her", 23, "Sacramento, CA", ["hometown-alex"], ["softball", "country music"], 15, "white woman with a high blonde ponytail and a softball tee", "dental assistant", "Sacramento, CA"],
  ["andre", "Andre Washington", "he/him", 23, "Sacramento, CA", ["hometown-alex"], ["cars", "basketball"], 15, "Black man with a short beard and a backwards cap", "auto parts store manager", "Sacramento, CA"],
  ["kayla", "Kayla Nguyen", "she/her", 22, "Davis, CA", ["hometown-alex"], ["boba", "nursing school"], 12, "Vietnamese-American woman with a messy bun and scrubs", "nursing student", "Sacramento, CA"],
  ["tyler", "Tyler Brennan", "he/him", 24, "Sacramento, CA", ["hometown-alex"], ["fishing", "BBQ"], 20, "white man with a trucker cap and a sun-tanned face", "electrician apprentice", "Sacramento, CA"],
  ["gabby", "Gabriela Ortiz", "she/her", 23, "Sacramento, CA", ["hometown-alex"], ["makeup", "taquerias"], 15, "Mexican-American woman with long dark hair and gold earrings", "hair stylist", "Sacramento, CA"],
  ["josh", "Josh Patel", "he/him", 23, "Sacramento, CA", ["hometown-alex"], ["fantasy football", "golf"], 25, "Indian-American man with neat short hair and a polo shirt", "accountant", "Sacramento, CA"],
  ["mia", "Mia Fernandez", "she/her", 21, "Reno, NV", ["hometown-alex"], ["rock climbing", "true crime podcasts"], 12, "Filipino-Mexican woman with a long braid and a college hoodie", "senior in college", "Sacramento, CA"],
  ["nate", "Nate Sullivan", "he/him", 23, "Sacramento, CA", ["hometown-alex"], ["weightlifting", "camping"], 15, "white man with a crew cut and a station T-shirt", "firefighter trainee", "Sacramento, CA"],
  ["diego", "Diego Morales", "he/him", 23, "Sacramento, CA", ["hometown-alex"], ["soccer", "lowriders"], 15, "Mexican-American man with a fade and a soccer jersey", "mechanic at his uncle's shop", "Sacramento, CA"],
  // coworkers
  ["olivia", "Olivia Grant", "she/her", 26, PA, ["coworkers"], ["running", "brunch"], 25, "Black woman with long box braids and a blazer over a tee", "Alex's team lead", null],
  ["ethan", "Ethan Wu", "he/him", 24, MP, ["coworkers"], ["video games", "Smash Bros", "ramen"], 15, "Chinese-American man with an undercut and a graphic tee", "frontend engineer", null],
  ["rosa", "Rosa Delgado", "she/her", 25, EPA, ["coworkers"], ["salsa dancing", "pho"], 15, "Mexican-American woman with curly hair pulled back and red lipstick", "customer success lead", null],
  ["liam", "Liam O'Connor", "he/him", 25, RC, ["coworkers"], ["cycling", "running"], 20, "Irish-American man with ginger hair and a cycling jersey", "data scientist", null],
  ["zara", "Zara Ahmed", "she/her", 24, MP, ["coworkers", "board-games"], ["boba", "sketching", "board games"], 15, "Pakistani-American woman with long dark hair and a sage-green sweater", "product designer", null],
  // Maya's roommates
  ["tess", "Tess Morgan", "she/her", 24, RC, ["maya-roommates"], ["pilates", "brunch"], 20, "white woman with a brunette lob and a fleece pullover", "ER nurse on night shifts", null],
  ["yuki", "Yuki Sato", "she/her", 23, RC, ["maya-roommates"], ["anime", "ramen", "sushi"], 30, "Japanese woman with dyed lavender hair and a big cardigan", "illustrator", null],
  // climbing gym
  ["marco", "Marco Alencar", "he/him", 25, RC, ["climbing-gym"], ["climbing", "cooking"], 20, "Brazilian man with curly black hair and a tank top, chalky hands", "physical therapy aide", null],
  ["ava", "Ava Kim", "she/her", 22, PA, ["climbing-gym"], ["climbing", "K-food"], 15, "Korean-American woman with a high ponytail and a sports bra under an open flannel", "lab assistant", null],
  ["dante", "Dante Russo", "he/him", 26, MP, ["climbing-gym"], ["climbing", "trail running"], 20, "Italian-American man with a dark beard and a beanie", "route setter at a climbing gym", null],
  ["fatima", "Fatima Rahman", "she/her", 24, MP, ["climbing-gym"], ["climbing", "chai", "reading"], 15, "Bangladeshi-American woman with a black headscarf and a climbing harness", "pharmacist", null],
  ["owen", "Owen Price", "he/him", 21, ST, ["climbing-gym"], ["climbing", "camping"], 10, "white man with shaggy blond hair and a Patagonia-style fleece without logos", "Stanford undergrad", null],
  // local shows
  ["riley", "Riley Novak", "she/her", 23, PA, ["local-shows"], ["indie music", "bass guitar", "local bands"], 15, "white woman with a pink mullet and silver rings", "bassist in a small band, works at a bookstore", null],
  ["jamal", "Jamal Carter", "he/him", 25, EPA, ["local-shows"], ["DJing", "hip hop", "local bands"], 20, "Black man with a short beard and over-ear headphones around his neck", "DJ and audio tech", null],
  ["sage", "Sage Whitfield", "they/them", 20, RC, ["local-shows"], ["zines", "punk shows", "film photography"], 10, "white nonbinary person with a shaved head and lots of patches on a jacket", "community college student who makes zines", null],
  ["noah", "Noah Brandt", "he/him", 24, MP, ["local-shows"], ["drums", "local bands", "tacos"], 15, "white man with wire glasses and a corduroy shirt", "drummer and middle school music teacher", null],
  ["luna", "Luna Reyes", "she/her", 21, EPA, ["local-shows"], ["singing", "open mics", "boba"], 10, "Salvadoran-American woman with long curly hair and a velvet scrunchie", "singer, works at a grocery store", null],
  // volleyball
  ["grace", "Grace Liu", "she/her", 23, MP, ["volleyball", "thrift"], ["volleyball", "thrifting"], 15, "Taiwanese-American woman with a sporty ponytail and a vintage windbreaker", "lab researcher", null],
  ["mateo", "Mateo Herrera", "he/him", 24, RC, ["volleyball"], ["volleyball", "soccer", "tacos"], 15, "Colombian-American man with a curly top and a soccer warm-up jacket", "civil engineer", null],
  ["kiana", "Kiana Akana", "she/her", 20, PA, ["volleyball"], ["volleyball", "beach days"], 10, "Native Hawaiian and Filipina woman with long dark hair and a sun visor", "college sophomore", null],
  ["will", "Will Hartley", "he/him", 25, MP, ["volleyball"], ["volleyball", "craft beer"], 20, "white man with short sandy hair and a sleeveless shirt", "sales engineer", null],
  // thrift
  ["ivy", "Ivy Larsen", "she/her", 22, RC, ["thrift"], ["thrifting", "sewing"], 12, "white woman with copper curls and a patchwork vest she sewed", "costume shop assistant", null],
  ["bea", "Bea Santos", "she/her", 23, EPA, ["thrift"], ["thrifting", "vintage", "karaoke"], 12, "Filipina woman with a sleek bob and a 90s slip dress over a tee", "pharmacy tech", null],
  ["rafael", "Rafael Mendes", "he/him", 24, MP, ["thrift"], ["thrifting", "sneakers"], 20, "Afro-Brazilian man with a high-top fade and a vintage track jacket", "warehouse supervisor who resells sneakers", null],
  ["june", "June Holloway", "she/her", 21, PA, ["thrift"], ["film photography", "thrifting"], 10, "Black woman with a curly afro and a film camera around her neck", "art student", null],
  // board games
  ["arjun", "Arjun Mehta", "he/him", 25, PA, ["board-games"], ["board games", "cricket"], 20, "Indian-American man with a trimmed beard and a cozy quarter-zip", "hardware engineer", null],
  ["elle", "Elle Fischer", "she/her", 24, MP, ["board-games"], ["board games", "baking"], 15, "German-American woman with wire glasses and a brown braid", "librarian", null],
  ["tomas", "Tomás Vega", "he/him", 19, EPA, ["board-games"], ["board games", "Smash Bros"], 8, "Guatemalan-American teen with a short fade and a hoodie", "community college student who works at a bike shop", null],
  ["hana", "Hana Yoshida", "she/her", 23, RC, ["board-games"], ["board games", "K-food", "cooking"], 15, "Japanese-American woman with a half-up bun and an apron", "pastry cook", null],
  // stanford grad
  ["daniel", "Daniel Osei", "he/him", 26, ST, ["stanford-grad"], ["running", "jazz"], 15, "Ghanaian man with glasses and a crisp button-down", "biology PhD student", null],
  ["mei", "Mei Lin", "she/her", 25, ST, ["stanford-grad"], ["studying in cafes", "boba"], 12, "Chinese woman with a long ponytail and a turtleneck", "education master's student", null],
  ["felix", "Felix Wagner", "he/him", 25, ST, ["stanford-grad"], ["cycling", "film photography"], 15, "German man with blond undercut and a rain shell", "international mechanical engineering PhD student", null],
  ["noor", "Noor Farouk", "she/her", 24, ST, ["stanford-grad"], ["museums", "poetry", "pho"], 15, "Egyptian-American woman with dark wavy hair and gold hoops", "public policy master's student", null],
];

export const DEMO = ["alex", "maya", "jordan", "priya", "sam", "leo", "nina", "kai"];
export const PEOPLE = P.map(([handle, name, pronouns, age, currentCity, circles, interests, budgetMax, look, role, hometown]) => ({
  handle, name, pronouns, age, currentCity, circles, interests, budgetMax, look, role, hometown,
  isDemoUser: DEMO.includes(handle),
  local: /Menlo Park|Palo Alto|Redwood City|Stanford|Mountain View/.test(currentCity),
}));
export const byHandle = Object.fromEntries(PEOPLE.map((p) => [p.handle, p]));

// ---------- groups outline ----------
// keywords: a local person whose interests contain one of these joins the group
const G = [
  ["cheap-eats-south-bay", "Cheap Eats South Bay", "public", ["food"], ["dumplings", "tacos", "pho", "ramen", "K-food", "trying new food", "taquerias"], ["alex", "maya", "nina", "isaac", "ethan", "rosa", "yuki", "noah"], "a cheap-eats food group; the regulars rave about Dumpling Den and the Taco Trucks on Willow Rd", "an overhead phone photo of a table crowded with cheap takeout dumplings, tacos and noodle bowls on a picnic table"],
  ["menlo-park-new-grads", "Menlo Park New Grads", "public", ["social"], [], ["alex", "kai", "ethan", "zara", "sam", "grace", "will", "liam", "fatima", "elle", "noah", "isaac", "lena"], "for people who just graduated and just moved to the Menlo Park area for work, trying to make friends", "a casual photo of a group of young adults walking on a tree-lined suburban street at golden hour, seen from behind"],
  ["bay-area-local-shows", "Bay Area Local Shows", "public", ["music"], ["local bands", "indie music", "punk shows", "hip hop", "open mics", "drums", "singing", "bass guitar", "DJing"], ["alex", "maya"], "shows at small venues, most of all The Signal Room", "a small dim music venue stage with warm lights and a band's silhouettes, crowd from behind"],
  ["pickup-volleyball-peninsula", "Pickup Volleyball Peninsula", "public", ["sports"], ["volleyball", "beach days"], [], "pickup volleyball, usually at Hacker Way Courts", "an outdoor sand volleyball court at sunset with a net and a ball mid-air"],
  ["peninsula-thrift-walks", "Peninsula Thrift Walks", "public", ["thrift"], ["thrifting", "vintage", "vintage denim", "sewing"], ["jordan"], "group thrift walks, Willow Thrift Co. is the home base", "racks of colorful secondhand clothes in a bright thrift store aisle"],
  ["film-photo-walks-bay", "Film Photo Walks Bay", "public", ["art"], ["film photography", "photography"], [], "film photo walks and developing at Menlo Film Lab", "a hand holding a vintage 35mm film camera in front of bay marshland"],
  ["peninsula-board-game-night", "Peninsula Board Game Night", "public", ["games"], ["board games", "chess"], ["sam", "ethan"], "weekly game nights at Ravenswood Board Game Cafe", "a wooden table covered with a colorful board game, cards and dice, hands reaching in"],
  ["boulder-buddies-bay", "Boulder Buddies Bay", "private", ["sports"], ["climbing", "rock climbing"], [], "partners for bouldering at Boulder Bay Gym, beginners welcome", "an indoor bouldering wall with colorful holds and a crash pad, chalk dust in the air"],
  ["boba-and-sketch", "Boba and Sketch", "public", ["art", "food"], ["boba", "sketching"], ["june", "sage"], "sketchbooks plus boba at Bobalicious Corner", "two boba teas next to open sketchbooks and pens on a cafe table"],
  ["stanford-grad-socials", "Stanford Grad Socials", "private", ["social"], [], ["priya", "daniel", "mei", "felix", "noor", "owen"], "grad students getting out of the lab: mixers, Gallery 1600 nights, study sprints", "a sunny university courtyard with sandstone arches and students on the grass, no signage"],
  ["k-food-crew", "K-Food Crew", "public", ["food"], ["K-food"], ["maya", "yuki", "ethan"], "Korean food lovers: home cooking, potlucks, banchan swaps", "a home table with bubbling tteokbokki, kimbap and small banchan dishes"],
  ["sunset-runners-bayfront", "Sunset Runners Bayfront", "public", ["outdoors"], ["running", "trail running", "cycling"], ["daniel"], "easy social runs from the Bay Trail Start at Bayfront Park", "runners on a flat gravel bay trail at sunset with marsh and water"],
];
export const GROUPS = G.map(([slug, name, privacy, tags, keywords, extras, about, coverHint]) => {
  const set = new Set(extras);
  for (const p of PEOPLE) if (p.local && p.interests.some((i) => keywords.includes(i))) set.add(p.handle);
  const memberHandles = PEOPLE.map((p) => p.handle).filter((h) => set.has(h));
  return { slug, name, privacy, tags, about, coverHint, memberHandles };
});
export const groupBySlug = Object.fromEntries(GROUPS.map((g) => [g.slug, g]));

// ---------- fixed story beats for posts ----------
// [author, target group slug | null, hint, image?, comments, audience]
const BEATS = [
  ["alex", null, "3 weeks into the new job in Menlo Park, still doesn't know anyone outside work, asks for recs on how people make friends here", false, 5, "public"],
  ["alex", null, "first solo walk out to the Bayfront Park Overlook, pretty, a little lonely", true, 2, "public"],
  ["alex", null, "apartment still has a mattress on the floor and one chair; Marketplace hunting", false, 2, "friends"],
  ["alex", null, "misses the college group chat energy, everyone is in a different city now", false, 3, "friends"],
  ["alex", null, "tried Dumpling Den alone at lunch and it was great, needs dumpling friends", true, 3, "public"],
  ["alex", null, "first run on the Bay Trail, saw pelicans, legs dead", true, 1, "public"],
  ["alex", null, "coworkers took him to the taco trucks on Willow Rd, small win", false, 1, "public"],
  ["alex", null, "heard The Signal Room has local shows, asks if anyone goes", false, 2, "public"],
  ["maya", null, "officially moved to Redwood City, boxes everywhere", true, 4, "public"],
  ["maya", null, "new roommates are the best, house dinner night", true, 2, "friends"],
  ["maya", null, "she and Alex live 15 minutes apart again after a year of FaceTime", false, 3, "friends"],
  ["maya", null, "new job: off at 5:15 and free till 6 most days, wants short after-work plans", false, 2, "public"],
  ["maya", null, "still unpacking, found her college show wristbands", false, 1, "public"],
  ["alex", "cheap-eats-south-bay", "new here: is Dumpling Den worth it for under $15? what to order", false, 4, "public"],
  ["nina", "cheap-eats-south-bay", "Dumpling Den pork and chive dumplings review, 12 for about $12", true, 3, "public"],
  ["isaac", "cheap-eats-south-bay", "Pho Saigon Willow on a cold night, huge bowl, cheap", true, 1, "public"],
  ["noah", "cheap-eats-south-bay", "ranking the Taco Trucks on Willow Rd", false, 2, "public"],
  ["yuki", "cheap-eats-south-bay", "Noodle Theory ramen is great but a long walk from downtown", false, 1, "public"],
  ["ethan", "cheap-eats-south-bay", "Kaiten Bay conveyor sushi is fun but not cheap, went over $25", false, 1, "public"],
  ["jordan", "bay-area-local-shows", "made the poster for this weekend's indie night at The Signal Room", true, 3, "public"],
  ["riley", "bay-area-local-shows", "her band plays The Signal Room soon, first headline set", false, 2, "public"],
  ["maya", "bay-area-local-shows", "just moved here, which local bands should she see first", false, 3, "public"],
  ["jamal", "bay-area-local-shows", "DJing the after set at The Signal Room, sound check photo", true, 1, "public"],
  ["sam", "pickup-volleyball-peninsula", "need one more for pickup at Hacker Way Courts tonight", false, 2, "public"],
  ["leo", "peninsula-thrift-walks", "haul from Willow Thrift Co.: a $6 wool coat", true, 2, "public"],
  ["june", "film-photo-walks-bay", "first roll back from Menlo Film Lab, the bay at dusk", true, 2, "public"],
  ["arjun", "peninsula-board-game-night", "game night at Ravenswood Board Game Cafe, new people welcome", true, 2, "public"],
  ["kai", "boulder-buddies-bay", "beginner bouldering intro at Boulder Bay Gym, can lend shoes", false, 2, "public"],
  ["zara", "boba-and-sketch", "sketch from Bobalicious Corner today", true, 2, "public"],
  ["priya", "stanford-grad-socials", "Gallery 1600 night was good, more mixers please", true, 1, "public"],
  ["olivia", "sunset-runners-bayfront", "easy 5K from the Bay Trail Start, everyone welcome, no one gets dropped", true, 2, "public"],
  ["zara", "menlo-park-new-grads", "moved here 4 months ago, it gets easier, here is what helped", false, 3, "public"],
];

const GROUP_HINTS = {
  "cheap-eats-south-bay": ["best cheap lunch under $10", "late-night food after 10pm", "a hidden-gem food truck question", "cheap date-night spot ideas", "a meal-prep fail"],
  "menlo-park-new-grads": ["anyone want to explore Palo Alto this weekend", "how to meet people outside work", "Caltrain commute tips", "apartment hunting in Redwood City", "trivia team looking for members", "first paycheck adulting moment"],
  "bay-area-local-shows": ["who is going to the next show at The Signal Room", "a band recommendation", "lost a jacket at last night's show", "looking for a show buddy", "open mic signups"],
  "pickup-volleyball-peninsula": ["weekend pickup at Hacker Way Courts", "skill level question from a beginner", "found a lost water bottle", "sunset game was great", "looking for a coed team"],
  "peninsula-thrift-walks": ["next thrift walk route", "best day of the week for restocks", "tailor recommendation for thrifted pants", "clothing swap meetup idea", "a thrift flip before and after"],
  "film-photo-walks-bay": ["which film stock for foggy days", "photo walk along the bay", "camera repair question", "developing costs at Menlo Film Lab", "night photography meetup"],
  "peninsula-board-game-night": ["teaching a new game this week", "looking for a co-op game group", "game recommendation for 6 people", "results from last game night"],
  "boulder-buddies-bay": ["looking for a bouldering partner", "beginner question about grades", "outdoor trip idea", "finger injury rest advice", "new problems set this week"],
  "boba-and-sketch": ["drink of the week at Bobalicious Corner", "sketchbook recommendations", "draw-each-other night", "pen vs pencil debate"],
  "stanford-grad-socials": ["study sprint at the Belle Haven Library Study Room", "quals stress", "grad housing tips", "off-campus hike", "free food alert at a seminar"],
  "k-food-crew": ["homemade kimchi batch", "potluck at Bayfront Park Overlook", "tteokbokki recipe swap", "korean corn dog attempt", "banchan swap idea"],
  "sunset-runners-bayfront": ["this week's route along the Bay Trail", "running in the wind by the bay", "new runner nervous to join", "sunset photo from the trail", "post-run tacos"],
};
const GENERIC_HINTS = [
  "a small win at work", "weekend plans", "a cooking attempt", "a funny thing overheard", "missing home", "a sunset photo",
  "a question for friends", "commuting complaints", "a neighbor's dog", "a hobby update", "a throwback memory",
  "rainy day mood", "a recommendation request", "an overpriced coffee rant", "a new plant", "a birthday shoutout",
];

// ---------- threads outline ----------
// [id, name|null, members, message count, hint]
export const THREADS = [
  ["t01", null, ["alex", "maya"], 12, "best friends catching up now that they live close; Maya is off at 5:15 and free till 6; both want dumplings and to see a local band; making a loose plan for this week"],
  ["t02", null, ["alex", "devon"], 6, "college friend in Seattle asking how the new job and city are going"],
  ["t03", null, ["alex", "kai"], 8, "new coworkers; Kai invites Alex to try bouldering and lunch spots"],
  ["t04", null, ["alex", "jess"], 6, "hometown friend teasing Alex about moving to the Bay"],
  ["t05", null, ["maya", "jordan"], 7, "roommates: groceries, a show at The Signal Room, dishes"],
  ["t06", null, ["alex", "olivia"], 6, "team lead checking on Alex's first weeks, friendly, a little work talk"],
  ["t07", null, ["jordan", "riley"], 7, "poster design for Riley's band's show"],
  ["t08", null, ["sam", "grace"], 6, "setting up pickup volleyball at Hacker Way Courts"],
  ["t09", null, ["priya", "mei"], 6, "grad school venting and a study sprint plan"],
  ["t10", null, ["leo", "june"], 7, "film rolls, thrift finds, a photo walk"],
  ["t11", null, ["nina", "ava"], 6, "K-food night and boba"],
  ["t12", null, ["kai", "marco"], 6, "bouldering session times at Boulder Bay Gym"],
  ["t13", null, ["alex", "sofia"], 6, "college friend in LA asking if Alex has made friends yet"],
  ["t14", null, ["maya", "tess"], 6, "roommate night shift schedule and leftovers"],
  ["t15", "UCSD forever", ["alex", "maya", "devon", "sofia", "marcus", "ben"], 12, "college group chat: memes, reunion trip idea, teasing Alex and Maya for being in the same area again"],
  ["t16", "Sac crew", ["alex", "jess", "andre", "tyler", "diego"], 10, "hometown friends planning Thanksgiving week hangouts back in Sacramento"],
  ["t17", "Roomies", ["maya", "jordan", "tess", "yuki"], 10, "house chat: chores, a house dinner, a package mix-up"],
  ["t18", "Thursday volleyball", ["sam", "grace", "mateo", "kiana", "will"], 9, "who is in for pickup volleyball this week, need numbers"],
  ["t19", "Signal Room regulars", ["jordan", "riley", "jamal", "noah", "luna"], 10, "upcoming shows at The Signal Room, carpools, who has the extra ticket"],
  ["t20", "New team lunch", ["alex", "kai", "olivia", "ethan", "zara"], 9, "coworkers choosing a lunch spot today; Taco Trucks on Willow Rd vs Pho Saigon Willow; welcoming Alex"],
];

// ---------- events outline ----------
// [slug, groupSlug|null, host, place, startsInHours, durationHours, priceUsd, capacity, category, hint]
export const EVENTS = [
  ["signal-room-indie-night", "bay-area-local-shows", "jordan", "The Signal Room", 28, 3, 12, 120, "music", "three local indie bands, poster by Jordan"],
  ["dumpling-den-dumpling-night", "cheap-eats-south-bay", "nina", "Dumpling Den", 50, 1.5, 15, 12, "food", "group order of every dumpling on the menu, split the bill"],
  ["hacker-way-sunday-volleyball", "pickup-volleyball-peninsula", "sam", "Hacker Way Courts", 70, 2, 0, 18, "sports", "pickup volleyball, all levels"],
  ["willow-thrift-walk", "peninsula-thrift-walks", "leo", "Willow Thrift Co.", 46, 2, 0, 15, "social", "group thrift walk starting at Willow Thrift Co."],
  ["film-lab-darkroom-night", "film-photo-walks-bay", "june", "Menlo Film Lab", 98, 2, 10, 10, "arts", "intro to developing black and white film"],
  ["ravenswood-game-night", "peninsula-board-game-night", "arjun", "Ravenswood Board Game Cafe", 30, 3, 5, 24, "social", "weekly board game night, new people welcome"],
  ["boulder-bay-intro-night", "boulder-buddies-bay", "kai", "Boulder Bay Gym", 54, 2, 18, 12, "sports", "beginner bouldering session with a day pass"],
  ["boba-sketch-sunday", "boba-and-sketch", "zara", "Bobalicious Corner", 74, 2, 0, 15, "arts", "draw the room while sipping boba"],
  ["gallery-1600-grad-mixer", "stanford-grad-socials", "priya", "Gallery 1600", 120, 2.5, 0, 60, "social", "grad student mixer at a small art gallery"],
  ["k-food-potluck-bayfront", "k-food-crew", "ava", "Bayfront Park Overlook", 144, 2, 0, 20, "food", "Korean food picnic potluck"],
  ["bayfront-sunset-5k", "sunset-runners-bayfront", "olivia", "Bay Trail Start (Bayfront)", 26, 1, 0, 40, "sports", "easy social 5K at sunset"],
  ["new-grads-taco-night", "menlo-park-new-grads", "ethan", "Taco Trucks on Willow Rd", 52, 2, 12, 30, "food", "meet other new grads over tacos"],
  ["signal-room-open-mic", "bay-area-local-shows", "luna", "The Signal Room", 168, 2.5, 5, 80, "music", "open mic night, sign up at the door"],
  ["library-study-sprint", null, "mei", "Belle Haven Library Study Room", 96, 3, 0, 16, "study", "silent study sprint with pomodoro breaks"],
  ["pixel-arcade-smash-night", null, "ethan", "Pixel Arcade", 78, 3, 8, 32, "social", "Smash Bros bracket, casual"],
  ["pho-saigon-soup-run", "cheap-eats-south-bay", "rosa", "Pho Saigon Willow", 190, 1.5, 14, 10, "food", "big group pho dinner"],
  ["kaiten-bay-birthday", null, "yuki", "Kaiten Bay", 210, 2, 30, 8, "food", "Yuki's birthday conveyor sushi dinner"],
  ["coffee-works-zine-swap", null, "sage", "El Camino Coffee Works", 240, 2, 0, 25, "arts", "bring a zine, take a zine"],
  ["bayfront-overlook-photo-walk", "film-photo-walks-bay", "leo", "Bayfront Park Overlook", 264, 2, 0, 20, "arts", "golden-hour film photo walk"],
  ["noodle-theory-ramen-meetup", "menlo-park-new-grads", "kai", "Noodle Theory", 300, 1.5, 16, 12, "food", "ramen meetup for new folks"],
];

// ---------- listings outline ----------
// [id, seller, category, price, condition, item hint]
export const LISTINGS = [
  ["l01", "olivia", "Furniture", 40, "used - good", "wooden desk with two drawers"],
  ["l02", "liam", "Bikes", 120, "used - good", "steel commuter road bike"],
  ["l03", "tess", "Furniture", 150, "used - like new", "gray two-seat loveseat"],
  ["l04", "ethan", "Electronics", 60, "used - good", "27-inch computer monitor"],
  ["l05", "yuki", "Home", 15, "used - good", "small rice cooker"],
  ["l06", "dante", "Sports", 45, "used - fair", "climbing shoes size 10 and a chalk bag"],
  ["l07", "riley", "Instruments", 180, "used - good", "short-scale electric bass"],
  ["l08", "bea", "Clothing", 25, "used - like new", "vintage denim jacket"],
  ["l09", "arjun", "Toys & Games", 30, "used - like new", "bundle of three board games"],
  ["l10", "felix", "Furniture", 35, "used - good", "IKEA-style bookshelf, no brand"],
  ["l11", "fatima", "Home", 20, "used - good", "floor lamp with linen shade"],
  ["l12", "mateo", "Sports", 15, "used - good", "outdoor volleyball"],
  ["l13", "june", "Electronics", 90, "used - good", "35mm film camera with 50mm lens"],
  ["l14", "noah", "Instruments", 70, "used - fair", "practice snare drum with stand"],
  ["l15", "rosa", "Furniture", 50, "used - good", "round dining table for two"],
  ["l16", "will", "Furniture", 0, "used - fair", "free office chair, curb pickup"],
  ["l17", "zara", "Home", 25, "used - like new", "set of ceramic plates and bowls"],
  ["l18", "mei", "Books", 20, "used - good", "stack of intro statistics textbooks"],
  ["l19", "marco", "Home", 35, "used - good", "cast iron pan and pot set"],
  ["l20", "daniel", "Furniture", 60, "used - good", "queen bed frame, metal"],
  ["l21", "ivy", "Home", 80, "used - good", "sewing machine"],
  ["l22", "rafael", "Clothing", 55, "used - like new", "white leather sneakers size 10, no logo"],
  ["l23", "kiana", "Sports", 30, "used - good", "beach chairs and a cooler"],
  ["l24", "elle", "Home", 10, "used - good", "stand mixer bowl and attachments"],
  ["l25", "tomas", "Electronics", 120, "used - good", "handheld game console with case"],
  ["l26", "hana", "Home", 15, "used - good", "potted monstera plant"],
  ["l27", "grace", "Clothing", 18, "used - good", "rain jacket, women's M"],
  ["l28", "jamal", "Electronics", 140, "used - good", "DJ controller"],
  ["l29", "owen", "Sports", 40, "used - good", "two-person camping tent"],
  ["l30", "noor", "Furniture", 25, "used - good", "nightstand with one drawer"],
];

// ---------- stories outline ----------
// [author, hoursAgo, scene]
export const STORIES = [
  ["maya", 1.5, "stack of moving boxes in a sunny new apartment living room"],
  ["jordan", 2, "hand-drawn gig poster on a desk with markers"],
  ["nina", 3, "latte art and a boba cup on a cafe counter"],
  ["kai", 4, "bouldering wall with colorful holds seen from below"],
  ["sam", 5, "outdoor volleyball court at sunset"],
  ["leo", 6, "thrift store rack with a wool coat pulled out"],
  ["priya", 7, "film camera on a sandstone ledge at golden hour"],
  ["alex", 8, "a takeout box of dumplings on a desk next to a laptop"],
  ["riley", 9, "bass guitar leaning on an amp in a small venue"],
  ["olivia", 10, "bay trail at sunset with marsh grass"],
  ["zara", 12, "open sketchbook with a boba drawing"],
  ["june", 13, "strip of developed film negatives held to light"],
  ["yuki", 15, "bowl of ramen with steam on a wooden counter"],
  ["grace", 17, "thrifted windbreaker laid flat on a bed"],
  ["ethan", 19, "game controller and snacks on a couch, TV glow"],
  ["fatima", 22, "cup of chai next to a paperback on a windowsill"],
];

// ---------- full outline (deterministic) ----------
const TARGET_GROUP_POSTS_PER_GROUP = 10;
const TARGET_PROFILE_POSTS = 180;
const TARGET_TOP_COMMENTS = 170;
const TARGET_REPLIES = 30;
const TARGET_POST_IMAGES = 45;
const BEAT_HOURS = { 0: 20, 1: 70, 2: 150, 3: 260, 4: 44, 5: 110, 6: 200, 7: 9, 8: 240, 9: 120, 10: 60, 11: 30, 12: 180, 13: 52, 21: 75 };

export function friendsOf(h) {
  const me = byHandle[h];
  return PEOPLE.filter((p) => p.handle !== h && p.circles.some((c) => me.circles.includes(c))).map((p) => p.handle);
}

export function buildOutline() {
  const r = rng(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const raw = [];
  BEATS.forEach(([author, slug, hint, image, comments, audience], i) => {
    raw.push({ author, slug, hint, image, comments, audience, beat: true, hoursAgo: BEAT_HOURS[i] ?? Math.round((3 + r() * 300) * 2) / 2 });
  });
  // group posts: fill each group to the target
  for (const g of GROUPS) {
    const have = raw.filter((p) => p.slug === g.slug).length;
    const hints = GROUP_HINTS[g.slug];
    for (let k = have; k < TARGET_GROUP_POSTS_PER_GROUP; k++) {
      raw.push({ author: pick(g.memberHandles), slug: g.slug, hint: hints[k % hints.length], image: false, comments: 0, audience: "public", beat: false, hoursAgo: Math.round((1 + r() * 500) * 2) / 2 });
    }
  }
  // profile posts
  const quota = {};
  for (const p of PEOPLE) quota[p.handle] = p.handle === "alex" ? 10 : p.handle === "maya" ? 8 : p.isDemoUser ? 5 : 2;
  const locals = PEOPLE.filter((p) => !p.isDemoUser && p.local).map((p) => p.handle);
  let total = Object.values(quota).reduce((a, b) => a + b, 0);
  for (let i = 0; total < TARGET_PROFILE_POSTS; i++, total++) quota[locals[i % locals.length]]++;
  for (const p of PEOPLE) {
    const have = raw.filter((x) => x.author === p.handle && !x.slug).length;
    for (let k = have; k < quota[p.handle]; k++) {
      const interest = pick(p.interests);
      const hint = r() < 0.5 ? `something about ${interest}` : pick(GENERIC_HINTS);
      const maxH = p.handle === "alex" ? 480 : p.handle === "maya" ? 230 : 600;
      raw.push({ author: p.handle, slug: null, hint, image: false, comments: 0, audience: r() < 0.6 ? "public" : "friends", beat: false, hoursAgo: Math.round((1 + r() * maxH) * 2) / 2 });
    }
  }
  // images
  const nonBeat = raw.filter((p) => !p.beat);
  let imgs = raw.filter((p) => p.image).length;
  while (imgs < TARGET_POST_IMAGES) {
    const p = pick(nonBeat);
    if (!p.image) { p.image = true; imgs++; }
  }
  // comments
  let top = raw.reduce((a, p) => a + p.comments, 0);
  while (top < TARGET_TOP_COMMENTS) {
    const p = pick(nonBeat);
    if (p.comments < 3) { p.comments++; top++; }
  }
  // order: group posts grouped by group, then profile posts grouped by author
  const gOrder = GROUPS.map((g) => g.slug);
  const hOrder = PEOPLE.map((p) => p.handle);
  raw.sort((a, b) => {
    if (!!a.slug !== !!b.slug) return a.slug ? -1 : 1;
    if (a.slug) return gOrder.indexOf(a.slug) - gOrder.indexOf(b.slug) || a.hoursAgo - b.hoursAgo;
    return hOrder.indexOf(a.author) - hOrder.indexOf(b.author) || a.hoursAgo - b.hoursAgo;
  });
  const posts = raw.map((p, i) => {
    const id = `p${String(i + 1).padStart(3, "0")}`;
    const pool0 = p.slug ? groupBySlug[p.slug].memberHandles : friendsOf(p.author);
    let pool = pool0.filter((h) => h !== p.author);
    if (!p.slug) pool = pool.filter((h) => byHandle[h].local || byHandle[h].circles.some((c) => byHandle[p.author].circles.includes(c)));
    const first = p.author === "alex" ? "maya" : p.author === "maya" ? "alex" : null;
    const maxMin = Math.max(5, Math.floor(p.hoursAgo * 60) - 2);
    const comments = [];
    let t = 0;
    for (let c = 0; c < p.comments; c++) {
      const author = c === 0 && first && pool.includes(first) ? first : pick(pool);
      t = Math.min(maxMin, t + 3 + Math.floor(r() * 90));
      comments.push({ slot: `c${c + 1}`, authorHandle: author, minutesAfter: t, replies: [] });
    }
    const reactTotal = Math.floor(r() * r() * (p.beat ? 60 : 35)) + (p.beat ? 6 : 1);
    const reactions = { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
    for (let k = 0; k < reactTotal; k++) {
      const x = r();
      reactions[x < 0.6 ? "like" : x < 0.8 ? "love" : x < 0.84 ? "care" : x < 0.95 ? "haha" : x < 0.99 ? "wow" : "sad"]++;
    }
    return { id, authorHandle: p.author, slug: p.slug, hint: p.hint, hasImage: p.image, audience: p.audience, hoursAgo: p.hoursAgo, reactions, comments, pool };
  });
  // replies
  const allComments = posts.flatMap((p) => p.comments.map((c) => ({ p, c })));
  let reps = 0;
  while (reps < TARGET_REPLIES) {
    const { p, c } = pick(allComments);
    if (c.replies.length) continue;
    const maxMin = Math.max(c.minutesAfter + 1, Math.floor(p.hoursAgo * 60) - 1);
    const author = r() < 0.6 ? p.authorHandle : pick(p.pool.filter((h) => h !== c.authorHandle).concat(p.authorHandle));
    c.replies.push({ slot: `${c.slot}r1`, authorHandle: author, minutesAfter: Math.min(maxMin, c.minutesAfter + 2 + Math.floor(r() * 60)) });
    reps++;
  }
  // threads: sender sequence and times
  const threads = THREADS.map(([id, name, members, count, hint]) => {
    const msgs = [];
    let ago = Math.floor(60 + r() * 2400);
    let prev = null;
    for (let k = 0; k < count; k++) {
      let from = members.length === 2 ? (prev === members[0] && r() < 0.75 ? members[1] : prev === members[1] && r() < 0.75 ? members[0] : pick(members)) : pick(members);
      if (k === 0 && id === "t01") from = "maya";
      msgs.push({ slot: `m${k + 1}`, fromHandle: from, minutesAgo: ago });
      prev = from;
      ago = Math.max(1, ago - Math.floor(1 + r() * (ago / 4)));
    }
    if (id === "t01") for (const m of msgs) m.minutesAgo = Math.max(2, Math.floor(m.minutesAgo / 10));
    return { id, name, memberHandles: members, hint, msgs };
  });
  // events: guests
  const events = EVENTS.map(([slug, groupSlug, host, placeName, startsInHours, durationHours, priceUsd, capacity, category, hint]) => {
    const pool = (groupSlug ? groupBySlug[groupSlug].memberHandles : PEOPLE.filter((p) => p.local).map((p) => p.handle)).filter((h) => h !== host && h !== "alex");
    const sh = [...pool].sort(() => r() - 0.5);
    const nGoing = Math.min(capacity - 1, 2 + Math.floor(r() * 8), sh.length);
    const goingHandles = [host, ...sh.slice(0, nGoing)];
    const interestedHandles = sh.slice(nGoing, nGoing + 2 + Math.floor(r() * 6));
    if (slug === "signal-room-indie-night") interestedHandles.unshift("alex");
    return { slug, groupSlug, host, placeName, startsInHours, durationHours, priceUsd, capacity, category, hint, goingHandles, interestedHandles };
  });
  return { posts, threads, events };
}

// ---------- Muse calls (cached) ----------
const MODEL = process.env.MUSE_MODEL_FAST || "muse-ember-1.0";
const CACHE_DIR = join(ROOT, ".cache", "muse", "content");
const PRICE_IN = 0.1 / 1e6, PRICE_OUT = 0.5 / 1e6;
const stats = { calls: 0, cached: 0, retries: 0, tokensIn: 0, tokensOut: 0, ms: 0, log: [] };
let muse = null;

const SYSTEM = `You write seed content for a fictional Facebook demo app. Today is Thursday, November 12, 2026.
Voice: real young adults (18-26) posting on Facebook in late 2026. Short, specific, local (Menlo Park, Palo Alto, Redwood City, East Palo Alto, Stanford, the Bay Trail, Caltrain), varied in length and tone, some funny, casual lowercase is fine, an emoji now and then, at most one hashtag and usually none.
Hard rules: every person is fictional; only mention people by the first names given in the input; never name a real person or celebrity. Never name a real local business; when a place is needed use only these fictional venues: ${PLACES.join(", ")}. No brand names. Nothing offensive, sexual, or political. No specific calendar dates. Output JSON only, matching the schema.`;

const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items) => ({ type: "array", items });
const S = { type: "string" };

function sha(s) { return createHash("sha256").update(s).digest("hex"); }

async function museJSON(label, schemaName, schema, user, check) {
  const body = { model: MODEL, reasoning_effort: "minimal", response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const reqBody = attempt === 0 ? body : { ...body, messages: [...body.messages, { role: "user", content: "Your previous answer was incomplete. Return every requested id/slot exactly once." }] };
    const key = sha(JSON.stringify(reqBody));
    const file = join(CACHE_DIR, `${label}-${key.slice(0, 16)}.json`);
    let parsed = null;
    if (existsSync(file)) {
      parsed = JSON.parse(JSON.parse(readFileSync(file, "utf8")).content);
      stats.cached++;
      stats.log.push({ label, ms: 0, ok: true, cached: true });
    } else {
      if (!muse) {
        const { default: OpenAI } = await import("openai");
        if (!process.env.MUSE_API_KEY || !process.env.MUSE_BASE_URL) throw new Error("MUSE_API_KEY / MUSE_BASE_URL missing");
        muse = new OpenAI({ apiKey: process.env.MUSE_API_KEY, baseURL: process.env.MUSE_BASE_URL, maxRetries: 0, timeout: 180_000 });
      }
      let data, ms;
      for (let tries = 0; ; tries++) {
        const t0 = Date.now();
        try {
          data = await muse.chat.completions.create(reqBody);
          ms = Date.now() - t0;
          break;
        } catch (err) {
          const st = err?.status;
          if (tries < 4 && (st === 429 || (st >= 500) || st === undefined)) {
            stats.retries++;
            await new Promise((res) => setTimeout(res, 2000 * 2 ** tries));
            continue;
          }
          throw new Error(`${label}: HTTP ${st} ${String(err?.message ?? err).slice(0, 200)}`);
        }
      }
      stats.calls++;
      stats.ms += ms;
      stats.tokensIn += data.usage?.prompt_tokens ?? 0;
      stats.tokensOut += data.usage?.completion_tokens ?? 0;
      stats.log.push({ label, ms, ok: true, cached: false, tin: data.usage?.prompt_tokens, tout: data.usage?.completion_tokens });
      const content = data.choices?.[0]?.message?.content ?? "";
      try { parsed = JSON.parse(content); } catch { parsed = null; }
      if (parsed && check(parsed) === true) {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(file, JSON.stringify({ label, model: MODEL, usage: data.usage ?? null, content }));
      }
    }
    const verdict = parsed ? check(parsed) : "invalid JSON";
    if (verdict === true) return parsed;
    console.warn(`  ${label} attempt ${attempt + 1}: ${verdict}`);
    if (attempt === 1) return parsed; // caller tolerates missing items
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const brief = (h) => { const p = byHandle[h]; return `${p.name.split(" ")[0]} (${h}, ${p.age}, ${p.currentCity}, ${p.role}; likes ${p.interests.join(", ")})`; };
const ago = (h) => (h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)} days ago`);

// ---------- generators ----------
async function genPeople() {
  const schema = obj({ people: arr(obj({ handle: S, school: S, major: S, gradYear: { type: "integer" }, hometown: S, job: S, bio: S })) });
  const batches = chunk(PEOPLE, 16);
  const res = await pool(batches, 4, (b, i) => {
    const lines = b.map((p) => `- ${p.handle}: ${p.name}, ${p.pronouns}, age ${p.age}, lives in ${p.currentCity}, ${p.role}; interests ${p.interests.join(", ")}${p.hometown ? `; hometown fixed: ${p.hometown}` : ""}${p.circles.includes("college") ? "; went to UC San Diego (fixed)" : ""}`).join("\n");
    const user = `Fill a profile for each person below. school: a real US college, "Stanford University" for Stanford folks, or a community college; major; gradYear (past or expected, consistent with age); hometown "City, ST"; job: short job title (no real company names, e.g. "Analyst at a health-tech startup"); bio: a Facebook intro line, max 90 characters, first person, specific, may include one emoji.\n${lines}\nReturn ${b.length} people with the same handles.`;
    return museJSON(`people-${i + 1}`, "people", schema, user, (j) => {
      const got = new Set((j.people ?? []).map((x) => x.handle));
      const miss = b.filter((p) => !got.has(p.handle));
      return miss.length ? `missing ${miss.map((p) => p.handle)}` : true;
    });
  });
  return Object.fromEntries(res.flatMap((r) => r?.people ?? []).map((x) => [x.handle, x]));
}

async function genGroups() {
  const schema = obj({ groups: arr(obj({ slug: S, description: S })) });
  const user = `Write a Facebook Group "About" description (1-3 sentences, friendly, specific, max 220 characters) for each group:\n${GROUPS.map((g) => `- ${g.slug}: "${g.name}" (${g.privacy}); ${g.about}`).join("\n")}`;
  const j = await museJSON("groups", "groups", schema, user, (j) => {
    const s = new Set((j.groups ?? []).map((g) => g.slug));
    return GROUPS.every((g) => s.has(g.slug)) ? true : "missing groups";
  });
  return Object.fromEntries((j?.groups ?? []).map((g) => [g.slug, g.description]));
}

async function genPosts(outline) {
  const schema = obj({ posts: arr(obj({ id: S, text: S, comments: arr(obj({ slot: S, text: S })) })) });
  const batches = chunk(outline.posts, 20);
  const res = await pool(batches, 4, (b, i) => {
    const people = [...new Set(b.flatMap((p) => [p.authorHandle, ...p.comments.flatMap((c) => [c.authorHandle, ...c.replies.map((r) => r.authorHandle)])]))];
    const lines = b.map((p) => {
      const where = p.slug ? `in group "${groupBySlug[p.slug].name}"` : `on own profile (${p.audience})`;
      const cm = p.comments.flatMap((c) => [`${c.slot} by ${c.authorHandle}`, ...c.replies.map((r) => `${r.slot} by ${r.authorHandle} replying to ${c.slot} (written by ${c.authorHandle})`)]);
      return `- ${p.id}: by ${p.authorHandle} ${where}, posted ${ago(p.hoursAgo)}; topic: ${p.hint}${p.hasImage ? "; a photo is attached, the text goes with it" : ""}${cm.length ? `; comment slots: ${cm.join("; ")}` : "; no comments"}`;
    }).join("\n");
    const user = `People:\n${people.map((h) => `- ${brief(h)}`).join("\n")}\n\nWrite each Facebook post's text (1-280 characters, most under 160) and the text of every comment slot (2-120 characters, natural replies that fit the post and each other). Each slot is written by the person named after "by": write only the words they type, never start with a name and a colon, never have someone address or thank themselves, and a reply answers the comment it replies to. Return exactly these posts and slots:\n${lines}`;
    return museJSON(`posts-${String(i + 1).padStart(2, "0")}`, "posts", schema, user, (j) => {
      const m = new Map((j.posts ?? []).map((x) => [x.id, x]));
      for (const p of b) {
        const g = m.get(p.id);
        if (!g || !g.text) return `missing ${p.id}`;
        const slots = new Set(g.comments.map((c) => c.slot));
        for (const c of p.comments) {
          if (!slots.has(c.slot)) return `missing ${p.id}/${c.slot}`;
          for (const r of c.replies) if (!slots.has(r.slot)) return `missing ${p.id}/${r.slot}`;
        }
      }
      return true;
    });
  });
  return new Map(res.flatMap((r) => r?.posts ?? []).map((x) => [x.id, x]));
}

async function genThreads(outline) {
  const schema = obj({ threads: arr(obj({ id: S, messages: arr(obj({ slot: S, text: S })) })) });
  const res = await pool(chunk(outline.threads, 5), 4, (b, i) => {
    const people = [...new Set(b.flatMap((t) => t.memberHandles))];
    const lines = b.map((t) => `- ${t.id}${t.name ? ` group chat "${t.name}"` : " (1:1 chat)"}; about: ${t.hint}; messages oldest first: ${t.msgs.map((m) => `${m.slot} from ${m.fromHandle}`).join(", ")}`).join("\n");
    const user = `People:\n${people.map((h) => `- ${brief(h)}`).join("\n")}\n\nWrite Messenger messages (texting style, 1-140 characters each; consecutive messages flow as one conversation). Return every slot:\n${lines}`;
    return museJSON(`threads-${i + 1}`, "threads", schema, user, (j) => {
      const m = new Map((j.threads ?? []).map((x) => [x.id, x]));
      for (const t of b) {
        const g = m.get(t.id);
        if (!g) return `missing ${t.id}`;
        const s = new Set(g.messages.map((x) => x.slot));
        for (const x of t.msgs) if (!s.has(x.slot)) return `missing ${t.id}/${x.slot}`;
      }
      return true;
    });
  });
  return new Map(res.flatMap((r) => r?.threads ?? []).map((x) => [x.id, x]));
}

async function genEvents(outline) {
  const schema = obj({ events: arr(obj({ slug: S, title: S, description: S })) });
  const res = await pool(chunk(outline.events, 10), 2, (b, i) => {
    const user = `Write a Facebook Event title (max 60 characters, no date) and description (1-3 sentences, max 300 characters, practical: what to bring, who it is for) for each:\n${b.map((e) => `- ${e.slug}: ${e.hint}; at ${e.placeName}; ${e.durationHours}h; ${e.priceUsd ? `$${e.priceUsd}` : "free"}; capacity ${e.capacity}; host ${brief(e.host)}${e.groupSlug ? `; posted in group "${groupBySlug[e.groupSlug].name}"` : ""}`).join("\n")}`;
    return museJSON(`events-${i + 1}`, "events", schema, user, (j) => {
      const s = new Set((j.events ?? []).map((x) => x.slug));
      const miss = b.filter((e) => !s.has(e.slug));
      return miss.length ? `missing ${miss.map((e) => e.slug)}` : true;
    });
  });
  return new Map(res.flatMap((r) => r?.events ?? []).map((x) => [x.slug, x]));
}

async function genListings() {
  const schema = obj({ listings: arr(obj({ id: S, title: S, description: S })) });
  const res = await pool(chunk(LISTINGS, 15), 2, (b, i) => {
    const user = `Write Facebook Marketplace listings: title (max 50 characters, no brand names) and description (1-2 sentences, max 200 characters, mention pickup area and why selling):\n${b.map(([id, seller, cat, price, cond, hint]) => `- ${id}: ${hint}; ${cat}; $${price}; ${cond}; seller ${brief(seller)}`).join("\n")}`;
    return museJSON(`listings-${i + 1}`, "listings", schema, user, (j) => {
      const s = new Set((j.listings ?? []).map((x) => x.id));
      const miss = b.filter((l) => !s.has(l[0]));
      return miss.length ? `missing ${miss.map((l) => l[0])}` : true;
    });
  });
  return new Map(res.flatMap((r) => r?.listings ?? []).map((x) => [x.id, x]));
}

// ---------- contract validation ----------
async function validate(data) {
  const { z } = await import("zod");
  const handle = z.string().regex(/^[a-z]+$/);
  const reactions = z.object({ like: z.number().int().min(0), love: z.number().int().min(0), care: z.number().int().min(0), haha: z.number().int().min(0), wow: z.number().int().min(0), sad: z.number().int().min(0), angry: z.number().int().min(0) }).strict();
  const reply = z.object({ authorHandle: handle, text: z.string().min(1), minutesAfter: z.number().min(0) }).strict();
  const Contract = z.object({
    people: z.array(z.object({ handle, name: z.string().min(1), pronouns: z.string(), age: z.number().int().min(18).max(26), school: z.string().min(1), major: z.string().min(1), gradYear: z.number().int(), hometown: z.string().min(1), currentCity: z.string().min(1), job: z.string().min(1), bio: z.string().min(1), interests: z.array(z.string()).min(1), budgetMax: z.number(), circles: z.array(z.string()).min(1), isDemoUser: z.boolean(), avatar: z.string().regex(/^\/seed\/people\/[a-z]+\.webp$/) }).strict()),
    groups: z.array(z.object({ slug: z.string(), name: z.string(), privacy: z.enum(["public", "private"]), description: z.string().min(1), tags: z.array(z.string()), cover: z.string(), memberHandles: z.array(handle).min(1) }).strict()),
    posts: z.array(z.object({ id: z.string().regex(/^p\d{3}$/), authorHandle: handle, target: z.union([z.object({ type: z.literal("profile") }).strict(), z.object({ type: z.literal("group"), slug: z.string() }).strict()]), audience: z.enum(["public", "friends"]), text: z.string().min(1), image: z.string().nullable(), hoursAgo: z.number().positive(), reactions, comments: z.array(z.object({ authorHandle: handle, text: z.string().min(1), minutesAfter: z.number().min(0), replies: z.array(reply) }).strict()) }).strict()),
    stories: z.array(z.object({ authorHandle: handle, image: z.string(), hoursAgo: z.number().positive() }).strict()),
    threads: z.array(z.object({ id: z.string(), name: z.string().nullable(), memberHandles: z.array(handle).min(2), messages: z.array(z.object({ fromHandle: handle, text: z.string().min(1), minutesAgo: z.number().min(0) }).strict()).min(1) }).strict()),
    events: z.array(z.object({ slug: z.string(), title: z.string().min(1), groupSlug: z.string().nullable(), hostHandle: handle, placeName: z.enum(PLACES), startsInHours: z.number().positive(), durationHours: z.number().positive(), priceUsd: z.number().min(0), capacity: z.number().int().positive(), category: z.enum(["music", "food", "sports", "social", "study", "arts"]), description: z.string().min(1), cover: z.string(), goingHandles: z.array(handle), interestedHandles: z.array(handle) }).strict()),
    listings: z.array(z.object({ id: z.string(), sellerHandle: handle, title: z.string().min(1), priceUsd: z.number().min(0), condition: z.string(), category: z.string(), description: z.string().min(1), image: z.string(), hoursAgo: z.number().positive() }).strict()),
  }).strict();
  Contract.parse(data);
  const errs = [];
  const H = new Set(data.people.map((p) => p.handle));
  const GS = new Set(data.groups.map((g) => g.slug));
  const need = (h, where) => { if (!H.has(h)) errs.push(`unknown handle ${h} in ${where}`); };
  if (H.size !== data.people.length) errs.push("duplicate handles");
  for (const h of DEMO) { const p = data.people.find((x) => x.handle === h); if (!p?.isDemoUser) errs.push(`demo user ${h} missing`); }
  const CIRCLES = ["college", "coworkers", "maya-roommates", "climbing-gym", "local-shows", "volleyball", "thrift", "board-games", "stanford-grad", "hometown-alex"];
  for (const p of data.people) for (const c of p.circles) if (!CIRCLES.includes(c)) errs.push(`bad circle ${c}`);
  for (const g of data.groups) g.memberHandles.forEach((h) => need(h, g.slug));
  for (const p of data.posts) {
    need(p.authorHandle, p.id);
    if (p.target.type === "group" && !GS.has(p.target.slug)) errs.push(`bad group ${p.target.slug} in ${p.id}`);
    for (const c of p.comments) { need(c.authorHandle, p.id); c.replies.forEach((r) => need(r.authorHandle, p.id)); }
  }
  data.stories.forEach((s) => need(s.authorHandle, "story"));
  for (const t of data.threads) { t.memberHandles.forEach((h) => need(h, t.id)); t.messages.forEach((m) => { if (!t.memberHandles.includes(m.fromHandle)) errs.push(`${t.id}: sender ${m.fromHandle} not a member`); }); }
  for (const e of data.events) { need(e.hostHandle, e.slug); [...e.goingHandles, ...e.interestedHandles].forEach((h) => need(h, e.slug)); if (e.groupSlug && !GS.has(e.groupSlug)) errs.push(`bad group in ${e.slug}`); }
  data.listings.forEach((l) => need(l.sellerHandle, l.id));
  const comments = data.posts.reduce((a, p) => a + p.comments.length + p.comments.reduce((b, c) => b + c.replies.length, 0), 0);
  const counts = { people: [data.people.length, 60], groups: [data.groups.length, 12], posts: [data.posts.length, 300], groupPosts: [data.posts.filter((p) => p.target.type === "group").length, 120], postImages: [data.posts.filter((p) => p.image).length, 45], comments: [comments, 200], stories: [data.stories.length, 16], threads: [data.threads.length, 20], groupChats: [data.threads.filter((t) => t.name).length, 6], events: [data.events.length, 20], listings: [data.listings.length, 30] };
  for (const [k, [n, want]] of Object.entries(counts)) if (Math.abs(n - want) > Math.max(1, want * 0.1) && !(k === "groupChats" && n === want)) errs.push(`${k}: ${n} not within 10% of ${want}`);
  if (!data.threads.some((t) => !t.name && t.memberHandles.length === 2 && t.memberHandles.includes("alex") && t.memberHandles.includes("maya"))) errs.push("no alex-maya thread");
  const alexFriends = friendsOf("alex").length;
  return { errs, counts: Object.fromEntries(Object.entries(counts).map(([k, [n]]) => [k, n])), alexFriends };
}

// drops a leading "name:" speaker label (repeated) that the model sometimes adds
const NAMES = new Set(PEOPLE.flatMap((p) => [p.handle, p.name.split(" ")[0].toLowerCase()]));
function stripSpeaker(text) {
  let t = text.trim();
  for (let m; (m = /^([A-Za-zÀ-ÿ]+):\s*/.exec(t)) && NAMES.has(m[1].toLowerCase()); ) t = t.slice(m[0].length);
  return t || text;
}

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  const outline = buildOutline();
  const [peopleText, groupText, postText, threadText, eventText, listingText] = await Promise.all([
    genPeople(), genGroups(), genPosts(outline), genThreads(outline), genEvents(outline), genListings(),
  ]);
  const dropped = [];
  const people = PEOPLE.map((p) => {
    const t = peopleText[p.handle] ?? {};
    const college = p.circles.includes("college");
    return {
      handle: p.handle, name: p.name, pronouns: p.pronouns, age: p.age,
      school: college ? "UC San Diego" : t.school || "De Anza College", major: t.major || "Undeclared",
      gradYear: p.handle === "alex" || p.handle === "maya" ? 2025 : t.gradYear || 2025,
      hometown: p.hometown ?? t.hometown ?? p.currentCity, currentCity: p.currentCity,
      job: t.job || p.role, bio: t.bio || p.role, interests: p.interests, budgetMax: p.budgetMax,
      circles: p.circles, isDemoUser: p.isDemoUser, avatar: `/seed/people/${p.handle}.webp`,
    };
  });
  const groups = GROUPS.map((g) => ({ slug: g.slug, name: g.name, privacy: g.privacy, description: groupText[g.slug] || g.about, tags: g.tags, cover: `/seed/groups/${g.slug}.webp`, memberHandles: g.memberHandles }));
  const posts = [];
  for (const p of outline.posts) {
    const t = postText.get(p.id);
    if (!t?.text) { dropped.push(p.id); continue; }
    const ct = new Map(t.comments.map((c) => [c.slot, stripSpeaker(c.text)]));
    const comments = p.comments.filter((c) => ct.get(c.slot)).map((c) => ({
      authorHandle: c.authorHandle, text: ct.get(c.slot), minutesAfter: c.minutesAfter,
      replies: c.replies.filter((r) => ct.get(r.slot)).map((r) => ({ authorHandle: r.authorHandle, text: ct.get(r.slot), minutesAfter: r.minutesAfter })),
    }));
    posts.push({ id: p.id, authorHandle: p.authorHandle, target: p.slug ? { type: "group", slug: p.slug } : { type: "profile" }, audience: p.audience, text: t.text, image: p.hasImage ? `/seed/posts/${p.id}.webp` : null, hoursAgo: p.hoursAgo, reactions: p.reactions, comments });
  }
  const stories = STORIES.map(([authorHandle, hoursAgo], i) => ({ authorHandle, image: `/seed/stories/${i + 1}.webp`, hoursAgo }));
  const threads = outline.threads.map((t) => {
    const mt = new Map((threadText.get(t.id)?.messages ?? []).map((m) => [m.slot, stripSpeaker(m.text)]));
    return { id: t.id, name: t.name, memberHandles: t.memberHandles, messages: t.msgs.filter((m) => mt.get(m.slot)).map((m) => ({ fromHandle: m.fromHandle, text: mt.get(m.slot), minutesAgo: m.minutesAgo })) };
  });
  const events = outline.events.map((e) => {
    const t = eventText.get(e.slug) ?? {};
    return { slug: e.slug, title: t.title || e.hint, groupSlug: e.groupSlug, hostHandle: e.host, placeName: e.placeName, startsInHours: e.startsInHours, durationHours: e.durationHours, priceUsd: e.priceUsd, capacity: e.capacity, category: e.category, description: t.description || e.hint, cover: `/seed/events/${e.slug}.webp`, goingHandles: e.goingHandles, interestedHandles: e.interestedHandles };
  });
  const r = rng(7);
  const listings = LISTINGS.map(([id, sellerHandle, category, priceUsd, condition, hint]) => {
    const t = listingText.get(id) ?? {};
    return { id, sellerHandle, title: t.title || hint, priceUsd, condition, category, description: t.description || hint, image: `/seed/listings/${id}.webp`, hoursAgo: Math.round((2 + r() * 300) * 2) / 2 };
  });
  const data = { people, groups, posts, stories, threads, events, listings };
  const { errs, counts, alexFriends } = await validate(data);
  const out = join(ROOT, "supabase", "seed-content.json");
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  const spend = stats.tokensIn * PRICE_IN + stats.tokensOut * PRICE_OUT;
  const summary = { ...counts, alexFriends, droppedPosts: dropped.length, museCalls: stats.calls, cachedBatches: stats.cached, retries: stats.retries, tokensIn: stats.tokensIn, tokensOut: stats.tokensOut, spendUsd: Number(spend.toFixed(4)), seconds: Math.round((Date.now() - t0) / 1000) };
  writeEvidence(summary, errs);
  console.log("wrote supabase/seed-content.json");
  console.log(Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(" "));
  if (errs.length) { console.error(`VALIDATION FAILED (${errs.length}):\n` + errs.slice(0, 30).join("\n")); process.exitCode = 1; }
  else console.log("validation: OK");
}

export function writeSection(name, body) {
  const file = join(ROOT, "docs", "evidence", "M1-content.md");
  mkdirSync(dirname(file), { recursive: true });
  let md = existsSync(file) ? readFileSync(file, "utf8") : "# M1 content: seed text and images\n\nWritten by `scripts/gen-content.mjs` and `scripts/gen-images.mjs`. No keys are recorded.\n";
  const a = `<!-- ${name}:start -->`, b = `<!-- ${name}:end -->`;
  const block = `${a}\n${body}\n${b}`;
  md = md.includes(a) ? md.replace(new RegExp(`${a}[\\s\\S]*?${b}`), () => block) : `${md}\n${block}\n`;
  writeFileSync(file, md);
}

function writeEvidence(summary, errs) {
  const lines = [`## Text (npm run gen:content), ${new Date().toISOString()}`, "", `Model ${MODEL}, reasoning_effort minimal, strict json_schema. Cache: .cache/muse/content/.`, "", "| Key | Value |", "|---|---|", ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`), "", `Validation: ${errs.length ? `${errs.length} errors: ${errs.slice(0, 10).join("; ")}` : "OK (zod contract, references, counts within 10%)"}`, "", "| Batch | ms | ok | cached | tokens in/out |", "|---|---|---|---|---|", ...stats.log.map((l) => `| ${l.label} | ${l.ms} | ${l.ok} | ${l.cached} | ${l.tin ?? ""}/${l.tout ?? ""} |`)];
  writeSection("content", lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
