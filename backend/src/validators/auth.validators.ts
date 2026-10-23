import { z } from 'zod';

const phoneNumberSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .transform((value) => (value.startsWith('00') ? `+${value.slice(2)}` : value))
  .refine(
    (value) => /^\+[1-9]\d{7,14}$/.test(value),
    'Phone number must be in E.164 format, for example +919876543210',
  );

export const requestOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});
