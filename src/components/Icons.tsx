/** Unified vector icons — 24 viewBox, stroke 1.75 */
const s = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconHome() {
  return (
    <svg {...s}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}
export function IconTx() {
  return (
    <svg {...s}>
      <path d="M7 10h14" />
      <path d="M17 6l4 4-4 4" />
      <path d="M17 14H3" />
      <path d="M7 18l-4-4 4-4" />
    </svg>
  );
}
export function IconGoal() {
  return (
    <svg {...s}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconSim() {
  return (
    <svg {...s}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </svg>
  );
}
export function IconSettings() {
  return (
    <svg {...s}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
    </svg>
  );
}
export function IconPlus() {
  return (
    <svg {...s} width={20} height={20}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconMore() {
  return (
    <svg {...s} width={20} height={20}>
      <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconCash() {
  return (
    <svg {...s} width={18} height={18}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="12" cy="14" r="1.5" />
    </svg>
  );
}

export function IconUser() {
  return <svg {...s}><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.25 2.84-5 6.5-5s5.85 1.75 6.5 5" /></svg>;
}

export function IconLock() {
  return <svg {...s}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><path d="M12 14v2" /></svg>;
}

export function IconShield() {
  return <svg {...s}><path d="M12 3 19 6v5c0 4.6-2.8 7.8-7 10-4.2-2.2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export function IconSync() {
  return <svg {...s}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.2 9A6.5 6.5 0 0 1 17 6l3 1" /><path d="M17.8 15A6.5 6.5 0 0 1 7 18l-3-1" /></svg>;
}

export function IconArchive() {
  return <svg {...s}><path d="M4 7h16v13H4z" /><path d="M3 4h18v3H3z" /><path d="M9 12h6" /></svg>;
}

export function IconSliders() {
  return <svg {...s}><path d="M4 7h16M4 17h16M8 7v4M16 13v4" /><circle cx="8" cy="11" r="2" /><circle cx="16" cy="13" r="2" /></svg>;
}

export function IconLanguage() {
  return <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
}

export function IconChevronRight() {
  return <svg {...s} width={18} height={18}><path d="m9 5 6 7-6 7" /></svg>;
}

export function IconChevronLeft() {
  return <svg {...s} width={18} height={18}><path d="m15 5-6 7 6 7" /></svg>;
}

export function IconClose() {
  return <svg {...s} width={18} height={18}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function IconDownload() {
  return <svg {...s}><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 20h14" /></svg>;
}

export function IconUpload() {
  return <svg {...s}><path d="M12 14V3" /><path d="m8 7 4-4 4 4" /><path d="M5 20h14" /></svg>;
}

export function IconLifebuoy() {
  return <svg {...s}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m6.35 6.35 3.55 3.55m4.2 4.2 3.55 3.55m0-11.3-3.55 3.55m-4.2 4.2-3.55 3.55" /></svg>;
}
