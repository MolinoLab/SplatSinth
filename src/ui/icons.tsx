import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 15, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="btn-icon"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconApply = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const IconSave = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Icon>
);

export const IconAdd = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconExamples = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);

export const IconClear = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" />
  </Icon>
);

export const IconAudio = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a6 6 0 0 1 0 10" />
  </Icon>
);

export const IconAudioOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M16 10.5 20.5 15M20.5 10.5 16 15" />
  </Icon>
);

export const IconTracks = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
    <circle cx="18" cy="17" r="2" />
  </Icon>
);

export const IconLoop = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 1v4h-4" />
    <path d="M20 8A8 8 0 1 0 18.5 17" />
    <path d="M7 23v-4h4" />
    <path d="M4 16a8 8 0 0 0 1.5-9" />
  </Icon>
);

export const IconFullscreen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const IconFullscreenExit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 14h3v3M20 10h-3V7M14 4h-3V1M10 20H7v-3" />
  </Icon>
);

export const IconKeyboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="7" width="20" height="11" rx="2" />
    <path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01M8 15h8" />
  </Icon>
);

/** Nota sostenida / latch. */
export const IconHold = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2v8l3 3" />
    <circle cx="12" cy="14" r="8" />
  </Icon>
);

export const IconSketch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4h9l3 3v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M17 4v3h3M9 12h7M9 16h5" />
  </Icon>
);

export const IconScene = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </Icon>
);

export const IconBeam = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h10" />
    <path d="M14 8v8l6-4-6-4z" />
  </Icon>
);

export const IconTutorial = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 2" />
    <path d="M12 17h.01" />
  </Icon>
);

export const IconCommands = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 8 3 12l4 4M17 8l4 4-4 4M13 6l-2 12" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M4.9 6.5l1.4 1.4M17.7 16.1l1.4 1.4M3 12h2M19 12h2M4.9 17.5l1.4-1.4M17.7 7.9l1.4-1.4" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6v12l10-6-10-6z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPost = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
);
