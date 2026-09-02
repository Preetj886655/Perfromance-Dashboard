# Patil Manufacturing Analytics - CSS Architecture Quick Reference Guide

**For:** Frontend development team  
**Purpose:** Understanding the CSS structure and how to make changes  
**Last Updated:** September 1, 2026  

---

## CSS File Structure Quick Reference

### 1. **tokens.css** (320 lines) - DO NOT MODIFY
The design system foundation. Contains all CSS custom properties (variables).

**When to modify:**
- Adding new colors
- Changing spacing scale
- Adding new breakpoints
- Updating typography sizes
- Adding new shadows or animations

**Never modify:** Don't remove existing tokens, only add new ones.

```css
/* Example: Adding a new color token */
--color-custom: #FF00FF;

/* Example: Adding a new spacing size */
--spacing-4xl: 80px;
```

### 2. **layout.css** (400 lines) - RARELY MODIFY
The CSS Grid layout system (sidebar 260px + content + topbar 60px).

**When to modify:**
- Changing sidebar width
- Adjusting topbar height
- Modifying grid layout structure
- Changing responsive breakpoint behavior for layout

**Don't modify:** Individual component styling (use components.css instead).

### 3. **components.css** (550 lines) - MODIFY FOR NEW COMPONENTS
Base styling for buttons, cards, forms, tables, badges, alerts.

**When to modify:**
- Adding new component base styles
- Modifying button variants
- Adding new form input styles
- Adding new card types
- Creating new UI elements

**Note:** Theme colors come from tokens.css, not here.

### 4. **animations.css** (350 lines) - ADD NEW ANIMATIONS HERE
Reusable animation definitions (fadeIn, slideUp, spin, shimmer, etc.).

**When to modify:**
- Adding new animation keyframes
- Creating new transition effects
- Adding micro-interaction animations

**Don't modify:** Component-specific animation timing.

### 5. **dashboard.css** (324 lines) - DASHBOARD-SPECIFIC ONLY
Dashboard-specific component styling (live indicators, refresh, enhanced KPI).

**When to modify:**
- Adding dashboard-specific components
- Modifying existing dashboard UI elements
- Adding slide-based navigation styling

**Don't modify:** General application styling.

### 6. **App.css** (1000+ lines) - RARELY MODIFY
Global application styles.

**Current Status:** Minimally cleaned in Phase 1 (only root/body sections updated).  
**Recommendation:** Leave as-is. Use light-theme-overrides.css for theming.

### 7. **light-theme-overrides.css** (1400+ lines) - THEME MODIFICATIONS ONLY ⭐ MAIN THEME FILE
The master light theme layer. Contains all overrides for the light professional theme.

**When to modify:**
- Changing theme colors
- Updating component styling
- Adding new component themes
- Adjusting responsive behavior for theme
- Adding new theme-specific features

**Important:** This file is loaded LAST, giving it highest specificity.

**Load Order in App.tsx (CRITICAL):**
```typescript
import './styles/tokens.css';      // 1. Design tokens
import './styles/layout.css';      // 2. Layout
import './styles/components.css';  // 3. Components
import './styles/animations.css';  // 4. Animations
import './styles/dashboard.css';   // 5. Dashboard
import './styles/App.css';         // 6. Global
import './styles/light-theme-overrides.css'; // 7. Theme (HIGHEST PRIORITY)
```

**WHY THIS ORDER MATTERS:**
- Each file builds on the previous one
- light-theme-overrides.css overrides everything else
- Ensures theme colors take precedence
- Allows minimal changes to existing files

---

## How to Modify Colors

### Option 1: Change Token (Affects everything)
**File:** `tokens.css`
```css
--color-primary: #6366F1; /* Change this */
/* All components using var(--color-primary) update automatically */
```

### Option 2: Override Specific Component
**File:** `light-theme-overrides.css`
```css
.kpi-card {
  background-color: var(--color-surface-primary) !important;
  /* This overrides any previous .kpi-card styling */
}
```

