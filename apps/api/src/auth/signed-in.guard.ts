import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { QsRequest } from '../request.js';
import { TOKEN_VERIFIER } from '../tokens.js';
import type { TokenVerifier } from './token-verifier.js';
import { unauthorized } from '../errors.js';

/** Lets a request through only with a valid Firebase proof of sign-in ("Authorization: Bearer <ID token>"). */
@Injectable()
export class SignedInGuard implements CanActivate {
  constructor(@Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QsRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) throw unauthorized('signIn');
    try {
      request.person = await this.verifier.verify(token);
    } catch {
      throw unauthorized('signInExpired');
    }
    return true;
  }
}
