/**
 * Central Motion System & Physics Tokens for Patil Manufacturing Analytics
 * Built with motion/react (Framer Motion replacement)
 */

import type { Variants, Transition } from "motion/react";

// Standard Physics Springs
export const springMicro: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const springSmooth: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 0.8,
};

export const springBounce: Transition = {
  type: "spring",
  stiffness: 350,
  damping: 22,
};

// Timing curves
export const easeInOutSmooth: Transition = {
  duration: 0.28,
  ease: [0.25, 0.1, 0.25, 1.0],
};

// Container Stagger
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.03,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.15,
    },
  },
};

// Card Entry & Hover
export const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: springSmooth,
  },
  hover: {
    y: -3,
    transition: springMicro,
  },
};

// Specialized KPI Tile Entry
export const kpiCardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springSmooth,
  },
  hover: {
    y: -2,
    transition: springMicro,
  },
  tap: {
    scale: 0.985,
    transition: springMicro,
  },
};

// Directional Carousel Slide Transition
export const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.22, ease: "easeOut" },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
    transition: {
      duration: 0.16,
      ease: "easeIn",
    },
  }),
};

// Collapsible Panel (Accordion / Filter)
export const accordionVariants: Variants = {
  collapsed: {
    opacity: 0,
    height: 0,
    overflow: "hidden",
    transition: {
      duration: 0.2,
      ease: [0.04, 0.62, 0.23, 0.98],
    },
  },
  expanded: {
    opacity: 1,
    height: "auto",
    overflow: "visible",
    transition: {
      duration: 0.25,
      ease: [0.04, 0.62, 0.23, 0.98],
    },
  },
};

// Top Navigation & Header
export const headerVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springMicro,
  },
};

// Button Micro-interactions
export const buttonMotion = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: springMicro,
};

// Page Transition
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.15,
      ease: "easeIn",
    },
  },
};
