import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Database } from '../types/supabase';

export type DriverSignupStep = 1 | 2 | 3;

export type DriverOnboardingDraft = Pick<
  Database['public']['Tables']['driver_profile']['Row'],
  | 'uuid'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone_num'
  | 'phone_verified'
  | 'check1'
  | 'check2'
  | 'nin'
  | 'license_upload'
  | 'experience'
  | 'health_status'
  | 'health_yes'
  | 'address'
  | 'city'
  | 'state'
>;

export type DriverOnboardingState = {
  isAuthenticated: boolean;
  isSignupComplete: boolean;
  nextStep: DriverSignupStep;
  profile: DriverOnboardingDraft | null;
  user: User | null;
};

const DRIVER_ONBOARDING_FIELDS =
  'uuid, first_name, last_name, email, phone_num, phone_verified, check1, check2, nin, license_upload, experience, health_status, health_yes, address, city, state';

function hasCompletedPasswordSetup(user: User | null) {
  return Boolean(user?.email || user?.user_metadata?.signup_complete);
}

function getNextSignupStep(profile: DriverOnboardingDraft | null, user: User | null): DriverSignupStep {
  if (!profile || !profile.check1) {
    return 1;
  }

  if (!profile.check2) {
    return 2;
  }

  if (!hasCompletedPasswordSetup(user)) {
    return 3;
  }

  return 3;
}

export function toLocalPhoneNumber(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const digitsOnly = value.replace(/\D/g, '');

  if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
    return `0${digitsOnly.slice(3)}`;
  }

  if (digitsOnly.length === 10) {
    return `0${digitsOnly}`;
  }

  return digitsOnly.slice(0, 11);
}

export async function getDriverOnboardingState(fallbackUser?: User | null): Promise<DriverOnboardingState> {
  const currentUser = fallbackUser ?? (await supabase.auth.getUser()).data.user ?? null;

  if (!currentUser) {
    return {
      isAuthenticated: false,
      isSignupComplete: false,
      nextStep: 1,
      profile: null,
      user: null,
    };
  }

  const { data: profile } = await supabase
    .from('driver_profile')
    .select(DRIVER_ONBOARDING_FIELDS)
    .eq('uuid', currentUser.id)
    .maybeSingle<DriverOnboardingDraft>();

  const nextStep = getNextSignupStep(profile ?? null, currentUser);
  const isSignupComplete = Boolean(profile?.check1 && profile?.check2 && hasCompletedPasswordSetup(currentUser));

  return {
    isAuthenticated: true,
    isSignupComplete,
    nextStep,
    profile: profile ?? null,
    user: currentUser,
  };
}