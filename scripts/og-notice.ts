// The notice line on community build and platform preview cards (scripts/og-cards.tsx). Kept apart so the tests can import it:
// og-cards.tsx draws every card as soon as it's loaded.
import { NFA_SHORT_NOTICE } from '../src/data/helpers';

/** The AR builders, where a build can pair a short barrel with a stock. Pistol builders get no notice. */
const NOTICE_PLATFORMS = ['ar15', 'ar9', 'ar10'];

/** The short NFA notice for a card on this platform, or '' for none. */
export const cardNotice = (platformId: string) => (NOTICE_PLATFORMS.includes(platformId) ? NFA_SHORT_NOTICE : '');
