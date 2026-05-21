/**
 * Compute layout config for a preview mode.
 *
 * @param {string} mode - 'ios-mail' | 'gmail-mobile' | 'full'.
 *   Unknown or falsy values fall back to 'ios-mail'.
 * @returns {{ containerWidth: string, iframeWidth: string, scale: number, chrome: boolean }}
 *   containerWidth: CSS width applied to the preview container
 *   iframeWidth:    CSS width applied to the iframe (980px for iOS Mail's virtual viewport, 100% otherwise)
 *   scale:          CSS transform scale factor (375/980 for iOS Mail, 1 otherwise)
 *   chrome:         whether to wrap the iframe in the phone-mockup chrome (iOS Mail only)
 */
export function modeConfig(mode) {
  switch (mode) {
    case 'ios-mail':
      return { containerWidth: '375px', iframeWidth: '980px', scale: 375 / 980, chrome: true };
    case 'gmail-mobile':
      return { containerWidth: '375px', iframeWidth: '100%', scale: 1, chrome: false };
    case 'full':
      return { containerWidth: '100%', iframeWidth: '100%', scale: 1, chrome: false };
    default:
      return modeConfig('ios-mail');
  }
}

/**
 * Rewrite legacy `?width=` URL state to the new `?mode=` shape so bookmarks
 * survive the picker change. Pure: returns a new URL string, doesn't mutate
 * input. Handles edge cases: URLs with `?mode=` already set (strips any
 * stale `?width=`); unknown `?width=` values pass through unchanged.
 *
 * @param {string} url - absolute URL to migrate
 * @returns {string} migrated URL
 */
export function migrateUrlParams(url) {
  const u = new URL(url);
  if (u.searchParams.has('mode')) {
    if (u.searchParams.has('width')) u.searchParams.delete('width');
    return u.toString();
  }
  const width = u.searchParams.get('width');
  if (!width) return u.toString();
  let mode;
  if (width === '600' || width === 'full') mode = 'full';
  // Any numeric width (375 or arbitrary custom): treat as gmail-mobile
  else if (/^\d+$/.test(width)) mode = 'gmail-mobile';
  else return u.toString();
  u.searchParams.delete('width');
  u.searchParams.set('mode', mode);
  return u.toString();
}
