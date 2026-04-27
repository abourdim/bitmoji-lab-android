# Play Store listing — Bitmoji Lab (مختبر بيتموجي)

Draft copy for Google Play Console "Main store listing" page. Play Console accepts separate translations per language — upload all three.

---

## Metadata (common to all languages)

- **Package name**: `org.workshopdiy.bitmojilab`
- **Category**: `Books & Reference` (primary), `Education` (secondary if allowed)
- **Tags**: Islamic studies, Arabic, trilingual, education, al-Ghazali
- **Contact email**: `abdelhak.bourdim@gmail.com`
- **Website**: `https://workshop-diy.org`
- **Privacy policy URL**: REQUIRED — host a simple page (see template at end of this file).
- **Content rating**: Everyone (no violence, no gambling, no mature content).
- **Ads**: No.
- **In-app purchases**: No.
- **Data safety**: No data collected, no data shared.

---

## Arabic (ar) — primary

### App name (≤30 chars)
```
مختبر بيتموجي
```

### Short description (≤80 chars)
```
فن LED من الإيموجي — لوّن وأرسل إلى micro:bit عبر البلوتوث
```

### Full description (≤4000 chars)
```
🎨 مختبر بيتموجي

حوّل الإيموجي إلى فن LED على micro:bit. اختر من ١٠٠+ إيموجي، لوّن بألوان قوس قزح، أرسل لاسلكيًا إلى micro:bit، شاهدها تتوهج على شاشة LED 8×8 أو 16×16.

— من workshop-diy.org
```

---

## English (en)

### App name
```
Bitmoji Lab — Bitmoji Lab
```

### Short description
```
Emoji-to-LED-art — paint emojis, send to micro:bit via BLE
```

### Full description
```
🎨 Bitmoji Lab

Turn emojis into glowing LED art on a micro:bit. Pick from 100+ emojis, paint with rainbow colors, send wirelessly to your micro:bit, watch them glow on an 8×8 or 16×16 LED matrix. Save designs, watch animations and demos.

— From workshop-diy.org
```

---

## French (fr)

### App name
```
Bitmoji Lab — Bitmoji Lab
```

### Short description
```
Emojis-en-art-LED — colorez et envoyez à un micro:bit BLE
```

### Full description
```
🎨 Bitmoji Lab

Transformez les emojis en art LED sur un micro:bit. Choisissez parmi 100+ emojis, peignez en couleurs arc-en-ciel, envoyez sans fil à votre micro:bit, regardez-les briller sur une matrice LED 8×8 ou 16×16.

— De workshop-diy.org
```

---

## Graphics needed (minimum)

| Asset | Size | Source |
|---|---|---|
| App icon | 512×512 PNG | `store-assets/play-store-icon-512.png` (regenerate per book) |
| Feature graphic | 1024×500 PNG | `store-assets/feature-graphic.png` (render from `feature-graphic.html`) |
| Phone screenshots | min 2, 320–3840px, 16:9 portrait | Capture from emulator / real device |
| 7" tablet screenshots (optional) | min 2, 1024×600+ | Run emulator with tablet profile |

Screenshots to capture (book-specific — adjust list to actual app screens):
1. Home / cover / introduction
2. Main content navigation
3. Reading or interaction mode
4. Quiz or self-assessment (if applicable)
5. Theme switch (optional — shows the 3 variants)

---

## Privacy policy template

Copy to a public page (GitHub Pages works). Change email + date.

```
Privacy Policy — Bitmoji Lab
Last updated: 2026-04-27

The Bitmoji Lab app does not collect, store, transmit, or share any personal
data. All content is bundled with the app and runs entirely on your device.
The app does not use analytics, advertising networks, crash reporters, or
third-party SDKs.

The app requires no special permissions beyond internet access, which is
used only to load the occasional external link (e.g. workshop-diy.org) if
you tap it — never silently in the background.

If you have questions, contact: abdelhak.bourdim@gmail.com
```
