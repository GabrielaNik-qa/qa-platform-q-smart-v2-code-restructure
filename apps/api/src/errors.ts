// The server's refusals: each has a code the pages translate, and an English text (packages/shared/src/errors.ts).
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ERROR_MESSAGES, type ErrorCode } from '@qsmart/shared';

const body = (code: ErrorCode) => ({ code, message: ERROR_MESSAGES[code] });

export const badRequest = (code: ErrorCode) => new BadRequestException(body(code));
export const conflict = (code: ErrorCode) => new ConflictException(body(code));
export const forbidden = (code: ErrorCode) => new ForbiddenException(body(code));
export const notFound = (code: ErrorCode) => new NotFoundException(body(code));
export const unauthorized = (code: ErrorCode) => new UnauthorizedException(body(code));