### Best Practice
1. Change tokens.css if change applies to multiple components
2. Use light-theme-overrides.css if change is component-specific
3. Always use `!important` in light-theme-overrides.css
4. Test at all 7 breakpoints after changes

---

## How to Add New Component Styling

### Step 1: Define Base Component
**File:** `components.css`
```css
.my-new-component {
  display: flex;
  padding: var(--spacing-lg);
  background-color: white; /* Will be overridden */
  border-radius: var(--border-radius-md);
}
```

### Step 2: Add Theme Overrides
**File:** `light-theme-overrides.css`
```css
.my-new-component {
  background-color: var(--color-surface-primary) !important;
  border: 1px solid var(--color-border-primary) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
}

.my-new-component:hover {
  border-color: var(--color-primary) !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15) !important;
}
```

### Step 3: Add Animation (if needed)
**File:** `animations.css`
```css
@keyframes myCustomAnimation {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.my-new-component {
  animation: myCustomAnimation var(--duration-base) var(--easing-out);
}
```

### Step 4: Test at All Breakpoints
Add responsive styles to light-theme-overrides.css:
```css
@media (max-width: 1024px) {
  .my-new-component {
    /* Tablet styles */
  }
}

@media (max-width: 768px) {
  .my-new-component {
    /* Mobile styles */
  }
}
```

---

## Color Palette Quick Reference

### Semantic Colors (Use These!)
```css
var(--color-bg-primary)          /* Page background */
var(--color-surface-primary)     /* Card surface */
var(--color-text-primary)        /* Main text */
var(--color-text-secondary)      /* Supporting text */
var(--color-text-tertiary)       /* Tertiary text */
var(--color-border-primary)      /* Subtle borders */

var(--color-primary)             /* Brand action (purple) */
var(--color-secondary)           /* Secondary (blue) */
var(--color-success)             /* Good status (green) */
var(--color-warning)             /* Warning (orange) */
var(--color-danger)              /* Critical (red) */
```

### DO NOT USE
❌ Hardcoded color values like `#FF0000`  
❌ Dark theme colors like `--bg-dark`  
❌ Old Cyber theme colors  

**Always use design tokens!**

---

## Spacing Scale Quick Reference

```css
var(--spacing-xs)     /* 4px */
var(--spacing-sm)     /* 8px */
var(--spacing-md)     /* 12px */
var(--spacing-lg)     /* 16px */
var(--spacing-xl)     /* 24px */
var(--spacing-2xl)    /* 32px */
var(--spacing-3xl)    /* 48px */
var(--spacing-4xl)    /* 64px */
```

### Common Usage
```css
padding: var(--spacing-lg);        /* Card padding */
margin-bottom: var(--spacing-md);  /* Spacing between elements */
gap: var(--spacing-md);            /* Grid/flex gap */
border-radius: var(--border-radius-lg);
```

---

## Responsive Breakpoints

### Breakpoint Sizes
```css
1920px  /* Desktop (large monitors) */
1440px  /* Desktop (standard) */
1280px  /* Laptop */
1024px  /* Tablet landscape */
768px   /* Tablet portrait */
480px   /* Mobile landscape */
375px   /* Mobile portrait */
```

### Usage Pattern
```css
/* Desktop first (default) */
.component {
  grid-template-columns: repeat(4, 1fr);
}

/* 1440px and below */
@media (max-width: 1440px) {
  .component {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 1024px and below */
@media (max-width: 1024px) {
  .component {
    grid-template-columns: 1fr;
  }
}

/* 768px and below */
@media (max-width: 768px) {
  .component {
    /* Mobile styles */
  }
}
```

### Golden Rules
✅ **DO:** Test at ALL 7 breakpoints  
✅ **DO:** Prevent horizontal scrolling  
✅ **DO:** Use flexible widths (1fr, percentages)  
✅ **DO:** Test touch interactions on mobile  

❌ **DON'T:** Use fixed widths that overflow  
❌ **DON'T:** Test only one breakpoint  
❌ **DON'T:** Assume mobile means 480px only  
❌ **DON'T:** Add unnecessary horizontal padding  

---

## Animation System Quick Reference

### Pre-Built Animations

