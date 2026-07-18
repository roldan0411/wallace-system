// ============================================================
//  LOGO DE WALLACE SYSTEM (esmeralda) — SVG vectorial
//  WALLACE COMPANY SYSTEM — Ing. Roldán Aldana
// ============================================================
// Logo por defecto para negocios que no suben el suyo (vacío = usa el nombre)
window.LOGO_DEFAULT = '';

// Logo de la marca Wallace System (se usa en el login)
window.WALLACE_LOGO = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
  <defs>
    <radialGradient id="wsGlow" cx="50%" cy="45%" r="62%">
      <stop offset="0%" stop-color="#0d3d33"/>
      <stop offset="70%" stop-color="#0a1a18"/>
      <stop offset="100%" stop-color="#080b10"/>
    </radialGradient>
    <linearGradient id="wsTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7df0cd"/>
      <stop offset="100%" stop-color="#43dfae"/>
    </linearGradient>
    <linearGradient id="wsLeft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12b489"/>
      <stop offset="100%" stop-color="#0c8f6b"/>
    </linearGradient>
    <linearGradient id="wsRight" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e9d78"/>
      <stop offset="100%" stop-color="#0a7a5e"/>
    </linearGradient>
    <linearGradient id="wsBright" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#2ff5b8"/>
      <stop offset="100%" stop-color="#0ad197"/>
    </linearGradient>
    <linearGradient id="wsPale" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#a8f5db"/>
      <stop offset="100%" stop-color="#5fe3bc"/>
    </linearGradient>
    <linearGradient id="wsDeep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b7a5e"/>
      <stop offset="100%" stop-color="#07634c"/>
    </linearGradient>
    <linearGradient id="wsBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e9878"/>
      <stop offset="100%" stop-color="#0b8064"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="118" fill="#0a0d14"/>
  <rect width="512" height="512" rx="118" fill="url(#wsGlow)"/>

  <g>
    <path d="M183 128 L329 128 L305 162 L207 162 Z" fill="url(#wsTop)"/>
    <path d="M183 128 L207 162 L162 207 L128 183 Z" fill="#17c795"/>
    <path d="M329 128 L384 183 L350 207 L305 162 Z" fill="#12a883"/>
    <path d="M128 183 L162 207 L162 305 L128 329 Z" fill="url(#wsLeft)"/>
    <path d="M384 183 L384 329 L350 305 L350 207 Z" fill="url(#wsRight)"/>
    <path d="M128 329 L162 305 L207 350 L183 384 Z" fill="#12b489"/>
    <path d="M384 329 L329 384 L305 350 L350 305 Z" fill="#12b489"/>
    <path d="M183 384 L207 350 L305 350 L329 384 Z" fill="url(#wsBottom)"/>
    <path d="M207 162 L305 162 L350 207 L350 305 L305 350 L207 350 L162 305 L162 207 Z" fill="#0d8f6f"/>
    <path d="M162 207 L207 162 L256 211 L207 260 Z" fill="#10a880"/>
    <path d="M256 211 L305 162 L350 207 L256 303 Z" fill="url(#wsPale)"/>
    <path d="M162 207 L207 260 L256 211 L256 303 L207 350 L162 305 Z" fill="url(#wsBright)"/>
    <path d="M350 207 L350 305 L305 350 L207 350 L256 303 Z" fill="url(#wsDeep)"/>
    <path d="M207 350 L305 350 L288 333 L224 333 Z" fill="#0a7a5e" opacity=".55"/>
    <path d="M256 211 L350 207" stroke="#0d8f6f" stroke-width="1.5" opacity=".5"/>
  </g>
</svg>`;
