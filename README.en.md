# Slipknotting on Heaven's Door / 大相無形

[繁體中文](README.md) | **English** | [日本語](README.ja.md)

> *“It's gettin' dark, too dark for me to see / I can't shoot them anymore.”*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Desktop & Mobile](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-6082b6.svg)](#)
[![Core: Tauri v2 + Rust](https://img.shields.io/badge/Core-Tauri%20v2%20%2B%20Rust-d4a373.svg)](#)
[![Design: Alexandria Darkroom](https://img.shields.io/badge/Design-Alexandria%20Darkroom-4b6b94.svg)](#)
[![Live Demo: Cloudflare Pages](https://img.shields.io/badge/Live%20Demo-Cloudflare%20Pages-F38020.svg)](https://slipknot-door.pages.dev/)

> 🌐 **Live Demo (Cloudflare Pages)**: [https://slipknot-door.pages.dev/](https://slipknot-door.pages.dev/)

**Cross-platform AI Smart Darkroom** — A local-first RAW photo workstation designed to eliminate tedious post-processing workflows.
Condense "Import ➔ Cull ➔ Grade ➔ Archive" into 3 intuitive steps:

| Step | Core Experience | Pain Point Solved |
| :--- | :--- | :--- |
| **1. Instant Culling** | Plug-and-view, rapid selection | Skip slow RAW transcoding; open full-size previews instantly with keyboard shortcuts on desktop or touch gestures on mobile. |
| **2. AI Smart Development** | One-click framing & film-grade toning | Automatically levels horizons, crops composition, corrects white balance & tone, and recommends the best **OKLab 3D LUT** (with live comparison & batch grading). |
| **3. Smart Export & Archive** | Auto-categorization + social captions | Automatically organizes export subfolders by scene or style, backs up original RAWs, and generates social media posts & hashtags in one click. |

---

## Etymology

This project addresses the most exhausting part of modern digital photography: no matter how crisp the shoot, endless importing and slider tweaking often drain the joy out of shooting. Both names define the spirit of this tool from Eastern philosophy and rock 'n' roll rebellion:

* **Chinese Name: 「大相無形」 (The Great Image Has No Form)**  
  Adapted from the *Tao Te Ching* phrase 「大象無形」, substituting 「象」 with 「相」 (photographs and all phenomena). The best darkroom tool stays out of the way—freeing photographers from bloated menus and branded filter jargon, returning to pure light, shadow, and composition.
* **English Codename: `Slipknotting on Heaven's Door`**  
  A play on Bob Dylan's classic *"Knockin' on Heaven's Door"* fused with the heavy metal band Slipknot:
  * **"Too dark to see / Can't shoot them anymore"**: Echoes both the pitch-black unrendered RAW file and the burnout of endless retouching that makes you never want to press the shutter again.
  * **From Knockin' to Slipknotting**: A slipknot unties with a single pull. Instead of politely knocking on the door, lightweight AI and local real-time rendering untie the knots of traditional darkrooms in one pull.

> **“Untie the complex darkroom with a slipknot beneath; reveal all forms with formless clarity above.”**

---

## Supported Formats

Compatible with mainstream camera RAW negatives and standard image formats (also supports custom Adobe / DaVinci Resolve `.cube` 3D LUTs):

| Category | Supported Extensions |
| :--- | :--- |
| **Sony / Canon / Nikon** | `.ARW`, `.SRF`, `.SR2` / `.CR2`, `.CR3`, `.CRW` / `.NEF`, `.NRW` |
| **Fujifilm / Panasonic / OM** | `.RAF` / `.RW2` / `.ORF` |
| **Pentax / Leica / Sigma / Samsung** | `.PEF`, `.PTX` / `.RWL` / `.X3F` / `.SRW` |
| **Medium Format (Hasselblad / Phase One)** | `.3FR`, `.FFF` / `.IIQ` |
| **Open Standards & General Images** | `.DNG`, `.JPG`, `.JPEG`, `.PNG`, `.WEBP` |

---

## 3D LUT Color Science & Acknowledgments

Dropping commercial brand filter names, this project includes `Standard` natural bypass and **10 mathematically generated 33×33×33 `.cube` 3D LUTs in OKLab perceptually uniform color space** (based on [t0saki/lumix-original-looks](https://github.com/t0saki/lumix-original-looks)):

* **Long Toe**: Preserves airy shadow detail without crushed blacks.
* **Highlight Compression**: Smooth highlight roll-off that prevents harsh clipping and banding.
* **Full Color Specs & Maintenance**: See [`static/luts/README.md`](static/luts/README.md).

<details>
<summary>Expand to view all 11 built-in de-identified profiles (Profile_00 ~ Profile_10)</summary>

| ID | Name | `.cube` File | Optical Characteristics & Recommended Scenes |
| :--- | :--- | :--- | :--- |
| `NATURAL_00` | **Standard · Natural Bypass** | *(Bypass)* | Zero stylistic bias; preserves native camera dynamic range. |
| `FIELD_01` | **Fieldnote · Daily Negative** | `Fieldnote.cube` | C-41 everyday documentary negative with slate-cyan shadows and straw-gold highlights. |
| `HEART_02` | **Heartland · Warm Portrait** | `Heartland.cube` | Tuned for portraits and warm indoor light; protects skin tones without red cast. |
| `MERIDIAN_03` | **Meridian · Clear Daylight** | `Meridian.cube` | Neutral gray axis with zero drift; ideal for clear outdoor and architectural photography. |
| `MATINEE_04` | **Matinee · Cinema Print** | `Matinee.cube` | Theatrical print density with deep blacks and narrative contrast. |
| `POSTCARD_05` | **Postcard · Pure Slide** | `Postcard.cube` | Reversal slide color purity and micro-density boost; crisp and translucent. |
| `SKYLIGHT_06` | **Skylight · High-DR Recovery** | `Skylight.cube` | Lifted shadows with compressed highlights to rescue high-contrast and backlit scenes. |
| `NIGHT_07` | **NightMarket · Amber Night** | `NightMarket.cube` | Calibrated for mixed night lighting; turns tungsten/sodium lamps amber-gold and resists LED banding. |
| `DUSK_08` | **DuskTide · Blue Hour** | `DuskTide.cube` | Twilight blue-hour contrast pairing deep indigo shadows with warm golden lights. |
| `CANOPY_09` | **Canopy · Forest Depth** | `Canopy.cube` | Separates shaded cyan-greens from backlit yellow-greens for lush foliage and nature. |
| `LOWSUN_10` | **Lowsun · Golden Hour** | `Lowsun.cube` | Golden-hour backlight profile contrasting warm amber highlights against cool blue shadows. |

</details>

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Web frontend dev server
npm run dev

# 3. Start Tauri desktop native app
npm run tauri dev

# 4. Run type/syntax check & darkroom loop verification
npm run check
npm run test:darkroom
```
