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
