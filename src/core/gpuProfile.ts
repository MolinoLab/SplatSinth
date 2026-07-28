export type GpuTier = "low" | "medium" | "high";

export type GpuProfile = {
  tier: GpuTier;
  /** Texto del renderer WebGL (si está disponible). */
  label: string;
  maxTextureSize: number;
};

/** Estima tier a partir de WebGL; heurística, no garantía de FPS real. */
export function detectGpuProfile(): GpuProfile {
  const fallback: GpuProfile = { tier: "medium", label: "desconocida", maxTextureSize: 4096 };
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) return fallback;

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg
      ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);

    let tier: GpuTier = "medium";
    if (
      /swiftshader|llvmpipe|basic render|microsoft basic/i.test(renderer) ||
      maxTextureSize < 4096
    ) {
      tier = "low";
    } else if (
      /nvidia|geforce rtx|geforce gtx 16|geforce gtx 20|geforce gtx 30|geforce gtx 40|radeon rx [67]|apple gpu|apple m[1-9]/i.test(
        renderer,
      ) ||
      (maxTextureSize >= 16384 && !/intel|uhd|iris xe|hd graphics|hd 6/i.test(renderer))
    ) {
      tier = "high";
    } else if (/intel|uhd|iris|hd graphics|hd 6|mali|adreno 6/i.test(renderer)) {
      tier = "low";
    }

    return { tier, label: renderer || "WebGL", maxTextureSize };
  } catch {
    return fallback;
  }
}

export const SAMPLE_POINTS_MIN = 25_000;
export const SAMPLE_POINTS_MAX = 600_000;

export function defaultSamplePointsForTier(tier: GpuTier): number {
  switch (tier) {
    case "low":
      return 120_000;
    case "medium":
      return 300_000;
    case "high":
      return 600_000;
  }
}

export function samplePointsToSlider(n: number): number {
  const lo = Math.log(SAMPLE_POINTS_MIN);
  const hi = Math.log(SAMPLE_POINTS_MAX);
  const v = Math.min(SAMPLE_POINTS_MAX, Math.max(SAMPLE_POINTS_MIN, n));
  return (Math.log(v) - lo) / (hi - lo);
}

export function sliderToSamplePoints(t: number): number {
  const lo = Math.log(SAMPLE_POINTS_MIN);
  const hi = Math.log(SAMPLE_POINTS_MAX);
  return Math.round(Math.exp(lo + Math.min(1, Math.max(0, t)) * (hi - lo)));
}
