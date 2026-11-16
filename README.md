# Pago Voice

Asistentul vocal Pago pentru plata facturilor. Next.js (App Router) + Tailwind CSS + Framer Motion + Anthropic SDK.

## Pornire

1. Copiaza `.env.example` in `.env.local` si pune cheia ta:

   ```bash
   cp .env.example .env.local
   ```

   `ANTHROPIC_API_KEY=...`

2. Instaleaza dependintele si porneste aplicatia:

   ```bash
   npm install
   npm run dev
   ```

3. Deschide http://localhost:3000 in Chrome si permite microfonul. Spune "Hei Pago, cat am la Digi?" sau apasa microfonul.

Comenzi utile: `npm run typecheck`, `npm run lint`, `npm run build`.

## Structura

- `app/api/chat/route.ts` - endpoint POST care primeste istoricul si facturile, apeleaza modelul si returneaza `{ reply, action, billId }`.
- `lib/chat/assistant.ts` - prompt, validarea cererii si parsarea raspunsului modelului.
- `lib/voice/controller.ts` - masina de stari vocala (wake word, intrebare, raspuns, inchidere), fara React.
- `lib/voice/recognition.ts`, `lib/voice/text.ts` - API-ul de recunoastere vocala si regulile de text.
- `hooks/usePagoVoice.ts` - leaga controllerul de React.
- `components/voice/PagoVoice.tsx` - buton flotant + overlay; se monteaza o singura data in pagina.
- `lib/types.ts`, `lib/bills.ts` - tipul `Bill` si facturi de test.
