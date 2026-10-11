import { registerDecorator, type ValidationOptions } from 'class-validator';
import { hasBlockedName } from '../arcade/word-duel/duel-chat-filter';

/**
 * Rejects a display name or username that contains profanity or a slur.
 * Deliberately narrow (see hasBlockedName): real names must still pass.
 */
export function IsCleanName(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCleanName',
      target: object.constructor,
      propertyName,
      options: { message: 'That name is not allowed. Please choose another.', ...options },
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || !hasBlockedName(value),
      },
    });
  };
}
