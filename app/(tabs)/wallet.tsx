import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { formatCurrency, formatDate } from '../../src/utils/formatters';
import { supabase } from '../../src/lib/supabase';
import {
  type DriverWalletProfile,
  DriverTransactionView,
  cacheDriverTransactions,
  cacheDriverWalletProfile,
  fetchDriverTransactions,
  fetchDriverWalletProfile,
  getCachedDriverTransactions,
  getCachedDriverWalletProfile,
} from '../../src/lib/wallet';

const formatTransactionTitle = (transaction: DriverTransactionView) => {
  if (transaction.type === 'wallet_topup') {
    return 'Wallet top up';
  }

  if (transaction.type === 'payout') {
    return transaction.bankName ? `Payout to ${transaction.bankName}` : 'Payout';
  }

  return transaction.type;
};

const isCompletedTransaction = (status: string) => {
  const normalizedStatus = status.trim().toLowerCase();
  return normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === 'successful';
};

const getSignedTransactionAmount = (transaction: DriverTransactionView) => {
  return transaction.type === 'payout' ? -Math.abs(transaction.amount) : Math.abs(transaction.amount);
};

const isToday = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

export default function Wallet() {
  const router = useRouter();
  const { theme } = useTheme();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balance, setBalance] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(0);
  const [transactions, setTransactions] = useState<DriverTransactionView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayBalance = useMemo(() => {
    return transactions.reduce((total, transaction) => {
      if (!isCompletedTransaction(transaction.status) || !isToday(transaction.createdAt)) {
        return total;
      }

      return total + getSignedTransactionAmount(transaction);
    }, 0);
  }, [transactions]);

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      const [cachedProfile, cachedTransactions] = await Promise.all([
        getCachedDriverWalletProfile(),
        getCachedDriverTransactions(),
      ]);

      if (cachedProfile) {
        setBalance(cachedProfile.walletBalance);
        setDailyTarget(cachedProfile.dailyTarget ?? 0);
      }

      if (cachedTransactions.length > 0) {
        setTransactions(cachedTransactions);
      }
    }

    const [profile, freshTransactions] = await Promise.all([fetchDriverWalletProfile(), fetchDriverTransactions()]);

    if (profile) {
      setBalance(profile.walletBalance);
      setDailyTarget(profile.dailyTarget);
    }

    setTransactions(freshTransactions);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData('initial');
    }, [loadData])
  );

  useEffect(() => {
    let isActive = true;
    let walletChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToWalletBalance = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !isActive) {
        return;
      }

      const channelName = `driver-wallet-balance-${user.id}-${Date.now()}`;

      walletChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'driver_profile',
            filter: `uuid=eq.${user.id}`,
          },
          async (payload) => {
            const nextBalance = Number(payload.new.wallet_balance || 0);
            const nextDailyTarget = Number(payload.new.daily_target || 0);
            setBalance(nextBalance);
            setDailyTarget(nextDailyTarget);

            const currentProfile = await getCachedDriverWalletProfile();
            if (currentProfile) {
              await cacheDriverWalletProfile({
                ...currentProfile,
                walletBalance: nextBalance,
                dailyTarget: nextDailyTarget,
              });
            } else {
              const nextProfile: DriverWalletProfile = {
                walletAccount: null,
                walletBalance: nextBalance,
                dailyTarget: nextDailyTarget,
                bankName: null,
                accountName: null,
                payoutBankCode: null,
                payoutBankName: null,
                payoutAccountNumber: null,
                payoutAccountName: null,
                hasTransferPin: false,
              };

              await cacheDriverWalletProfile(nextProfile);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'driver_transaction',
            filter: `driver_uuid=eq.${user.id}`,
          },
          async () => {
            const freshTransactions = await fetchDriverTransactions();
            if (isActive) {
              setTransactions(freshTransactions);
            }
          }
        )
        .subscribe();
    };

    subscribeToWalletBalance();

    return () => {
      isActive = false;

      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData('refresh');
    setIsRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.fixedSection}>
        <View style={[styles.balanceCard, { backgroundColor: theme.mode === 'dark' ? '#000000' : '#040300' }]}>
          <View style={styles.earningsHeader}>
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <TouchableOpacity
              onPress={() => setBalanceVisible(!balanceVisible)}
              style={styles.visibilityToggle}
            >
              <Ionicons
                name={balanceVisible ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.balanceRow}>
            <Text style={styles.nairaSymbol}>₦</Text>
            <Text style={styles.balanceAmount}>
              {balanceVisible ? formatCurrency(balance).replace('₦', '') : '****'}
            </Text>
          </View>

          <View style={styles.balanceMetricsRow}>
            <View style={styles.balanceMetricCard}>
              <Text style={styles.balanceMetricLabel}>Today Balance</Text>
              <Text style={styles.balanceMetricValue}>
                {formatCurrency(todayBalance)}
              </Text>
            </View>

            <View style={styles.balanceMetricDivider} />

            <View style={styles.balanceMetricCard}>
              <Text style={styles.balanceMetricLabel}>Daily Target</Text>
              <Text style={styles.balanceMetricValue}>
                {formatCurrency(dailyTarget)}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.withdrawButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => router.push('/payout')}
        >
          <Ionicons name="cash-outline" size={20} color="#fff" />
          <Text style={styles.withdrawButtonText}>My Payout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent Transactions</Text>

          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 12 }} />
          ) : transactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No transactions yet.</Text>
          ) : (
            transactions.map((transaction) => {
              const isCredit = transaction.type === 'wallet_topup';
              const isFailed = transaction.status === 'failed';

              return (
                <View
                  key={transaction.id}
                  style={[styles.transactionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                >
                  <View style={[styles.transactionIcon, {
                    backgroundColor: isCredit ? theme.colors.success + '20' : theme.colors.error + '20'
                  }]}>
                    <Ionicons
                      name={isCredit ? 'arrow-down' : 'arrow-up'}
                      size={20}
                      color={isCredit ? theme.colors.success : theme.colors.error}
                    />
                  </View>
                  <View style={styles.transactionContent}>
                    <Text style={[styles.transactionTitle, { color: theme.colors.text }]}>
                      {formatTransactionTitle(transaction)}
                    </Text>
                    <Text style={[styles.transactionDate, { color: theme.colors.textSecondary }]}>
                      {formatDate(transaction.createdAt)}
                      {transaction.status === 'pending' ? ' · Pending' : ''}
                      {isFailed ? ' · Failed' : ''}
                    </Text>
                  </View>
                  <Text style={[
                    styles.transactionAmount,
                    { color: isFailed ? theme.colors.textSecondary : isCredit ? theme.colors.success : theme.colors.error }
                  ]}>
                    {isCredit ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedSection: {
    paddingTop: 20,
    paddingHorizontal: 10,
  },
  balanceCard: {
    padding: 24,
    borderRadius: 20,
    marginBottom: 16,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  nairaSymbol: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 4,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  balanceMetricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  balanceMetricCard: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  balanceMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  balanceMetricLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginBottom: 6,
  },
  balanceMetricValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  visibilityToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  withdrawButton: {
    marginHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 18,
    gap: 8,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 4,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionContent: {
    flex: 1,
    marginLeft: 12,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  transactionDate: {
    fontSize: 12,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
});
