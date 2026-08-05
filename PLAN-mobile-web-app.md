# Mobile Web App (PWA) Settings Plan

## Overview

Configure Manifold as a Progressive Web App (PWA) with the name "Manifold". Set the background and theme colors to "Orange Light" (`#fffbf6`) and configure the display mode to `standalone` so it looks like a native application when installed on mobile devices.

## Project Type

**WEB** (Next.js Pages Router)

## Success Criteria

- [x] Users can install "Manifold" to their home screen on mobile devices.
- [x] The app launches in standalone mode without browser UI.
- [x] The splash screen and status bar match the Orange Light theme color (`#fffbf6`).
- [x] The app icon uses the Manifold brand logo.

## Tech Stack

- **Next.js (Pages Router):** Modify `<Head>` via `pages/_document.tsx` and `pages/_app.tsx`.
- **Web App Manifest:** `public/site.webmanifest` for PWA configurations.
- **Images/Icons:** Resize `manifold-logo.png` into standard PWA sizes (192x192, 512x512) and Apple Touch Icon.

## File Structure

```text
├── public/
│   ├── site.webmanifest          # NEW: PWA Manifest file
│   └── images/
│       └── brand/
│           ├── icon-192x192.png  # NEW: PWA Icon
│           ├── icon-512x512.png  # NEW: PWA Icon
│           └── apple-icon.png    # NEW: Apple Touch Icon
├── pages/
│   ├── _app.tsx                  # MODIFY: Add <Head> for theme-color
│   └── _document.tsx             # NEW/MODIFY: Add manifest & apple meta tags
```

## Task Breakdown

### Task 1: Generate PWA Icons

- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Priority:** P1
- **Dependencies:** None
- **INPUT:** `public/images/brand/manifold-logo.png` and background color `#fffbf6`.
- **OUTPUT:** `icon-192x192.png`, `icon-512x512.png`, and `apple-icon.png` in `public/images/brand/` with `#fffbf6` background.
- **VERIFY:** Check that the images exist in the folder and are valid PNG files with the correct dimensions and background color.

### Task 2: Create Web App Manifest

- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Priority:** P1
- **Dependencies:** Task 1
- **INPUT:** App Name ("Manifold"), Display Mode ("standalone"), Theme/Background Color ("#fffbf6").
- **OUTPUT:** `public/site.webmanifest` containing standard PWA fields, pointing to the newly generated icons.
- **VERIFY:** Ensure `site.webmanifest` is valid JSON and all icon paths resolve correctly.

### Task 3: Inject Meta Tags & Link Manifest

- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Priority:** P1
- **Dependencies:** Task 2
- **INPUT:** The manifest file and theme settings.
- **OUTPUT:** Create `pages/_document.tsx` (if missing) and modify it to include `<link rel="manifest" href="/site.webmanifest" />` and `<link rel="apple-touch-icon" ... />`. Add `<meta name="theme-color" content="#fffbf6" />` to `pages/_app.tsx`.
- **VERIFY:** Run `npm run dev` and inspect the `<head>` of the loaded page to confirm tags are present.

## ✅ PHASE X COMPLETE

_(To be checked after implementation)_

- Lint: [x] Pass
- Security: [x] No critical issues
- Build: [x] Success
- Lighthouse (PWA Score): [x] Pass
- Date: 2026-08-05
