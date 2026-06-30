# 🪶 Mother Tongue

**Keep your language alive — and let it carry you forward.**

An AI-powered web app for endangered ("forgotten") languages, built for the RP 2026 Hackathon. It serves two people at once:

| Mode | Who it's for | What it does |
|------|--------------|--------------|
| 🌉 **Bridge** | People who *speak* an endangered language and need to get by in a city that doesn't | Voice translator, survival phrasebooks (doctor, market, bus, work, emergency), and an AI job helper |
| 🌱 **Roots** | Their **children & grandchildren** who barely speak it | AI-generated recipes, folk tales, history & songs *in the heritage language*, with side-by-side translation, vocab, and a gamified quiz + streak |

Built **voice-first and low-literacy-friendly**: every piece of text has a 🔊 "tap to hear" button, and you can 🎤 speak instead of type anywhere.

---

## 🧠 The AI / ML

- **Google Gemini** (`gemini-flash-latest`) is the language brain. It powers:
  - two-way translation into low-resource languages (with romanized pronunciation so non-readers can sound words out),
  - on-the-fly survival phrasebooks per real-life situation,
  - culturally-grounded story / recipe / history generation **in the heritage language** with line-for-line translation, vocabulary, and quizzes,
  - skills-to-jobs matching explained in the user's own language.
- **Browser Web Speech API** handles **speech-to-text** (microphone input) and **text-to-speech** (read-aloud), so the whole app works by voice.

> ⚠️ **Honest limitation:** many endangered languages are genuinely low-resource. Gemini is strong but not perfect on the rarest ones, and most have no synthetic browser voice (so read-aloud falls back gracefully, and the city/mainstream language always reads correctly). This is a hackathon prototype — for production you'd pair this with community-recorded audio and human-verified phrasebooks.

---

## 🚀 Run it

**Requirements:** Node.js 18+ (tested on Node 22). A modern Chrome/Edge browser is best for the voice features.

```bash
# 1. Install
cd RP-2026-Hackathon
npm install

# 2. Add your Gemini API key
cp .env.local.example .env.local
#   then edit .env.local and set GEMINI_API_KEY=...
#   (get a free key at https://aistudio.google.com/apikey)

# 3. Start the dev server
npm run dev
```

Open **http://localhost:3000**.

> A working `.env.local` is already included so it runs out of the box. Replace the key with your own for real use.

### Production build

```bash
npm run build
npm start
```

---

## 🕹️ How to demo it (90 seconds)

1. **Home** → pick a heritage language (e.g. *K'iche'*, *Quechua*, *Māori*) and a city language (e.g. *Spanish*, *English*). Hit **Save**.
2. **Bridge →**
   - **Translate:** tap the mic, say *"Where is the hospital?"* — get it in the heritage language with pronunciation, then 🔊 hear it. Hit **⇄** to flip direction.
   - **Phrasebook:** tap **🏥 Doctor & Hospital** — instant survival phrases, each tappable to hear.
   - **Find work:** describe what you can do ("I grew rice and can cook for many people") → get dignified job suggestions explained in your language.
3. **Roots →** pick **🐉 Myths & Tales**, optionally type a theme, hit **Create lesson** → read the bilingual tale, learn the vocab, take the quiz, watch your 🔥 points climb.

---

## 🏗️ How it's built

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **`@google/genai`** SDK calling Gemini server-side via API routes
- No database — language choice and Roots progress live in `localStorage`; lessons are generated fresh each time

```
app/
  page.tsx              # landing: language setup + mode picker
  speaker/page.tsx      # 🌉 Bridge: Translate · Phrasebook · Find work
  heritage/page.tsx     # 🌱 Roots: lessons + bilingual reader + quiz
  api/
    translate/route.ts  # two-way translation
    phrases/route.ts    # situational survival phrasebook
    heritage/route.ts   # cultural lesson + vocab + quiz generation
    jobs/route.ts       # skills -> job matches
lib/
  gemini.ts             # Gemini client + robust JSON helper
  languages.ts          # language catalog, topics, categories
  speech.ts             # Web Speech API wrappers (STT + TTS)
  useLangs.ts           # persisted language selection
  types.ts              # shared API types
components/
  SpeakButton.tsx       # tap-to-hear
  MicButton.tsx         # tap-to-speak
  SetupGuard.tsx        # ensures a language is chosen
```

---

## 💡 Where it goes next

- Community audio: let elders record real pronunciations to replace synthetic TTS.
- Offline-first PWA for rural areas with poor connectivity.
- Human-in-the-loop verification of generated phrases by native speakers.
- A real job board with partner employers + application tracking.
