import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isWordInTheWildEnabled } from '../config/feature-flags';

/** 404s every Word in the Wild route while the feature is parked for V2. */
@Injectable()
export class WordInTheWildEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!isWordInTheWildEnabled()) throw new NotFoundException();
    return true;
  }
}
