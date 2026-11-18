# 大相無形 / Slipknotting on Heaven's Door

[繁體中文](README.md) | [English](README.en.md) | **日本語**

> *“It's gettin' dark, too dark for me to see / I can't shoot them anymore.”*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Desktop & Mobile](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-6082b6.svg)](#)
[![Core: Tauri v2 + Rust](https://img.shields.io/badge/Core-Tauri%20v2%20%2B%20Rust-d4a373.svg)](#)
[![Design: Alexandria Darkroom](https://img.shields.io/badge/Design-Alexandria%20Darkroom-4b6b94.svg)](#)
[![Live Demo: Cloudflare Pages](https://img.shields.io/badge/Live%20Demo-Cloudflare%20Pages-F38020.svg)](https://slipknot-door.pages.dev/)

> 🌐 **オンラインデモ (Cloudflare Pages)**：[https://slipknot-door.pages.dev/](https://slipknot-door.pages.dev/)

**クロスプラットフォーム AI スマート現像室** — 煩雑なレタッチ作業を省くために設計された、ローカルファースト（Local-first）な RAW 写真ワークステーション。
「取り込み ➔ セレクト ➔ 現像 ➔ アーカイブ」を最も直感的な 3 ステップに凝縮しました：

| ステップ | コア体験 | 解決する課題 |
| :--- | :--- | :--- |
| **1. 即時セレクト** | カード挿入ですぐ表示・高速選別 | 長い RAW 現像待ちを排除し、フルサイズプレビューを即座に表示。PC のキーボードやモバイルのスワイプ操作で素早く選別できます。 |
| **2. AI スマート現像** | ワンクリック構図補正 & フィルム調カラー | 水平補正、トリミング、ホワイトバランス、露出・階調を自動調整し、内蔵 **OKLab 3D LUT** から最適な色調を提案（即時比較・一括現像対応）。 |
| **3. スマート書き出し** | 自動分類 + SNS キャプション生成 | シーンやスタイル別にサブフォルダを自動作成してオリジナル RAW をバックアップし、SNS 投稿文やハッシュタグもワンクリックで生成します。 |

---

## 名前の由来

現代のデジタル写真で最も消耗するのは、撮影後の長い取り込みとパラメータ調整です。本プロジェクトの中英語名は、東洋哲学とロックの反骨精神の両面からツールの理念を表しています：

* **漢字名「大相無形」**  
  『老子道徳経』の「大象無形」に由来し、「象」を写真や万象の「相」に置き換えました。最高の現像ツールは黒子に徹するべきであり、肥大化したメニューやブランドフィルターの謳い文句を離れ、純粋な光と影、構図の本質へと立ち返ります。
* **英語コードネーム `Slipknotting on Heaven's Door`**  
  ボブ・ディランの名曲『Knockin' on Heaven's Door』とヘヴィメタルバンド Slipknot を掛け合わせたダブルミーニングです：
  * **"Too dark to see / Can't shoot them anymore"**：未現像 RAW の真っ暗な画面と、終わらないレタッチ作業によって「もうシャッターを切りたくない」と感じる撮影疲れを重ねています。
  * **Knockin' から Slipknotting（引き結び）へ**：引き結びは一引きでほどける結び目です。ドアの前で控えめにノックするのではなく、軽量 AI とローカルリアルタイム描画によって、従来の現像室の煩わしさを一引きで解き放ちます。

> **「底層では引き結びで煩雑な現像室を解き、表層では無形の姿で万象を見通す。」**

---

## 対応フォーマット

主要なカメラメーカーの RAW データおよび標準画像フォーマットに対応（Adobe / DaVinci Resolve 形式のカスタム `.cube` 3D LUT の読み込みも可能）：

| カテゴリ | 対応拡張子 |
| :--- | :--- |
| **Sony / Canon / Nikon** | `.ARW`, `.SRF`, `.SR2` / `.CR2`, `.CR3`, `.CRW` / `.NEF`, `.NRW` |
| **Fujifilm / Panasonic / OM** | `.RAF` / `.RW2` / `.ORF` |
| **Pentax / Leica / Sigma / Samsung** | `.PEF`, `.PTX` / `.RWL` / `.X3F` / `.SRW` |
| **中判 (Hasselblad / Phase One)** | `.3FR`, `.FFF` / `.IIQ` |
| **オープン規格・一般画像** | `.DNG`, `.JPG`, `.JPEG`, `.PNG`, `.WEBP` |

---

## 3D LUT カラーサイエンス & 謝辞

商用ブランドのフィルター名称を排し、`Standard`（原色スルー）に加えて **OKLab 知覚均等色空間** に基づいて数学的に生成された **10 種類の 33×33×33 `.cube` 3D LUT** を内蔵しています（元プロジェクト：[t0saki/lumix-original-looks](https://github.com/t0saki/lumix-original-looks)）：

* **Long Toe（ロングトゥ）**：シャドウの階調を豊かに保ち、黒潰れを防ぎます。
* **Highlight Compression（ハイライト圧縮）**：明部のロールオフを滑らかにし、色飛びやトーンジャンプを抑えます。
* **詳細なカラー仕様とメンテナンス**：[`static/luts/README.md`](static/luts/README.md) をご覧ください。

<details>
<summary>内蔵 11 種類の匿名化プロファイル対照表を展開 (Profile_00 ~ Profile_10)</summary>

| ID | 名称 | `.cube` ファイル | 光学特性と推奨シーン |
| :--- | :--- | :--- | :--- |
| `NATURAL_00` | **Standard · 原色ナチュラル** | *(Bypass)* | 色の脚色を加えず、カメラ本来のダイナミックレンジを保持します。 |
| `FIELD_01` | **Fieldnote · デイリーネガ** | `Fieldnote.cube` | C-41 日常スナップ向けネガ。スレートシアンのシャドウと麦わら色のハイライト。 |
| `HEART_02` | **Heartland · ポートレートネガ** | `Heartland.cube` | 人物や室内の暖色光向け。赤かぶりを抑えながら肌色を自然に保護します。 |
| `MERIDIAN_03` | **Meridian · クリアデイライト** | `Meridian.cube` | 偏りのないニュートラルなグレー軸。晴天の屋外や建築スナップに最適。 |
| `MATINEE_04` | **Matinee · シネマプリント** | `Matinee.cube` | 劇場用フィルムプリントのような深い黒と物語性のあるコントラスト。 |
| `POSTCARD_05` | **Postcard · リバーサル純色** | `Postcard.cube` | ポジフィルムのような高い色純度と抜けの良い発色。 |
| `SKYLIGHT_06` | **Skylight · ハイダイナミック** | `Skylight.cube` | シャドウを持ち上げハイライトを抑え、逆光や高コントラストな場面を救済します。 |
| `NIGHT_07` | **NightMarket · 夜市アンバー** | `NightMarket.cube` | 夜のミックス光向け。タングステン・ナトリウム灯を琥珀色に整え LED 破綻を防ぎます。 |
| `DUSK_08` | **DuskTide · ブルーアワー** | `DuskTide.cube` | 夕暮れ時の深いインディゴの影と暖かな街灯の対比を描き出します。 |
| `CANOPY_09` | **Canopy · 森の緑階調** | `Canopy.cube` | 日陰の青緑と透過光の黄緑を分離し、森林や自然風景に立体感を与えます。 |
| `LOWSUN_10` | **Lowsun · ゴールデンアワー** | `Lowsun.cube` | 斜光のゴールデンアワー専用。琥珀色のハイライトとクールな青のシャドウを対比。 |

</details>

---

## クイックスタート

```bash
# 1. 依存パッケージのインストール
npm install

# 2. Web フロントエンド開発サーバーの起動
npm run dev

# 3. Tauri デスクトップネイティブアプリの起動
npm run tauri dev

# 4. 型・構文チェック / 現像ループ検証の実行
npm run check
npm run test:darkroom
```
