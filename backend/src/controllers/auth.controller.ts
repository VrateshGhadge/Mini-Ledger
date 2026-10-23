import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import * as authService from '../services/auth.service';
import * as otpService from '../services/otp.service';
import { signAccessToken } from '../services/token.service';
import {
  requestOtpSchema,
  verifyOtpSchema,
} from '../validators/auth.validators';

export async function requestOtp(
  req: Request,
  res: Response,
): Promise<void> {
  const { phoneNumber } = requestOtpSchema.parse(req.body);
  const result = otpService.requestOtp(phoneNumber);

  res.status(200).json({
    message: 'OTP generated. Check the server terminal.',
    expiresInSeconds: result.expiresInSeconds,
  });
}

export async function verifyOtp(
  req: Request,
  res: Response,
): Promise<void> {
  const { phoneNumber, otp } = verifyOtpSchema.parse(req.body);
  const result = otpService.verifyOtp(phoneNumber, otp);

  if (!result.ok) {
    if (result.reason === 'attempts') {
      throw new AppError(
        429,
        'OTP_ATTEMPTS_EXCEEDED',
        'Too many incorrect OTP attempts. Request a new OTP.',
      );
    }

    throw new AppError(
      401,
      'OTP_INVALID_OR_EXPIRED',
      'The OTP is invalid or has expired.',
    );
  }

  const user = await authService.findOrCreateUser(phoneNumber);
  const token = signAccessToken(user.id);

  res.status(200).json({ token, user });
}