```css
.fade-in          /* Fade in effect (200ms) */
.slide-up         /* Slide up from below (300ms) */
.slide-down       /* Slide down from above (300ms) */
.slide-left       /* Slide from right (300ms) */
.slide-right      /* Slide from left (300ms) */
.kpi-enter        /* KPI entrance (300ms) */
.spin             /* Loading spinner (1s infinite) */
.shimmer          /* Loading skeleton (2s infinite) */
.pulse            /* Pulse effect (2s infinite) */
```

### Duration Variables
```css
var(--duration-fast)    /* 150ms - micro-interactions */
var(--duration-base)    /* 200ms - standard transitions */
var(--duration-slow)    /* 300ms - entrance animations */
var(--duration-slower)  /* 500ms - major transitions */
```

### Easing Variables
```css
var(--easing-in)        /* ease-in */
var(--easing-out)       /* ease-out */
var(--easing-in-out)    /* ease-in-out */
```

### Usage Example
```css
.my-component {
  transition: all var(--duration-base) var(--easing-out);
  animation: slideUp var(--duration-slow) var(--easing-out);
}

.my-component:hover {
  transform: translateY(-2px);
}
```

### Accessibility: Respect Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Specificity Strategy

### Why We Use `!important` in light-theme-overrides.css

**Problem:** App.css has 1000+ lines with conflicting styles  
**Solution:** Use `!important` in light-theme-overrides.css (loaded last) to ensure theme applies

```css
/* In light-theme-overrides.css */
.kpi-card {
  background: var(--color-surface-primary) !important;  /* Ensures this wins */
  border: 1px solid var(--color-border-primary) !important;
}
```

### Specificity Hierarchy (Lowest to Highest)
1. Browser defaults
2. Element styles (p, div, etc.)
3. Class styles (.btn, .card)
4. Component styles (App.css)
5. Dashboard styles (dashboard.css)
6. Animation styles (animations.css)
7. **THEME STYLES (light-theme-overrides.css) ← HIGHEST**

### Best Practice
✅ Use `!important` in light-theme-overrides.css  
❌ Don't use `!important` elsewhere  
✅ Organize rules by component  
❌ Don't create new !important chains  

---

## Testing Checklist

### Before Committing Changes

- [ ] **Build Passes**
  ```bash
  npm run build  # Should complete in <1s without errors
  npm run typecheck  # Should show 0 errors
  ```

- [ ] **Visual Testing at All Breakpoints**
  - [ ] 1920px (desktop)
  - [ ] 1440px (desktop)
  - [ ] 1280px (laptop)
  - [ ] 1024px (tablet)
  - [ ] 768px (tablet)
  - [ ] 480px (mobile)
  - [ ] 375px (small mobile)

- [ ] **No Horizontal Scrolling**
  - [ ] All screens fixed width
  - [ ] Content fits viewport
  - [ ] Components don't overflow

- [ ] **Animation Testing**
  - [ ] Animations are smooth
  - [ ] No jank or lag
  - [ ] Entrance animations visible
  - [ ] Hover effects working

- [ ] **Accessibility**
  - [ ] Color contrast readable
  - [ ] Focus states visible
  - [ ] Keyboard navigation works
  - [ ] Motion preferences respected

- [ ] **Component Verification**
  - [ ] KPI cards display correctly
  - [ ] Charts render properly
  - [ ] Forms are functional
  - [ ] Buttons are clickable
  - [ ] Filters work as expected

---

## Common Tasks & How-Tos

### Change Primary Brand Color
1. Open `tokens.css`
2. Find `--color-primary: #6366F1;`
3. Change to desired color
4. All components using primary automatically update

### Add New Status Color
1. Add to `tokens.css`: `--color-status-custom: #FF00FF;`
2. Add to `light-theme-overrides.css`: `.status-pill--custom { ... }`
3. Use in components: `<span class="status-pill status-pill--custom">`

### Adjust Hover Behavior
1. Find component in `light-theme-overrides.css`
2. Modify `:hover` selector
3. Example:
```css
.btn--primary:hover {
  background-color: #5558e3 !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3) !important;
  transform: translateY(-1px) !important;
}
```

