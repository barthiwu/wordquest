import { SetMetadata } from '@nestjs/common';

export const THROTTLE_BY_IP_KEY = 'throttleByIp';

/**
 * Marks a route or controller whose rate limit must ALWAYS count per IP
 * address, even when the request carries a valid access token. Used on the
 * sign-in, sign-up and password-reset routes: otherwise anyone could mint
 * free guest tokens and send one with each login attempt, getting a fresh
 * rate-limit bucket per guess and defeating the limit entirely.
 */
export const ThrottleByIp = () => SetMetadata(THROTTLE_BY_IP_KEY, true);
