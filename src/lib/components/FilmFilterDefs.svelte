<!-- 去識別化 3D 膠卷風格濾鏡著色矩陣定義 (De-identified Film Emulation Matrices) -->
<svg
  style="position: absolute; width: 0; height: 0; pointer-events: none; opacity: 0;"
  aria-hidden="true"
>
  <defs>
    <!-- 1. 啞光微膠卷 (FILM_LOOK_01): 低黑階抬升、低飽和沉穩綠、柔和高反差 -->
    <filter id="filter-matte-shadow" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="
          0.98  0.03  0.00  0  0.03
          0.02  0.96  0.02  0  0.03
          0.01  0.02  0.94  0  0.04
          0.00  0.00  0.00  1  0.00
        "
      />
      <feComponentTransfer>
        <feFuncR type="linear" slope="0.92" intercept="0.04" />
        <feFuncG type="linear" slope="0.92" intercept="0.04" />
        <feFuncB type="linear" slope="0.90" intercept="0.05" />
      </feComponentTransfer>
    </filter>

    <!-- 2. 冷青翡翠 (COLOR_GRADE_02): 陰影青綠冷調、高光暖金微溫、膠卷膚色隔離保護 -->
    <filter id="filter-teal-emerald" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="
          0.88  0.08  0.00  0  -0.01
          0.02  1.04  0.04  0   0.02
          0.04  0.10  1.16  0   0.05
          0.00  0.00  0.00  1   0.00
        "
      />
      <feComponentTransfer>
        <feFuncR type="linear" slope="0.95" intercept="0.01" />
        <feFuncG type="linear" slope="1.00" intercept="0.02" />
        <feFuncB type="linear" slope="1.05" intercept="0.04" />
      </feComponentTransfer>
    </filter>

    <!-- 3. 溫潤人像 (PORTRAIT_03): 鎢絲燈光感暖調、洋紅微相移、高光柔和滾降 -->
    <filter id="filter-tungsten-soft" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="
          1.14  0.02  0.00  0   0.03
          0.02  1.02  0.02  0   0.01
          0.00  0.02  0.86  0  -0.02
          0.00  0.00  0.00  1   0.00
        "
      />
    </filter>

    <!-- 4. 高反差單色 (MONO_SILVER_04): 經典紅橙濾鏡感黑白、暗部深邃銀鹽紀實 -->
    <filter id="filter-high-contrast-mono" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.00  0.00  0.00  1  0
        "
      />
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
        <feFuncG type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
        <feFuncB type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
      </feComponentTransfer>
    </filter>
  </defs>
</svg>

