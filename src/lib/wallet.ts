import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

const WALLET_PROFILE_CACHE_KEY = 'driver_wallet_profile_cache';
const DRIVER_TRANSACTIONS_CACHE_KEY = 'driver_transactions_cache';

export type DriverWalletProfile = {
  walletAccount: string | null;
  walletBalance: number;
  dailyTarget: number;
  bankName: string | null;
  accountName: string | null;
  payoutBankCode: string | null;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountName: string | null;
  hasTransferPin: boolean;
};

export type DriverTransactionView = {
  id: string;
  reference: string;
  type: 'wallet_topup' | 'payout' | string;
  status: string;
  amount: number;
  fee: number;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  narration: string | null;
  createdAt: string;
};

export type Bank = {
  bankName: string;
  bankCode: string;
};

type DriverProfileWalletRow = {
  wallet_account: string | null;
  wallet_balance: number;
  daily_target: number | null;
  bank_name: string | null;
  account_name: string | null;
  payout_bank_code: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_name: string | null;
};

type DriverTransactionRow = {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  currency: string;
  bank_name: string | null;
  account_number: string | null;
  narration: string | null;
  created_at: string;
};

const normalizeTransaction = (row: DriverTransactionRow): DriverTransactionView => ({
  id: row.id,
  reference: row.reference,
  type: row.type,
  status: row.status,
  amount: Number(row.amount),
  fee: Number(row.fee ?? 0),
  currency: row.currency,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  narration: row.narration,
  createdAt: row.created_at,
});

const getAuthenticatedUser = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  return user;
};

// Extracts the JSON `{ error: string }` body from a failed edge function
// invocation so the UI can surface the real server-side message.
const invokeEdgeFunction = async <T>(name: string, body?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { method: 'POST', body });

  if (error) {
    let message = error.message || 'Something went wrong. Please try again.';
    const context = (error as unknown as { context?: Response }).context;

    if (context && typeof context.json === 'function') {
      try {
        const parsed = await context.json();
        if (parsed?.error) {
          message = parsed.error;
        }
      } catch {
        // Ignore parse failures and fall back to the generic message.
      }
    }

    throw new Error(message);
  }

  return data as T;
};

export const getCachedDriverWalletProfile = async (): Promise<DriverWalletProfile | null> => {
  const cachedValue = await AsyncStorage.getItem(WALLET_PROFILE_CACHE_KEY);

  if (!cachedValue) {
    return null;
  }

  return JSON.parse(cachedValue) as DriverWalletProfile;
};

export const cacheDriverWalletProfile = async (profile: DriverWalletProfile) => {
  await AsyncStorage.setItem(WALLET_PROFILE_CACHE_KEY, JSON.stringify(profile));
};

export const fetchDriverWalletProfile = async (): Promise<DriverWalletProfile | null> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const [{ data, error }, { data: hasPin }] = await Promise.all([
    supabase
      .from('driver_profile')
      .select(
        'wallet_account, wallet_balance, daily_target, bank_name, account_name, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name'
      )
      .eq('uuid', user.id)
      .maybeSingle(),
    supabase.rpc('driver_has_transfer_pin'),
  ]);

  if (error || !data) {
    return null;
  }

  const row = data as DriverProfileWalletRow;

  const profile: DriverWalletProfile = {
    walletAccount: row.wallet_account,
    walletBalance: Number(row.wallet_balance || 0),
    dailyTarget: Number(row.daily_target || 0),
    bankName: row.bank_name,
    accountName: row.account_name,
    payoutBankCode: row.payout_bank_code,
    payoutBankName: row.payout_bank_name,
    payoutAccountNumber: row.payout_account_number,
    payoutAccountName: row.payout_account_name,
    hasTransferPin: Boolean(hasPin),
  };

  await cacheDriverWalletProfile(profile);
  return profile;
};

export const getCachedDriverTransactions = async (): Promise<DriverTransactionView[]> => {
  const cachedValue = await AsyncStorage.getItem(DRIVER_TRANSACTIONS_CACHE_KEY);

  if (!cachedValue) {
    return [];
  }

  return JSON.parse(cachedValue) as DriverTransactionView[];
};

export const cacheDriverTransactions = async (transactions: DriverTransactionView[]) => {
  await AsyncStorage.setItem(DRIVER_TRANSACTIONS_CACHE_KEY, JSON.stringify(transactions));
};

export const fetchDriverTransactions = async (): Promise<DriverTransactionView[]> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('driver_transaction')
    .select('id, reference, type, status, amount, fee, currency, bank_name, account_number, narration, created_at')
    .eq('driver_uuid', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  const transactions = (data as DriverTransactionRow[]).map(normalizeTransaction);
  await cacheDriverTransactions(transactions);
  return transactions;
};

export const listBanks = async (): Promise<Bank[]> => {
  const result = await invokeEdgeFunction<{ banks: Bank[] }>('list-budpay-banks');
  return result.banks;
};

export const resolveBankAccount = async (bankCode: string, accountNumber: string): Promise<string> => {
  const result = await invokeEdgeFunction<{ accountName: string }>('resolve-driver-bank-account', {
    bankCode,
    accountNumber,
  });
  return result.accountName;
};

export const savePayoutAccount = async (
  bankCode: string,
  bankName: string,
  accountNumber: string
): Promise<{ accountName: string }> => {
  return invokeEdgeFunction<{ accountName: string }>('save-driver-payout-account', {
    bankCode,
    bankName,
    accountNumber,
  });
};

export const setTransferPin = async (pin: string): Promise<void> => {
  await invokeEdgeFunction<{ success: boolean }>('set-driver-transfer-pin', { pin });
};

export const initiatePayout = async (
  amount: number,
  pin: string,
  narration?: string
): Promise<{ reference: string; status: string; amount: number; fee: number }> => {
  return invokeEdgeFunction('create-driver-payout', { amount, pin, narration });
};
