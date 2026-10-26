import type { useRouter } from 'next/navigation';

type Router = ReturnType<typeof useRouter>;

// Counts pushes made inside the app since the page loaded, so "back" can tell
// whether there's an in-app screen to return to (like the native stack) or the
// screen was opened directly from a link / refresh.
let depth = 0;

export function navTo(router: Router, href: string) {
  depth++;
  router.push(href);
}

export function goBack(router: Router, fallback: string) {
  if (depth > 0) {
    depth--;
    router.back();
  } else {
    router.replace(fallback);
  }
}