### Fix Mobile Layout Issue
1. Identify breakpoint where issue occurs
2. Add media query to `light-theme-overrides.css`:
```css
@media (max-width: 768px) {
  .component {
    /* Mobile fix here */
  }
}
```
3. Test at all smaller breakpoints

### Make Animation Faster/Slower
1. Open `tokens.css`
2. Adjust `--duration-*` values
3. Example: `--duration-fast: 100ms; /* was 150ms */`

---

## Troubleshooting

### Problem: Colors Not Changing
**Cause:** Using old color variable name  
**Solution:** Use correct token from tokens.css (e.g., `var(--color-primary)`)

### Problem: Responsive Layout Breaking
**Cause:** Not testing at all breakpoints  
**Solution:** Use DevTools responsive mode, test all 7 breakpoints

### Problem: Animation Janky
**Cause:** Animating expensive properties  
**Solution:** Stick to `transform` and `opacity`

### Problem: Overflow Horizontal Scrolling
**Cause:** Fixed widths > viewport  
**Solution:** Use flexible widths (1fr), remove fixed widths, add max-width

### Problem: !important Not Working
**Cause:** File load order wrong  
**Solution:** Verify light-theme-overrides.css loaded last in App.tsx

---

## Development Workflow

### Making CSS Changes

1. **Identify which file to modify:**
   - New component? → components.css
   - Theme color change? → tokens.css or light-theme-overrides.css
   - New animation? → animations.css
   - Dashboard specific? → dashboard.css

2. **Make changes:**
   ```bash
   cd frontend
   # Edit the appropriate .css file
   ```

3. **Test locally:**
   ```bash
   npm run build   # Verify no errors
   npm run dev     # Run dev server
   # Test at all 7 breakpoints in browser
   ```

4. **Verify build:**
   ```bash
   npm run typecheck  # Verify TS clean
   npm run build      # Verify build succeeds
   ```

5. **Commit & push:**
   ```bash
   git add frontend/src/styles/
   git commit -m "Update: [describe changes]"
   git push
   ```

---

## File Size Limits & Performance

### Current Bundle Size
- CSS: 82.62 kB (gzip: 13.51 kB)
- Total build: 536ms

### Guidelines
✅ Keep CSS additions reasonable  
✅ Target: <15 kB gzip (currently 13.51 kB)  
✅ Avoid huge animations  
✅ Monitor bundle size in CI/CD  

---

## Quick Reference Commands

```bash
# Build production
npm run build

# Type check
npm run typecheck

# Run dev server (usually already running)
npm run dev

# View bundle size
npm run build  # Shows in output

# Check for CSS errors
npm run build  # Output shows any CSS issues
```

---

## Getting Help

### CSS Issues?
1. Check if using correct token from tokens.css
2. Verify file load order in App.tsx
3. Test at ALL 7 breakpoints
4. Check browser DevTools for CSS errors
5. Look for `!important` conflicts

### Component Styling?
1. Find component in light-theme-overrides.css
2. Check tokens.css for correct color/spacing variable
3. Verify responsive breakpoint behavior
4. Test hover/focus states

### Performance Issues?
1. Check CSS file size (should be <15 kB gzip)
2. Verify animations use transform/opacity
3. Check for expensive paint operations
4. Profile in browser DevTools Performance tab

---

## Resources & Links

- **Design Tokens:** See tokens.css (320 lines)
- **Component Examples:** See components.css (550 lines)
- **Animation Reference:** See animations.css (350 lines)
- **Theme Implementation:** See light-theme-overrides.css (1400+ lines)
- **Layout System:** See layout.css (400 lines)

---

## Version Info

- **Phase 1:** Visual Foundation (600 lines CSS)
- **Phase 2:** Dashboard Polish (800+ lines CSS)
- **Total CSS:** 1400+ lines in light-theme-overrides.css
- **Build Status:** Passing (0 errors)
- **Last Updated:** September 1, 2026

---

**For questions or issues, refer to the PHASE_1_2_COMPLETION_REPORT.md for full context and implementation details.**
