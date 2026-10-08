// Glock frames measured from flat side photos (reference only; the photos are not part of the site).
// Inches, x from the slide's rear, y down from the slide's top, muzzle to the right.
// Outline, guard opening and floor plate come from the photo's silhouette (scripts/pistol-profiles/photos.py);
// the details are read off a 0.1" grid laid over the same photo.

export interface GlockPhoto {
  /** Slide height (top flat to the frame) and the bottom of the grip's magazine well. */
  sb: number; gb: number;
  /** Frame outline and floor plate (closed polylines), and the trigger guard opening's box [x0, y0, x1, y1]. */
  frame: number[]; hole: [number, number, number, number]; plate: number[];
  slideStop: [number, number, number, number]; takedown: [number, number, number, number]; triggerPin: [number, number, number];
  housingPin: [number, number, number]; magCatch: [number, number, number, number];
  /** Back strap seam, and the rear edge of the textured side panel, top to bottom. */
  seam: number[]; panelRear: number[];
  /** Top and bottom of the textured side panel, and the molded logo. */
  texTop: number; texBottom: number; logo: [number, number, number, number];
  serrations: { x: number[]; w: number; y0: number; y1: number };
  /** Trigger shoe and its safety blade, as paths (M, Q, Z in inches). */
  trigger: string; triggerLine: string;
}

export const GLOCK_PHOTOS: Record<string, GlockPhoto> = {
  // Glock 17 Gen5, Wikimedia Commons "Glock 17 Gen 5 Gun white bg crop.png" (CC BY 2.0), calibrated to the 7.32" slide.
  g17gen5: {
    sb: 0.84, gb: 5.0,
    frame: [-0.578, 4.76, -0.544, 4.803, -0.473, 4.858, -0.233, 4.997, 1.58, 4.99, 1.605, 4.967, 1.619, 4.926, 1.627, 4.717, 1.659, 4.567, 1.933, 3.815, 2.355, 2.749, 2.412, 2.635, 2.488, 2.559, 2.581, 2.514, 2.695, 2.508, 2.766, 2.529, 2.959, 2.622, 3.151, 2.657, 4.601, 2.611, 4.635, 2.585, 4.645, 2.545, 4.595, 2.376, 4.569, 2.231, 4.563, 1.799, 4.58, 1.723, 4.612, 1.652, 4.659, 1.59, 4.715, 1.542, 4.798, 1.5, 4.888, 1.486, 5.644, 1.481, 6.164, 1.462, 6.225, 1.446, 6.269, 1.391, 6.298, 1.379, 6.338, 1.388, 6.378, 1.439, 6.409, 1.451, 7.006, 1.431, 7.119, 1.447, 7.151, 1.42, 7.249, 1.245, 7.273, 1.069, 7.272, 0.853, 7.243, 0.839, 0.006, 0.843, -0.026, 0.912, -0.083, 0.97, -0.109, 1.072, -0.097, 1.131, -0.04, 1.177, 0.121, 1.197, 0.24, 1.239, 0.337, 1.298, 0.417, 1.369, 0.494, 1.473, 0.544, 1.59, 0.568, 1.716, 0.563, 1.851, 0.467, 2.227, 0.383, 2.469, 0.25, 2.794, 0.098, 3.098, -0.242, 3.671, -0.43, 4.055, -0.538, 4.392, -0.585, 4.639],
    hole: [2.71, 1.51, 4.32, 2.47],
    plate: [-0.116, 5.335, -0.089, 5.391, -0.062, 5.406, -0.026, 5.411, 1.393, 5.364, 1.473, 5.344, 1.584, 5.264, 1.609, 5.216, 1.616, 5.133, 1.597, 5.09, 1.557, 5.068, 1.405, 5.069, 1.343, 5.05, 0.034, 5.05, 0.007, 5.065, -0.08, 5.192, -0.111, 5.285],
    slideStop: [1.97, 0.87, 2.37, 1.15], takedown: [3.66, 1.0, 3.83, 1.32], triggerPin: [3.29, 1.29, 0.075],
    housingPin: [0.77, 1.93, 0.075], magCatch: [1.97, 1.97, 2.47, 2.41],
    seam: [0.9, 1.49, 0.79, 2.23, 0.6, 2.83, 0.29, 3.39, 0.03, 3.83, -0.22, 4.47, -0.29, 4.95],
    panelRear: [0.95, 2.25, 0.8, 2.75, 0.55, 3.3, 0.34, 3.78, 0.15, 4.35, 0.1, 4.62],
    texTop: 2.28, texBottom: 4.62, logo: [0.32, 3.78, 0.81, 4.21],
    serrations: { x: [0.4, 0.61, 0.81, 1.0, 1.2, 1.41, 1.61], w: 0.095, y0: 0.09, y1: 0.84 },
    trigger: 'M3.06,1.51 Q3.05,1.98 3.4,2.36 Q3.5,2.45 3.62,2.37 Q3.64,2.33 3.6,2.28 Q3.38,2.02 3.33,1.51 Z',
    triggerLine: 'M3.19,1.6 Q3.2,1.98 3.5,2.31',
  },
};
