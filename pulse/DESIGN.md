# Pulse design

- Font: Poppins 400–800 from a Google Fonts stylesheet (the only external resource allowed), fallback system-ui. h1 800 clamp(30px,5.2vw,46px); h2 700 1.35rem; h3 600; body 15px/1.6.
- Light tokens: --ground #EFF2F7 --surface #FFF --surface-2 #F7F8FB --ink #161F28 --muted #5A6B8F --line #DFE6F6 --accent #2B59C3 --accent-soft #E6F0FF --shadow 0 0 1.4px rgba(24,24,27,.3),0 5.6px 11.2px rgba(24,24,27,.1)
- Dark tokens: --ground #0E131A --surface #171D26 --surface-2 #1D2430 --ink #E6EAF2 --muted #94A3BD --line #2A3240 --accent #7FA2F5 --accent-soft #1A2747 --shadow 0 4px 12px rgba(0,0,0,.35)
- Poster palette (same in both themes): blue #2A56D4 → #1E43B8, yellow #FFD54A, white #FFF, glass rgba(255,255,255,.14), glass border rgba(255,255,255,.38)
- Member colors: Membrul 1 = accent blue, Membrul 2 = yellow #FFD54A (with #161F28 text)
- Masthead: lowercase bold "pago" wordmark in the accent color | 1px separator | "AI Hackathon · Pago Voice" in small muted text
- Hero = poster: linear-gradient(160deg,#2A56D4,#1E43B8), white text, radius 28px, padding 28px, h1 in yellow, bold white subline, yellow radial glow at the bottom right; the illustration inside is white/yellow line art (stroke 2.2, round caps), framed by a glass phone outline (radius 34px)
- Cards: --surface, 1px --line border, radius 18px, --shadow. Icons: line icons (stroke currentColor 2.2) in --accent on a 48px --accent-soft rounded square
- Pills: radius 999px. The "Ești aici" pill: yellow #FFD54A background, #161F28 text. Member pills "M1" / "M2" in the member colors
- Page: max-width 880px, 16px side padding, flex column with a 28px gap. Footer: small muted text, top border, "Făcut la Pago"
