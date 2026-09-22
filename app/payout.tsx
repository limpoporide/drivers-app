import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import {
  Bank,
  fetchDriverWalletProfile,
  initiatePayout,
  listBanks,
  resolveBankAccount,
  savePayoutAccount,
  setTransferPin,
} from '../src/lib/wallet';
import { formatCurrency } from '../src/utils/formatters';

const maskAccountNumber = (accountNumber: string) => {
  if (accountNumber.length <= 6) {
    return accountNumber;
  }

  return `${accountNumber.slice(0, 3)}${'*'.repeat(accountNumber.length - 6)}${accountNumber.slice(-3)}`;
};

export default function Payout() {
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [hasTransferPin, setHasTransferPin] = useState(false);

  const [payoutBankCode, setPayoutBankCode] = useState<string | null>(null);
  const [payoutBankName, setPayoutBankName] = useState<string | null>(null);
  const [payoutAccountNumber, setPayoutAccountNumber] = useState<string | null>(null);
  const [payoutAccountName, setPayoutAccountName] = useState<string | null>(null);

  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [isBankPickerVisible, setIsBankPickerVisible] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [resolvedAccountName, setResolvedAccountName] = useState('');
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [amount, setAmount] = useState('');

  const [isPinSetupVisible, setIsPinSetupVisible] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [isTransferPinVisible, setIsTransferPinVisible] = useState(false);

  const loadProfile = useCallback(async () => {
    const profile = await fetchDriverWalletProfile();

    if (!profile) {
      return;
    }

    setWalletBalance(profile.walletBalance);
    setHasTransferPin(profile.hasTransferPin);
    setPayoutBankCode(profile.payoutBankCode);
    setPayoutBankName(profile.payoutBankName);
    setPayoutAccountNumber(profile.payoutAccountNumber);
    setPayoutAccountName(profile.payoutAccountName);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      (async () => {
        setIsLoadingProfile(true);
        await loadProfile();
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      })();

      return () => {
        isMounted = false;
      };
    }, [loadProfile])
  );

  const hasPayoutAccount = Boolean(payoutAccountNumber) && !isEditingAccount;

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) {
      return banks;
    }

    const query = bankSearch.trim().toLowerCase();
    return banks.filter((bank) => bank.bankName.toLowerCase().includes(query));
  }, [banks, bankSearch]);

  const handleOpenBankPicker = async () => {
    setIsBankPickerVisible(true);

    if (banks.length === 0) {
      setIsLoadingBanks(true);
      try {
        const result = await listBanks();
        setBanks(result);
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Unable to load bank list.');
      } finally {
        setIsLoadingBanks(false);
      }
    }
  };

  const handleSelectBank = (bank: Bank) => {
    setSelectedBank(bank);
    setIsBankPickerVisible(false);
    setBankSearch('');
    setResolvedAccountName('');
  };

  const handleVerifyAccount = async () => {
    if (!selectedBank) {
      Alert.alert('Select a bank', 'Please select your bank first.');
      return;
    }

    if (accountNumberInput.trim().length !== 10) {
      Alert.alert('Invalid account number', 'Account number must be 10 digits.');
      return;
    }

    setIsResolvingAccount(true);
    setResolvedAccountName('');

    try {
      const accountName = await resolveBankAccount(selectedBank.bankCode, accountNumberInput.trim());
      setResolvedAccountName(accountName);
    } catch (error) {
      Alert.alert('Unable to verify account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsResolvingAccount(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!selectedBank || !resolvedAccountName) {
      Alert.alert('Verify account', 'Please verify the account details before saving.');
      return;
    }

    const trimmedAccountNumber = accountNumberInput.trim();

    setIsSavingAccount(true);

    try {
      await savePayoutAccount(selectedBank.bankCode, selectedBank.bankName, trimmedAccountNumber);
      setPayoutBankCode(selectedBank.bankCode);
      setPayoutBankName(selectedBank.bankName);
      setPayoutAccountNumber(trimmedAccountNumber);
      setPayoutAccountName(resolvedAccountName);
      await loadProfile();
      setIsEditingAccount(false);
      setSelectedBank(null);
      setAccountNumberInput('');
      setResolvedAccountName('');
      Alert.alert('Saved', 'Your payout account has been saved.');
    } catch (error) {
      Alert.alert('Unable to save account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleChangeAccount = () => {
    setSelectedBank(payoutBankCode && payoutBankName ? { bankCode: payoutBankCode, bankName: payoutBankName } : null);
    setAccountNumberInput('');
    setResolvedAccountName('');
    setIsEditingAccount(true);
  };

  const validatePayoutRequest = () => {
    const parsedAmount = Number(amount);
    const hasSavedPayoutAccount = Boolean(payoutBankCode && payoutBankName && payoutAccountNumber && payoutAccountName);

    console.log('[Payout] validatePayoutRequest', {
      parsedAmount,
      walletBalance,
      hasTransferPin,
      hasSavedPayoutAccount,
      payoutBankCode,
      payoutBankName,
      payoutAccountNumber,
      payoutAccountName,
      isEditingAccount,
      selectedBank,
      accountNumberInput,
      resolvedAccountName,
    });

    if (!parsedAmount || parsedAmount < 100) {
      Alert.alert('Invalid amount', 'Enter an amount of at least ₦100.');
      return false;
    }

    if (parsedAmount > walletBalance) {
      Alert.alert('Insufficient balance', 'You cannot withdraw more than your wallet balance.');
      return false;
    }

    if (!hasSavedPayoutAccount) {
      Alert.alert(
        'Add bank account',
        selectedBank || accountNumberInput || resolvedAccountName
          ? 'Please save your payout bank account first.'
          : 'Please add a payout bank account first.'
      );
      return false;
    }

    return true;
  };

  const handlePressSendToBank = () => {
    console.log('[Payout] Send to bank pressed', {
      amount,
      walletBalance,
      hasTransferPin,
      payoutBankCode,
      payoutBankName,
      payoutAccountNumber,
      payoutAccountName,
      isEditingAccount,
    });

    if (!validatePayoutRequest()) {
      console.log('[Payout] validation failed before opening payout confirmation');
      return;
    }

    if (!hasTransferPin) {
      console.log('[Payout] opening transfer PIN setup');
      setNewPin('');
      setConfirmPin('');
      setIsPinSetupVisible(true);
      return;
    }

    console.log('[Payout] opening payout confirmation modal');
    setConfirmPinInput('');
    setIsConfirmVisible(true);
  };

  const handleCreatePin = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      Alert.alert('Invalid PIN', 'Your transfer PIN must be exactly 4 digits.');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('PIN mismatch', 'The PINs you entered do not match.');
      return;
    }

    setIsSavingPin(true);

    try {
      await setTransferPin(newPin);
      setHasTransferPin(true);
      setIsPinSetupVisible(false);
      setConfirmPinInput('');
      setIsConfirmVisible(true);
    } catch (error) {
      Alert.alert('Unable to set PIN', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleConfirmPayout = async () => {
    console.log('[Payout] Confirm payout pressed', {
      amount,
      confirmPinLength: confirmPinInput.length,
      payoutBankCode,
      payoutBankName,
      payoutAccountNumber,
      payoutAccountName,
    });

    if (!/^\d{4}$/.test(confirmPinInput)) {
      Alert.alert('Invalid PIN', 'Enter your 4-digit transfer PIN to continue.');
      return;
    }

    setIsSubmittingPayout(true);

    try {
      console.log('[Payout] initiating payout request', {
        amount: Number(amount),
        hasPin: Boolean(confirmPinInput),
        payoutBankCode,
        payoutBankName,
        payoutAccountNumber,
      });
      await initiatePayout(Number(amount), confirmPinInput);
      setIsConfirmVisible(false);
      setConfirmPinInput('');
      setAmount('');
      await loadProfile();
      Alert.alert('Payout initiated', 'Your payout has been sent to your bank account and will reflect shortly.');
    } catch (error) {
      console.log('[Payout] initiatePayout failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Payout failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  const isAmountOverBalance = amount.length > 0 && Number(amount) > walletBalance;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Payout</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoadingProfile ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.balanceCard, { backgroundColor: isDark ? '#111111' : '#040300' }]}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceValue}>{formatCurrency(walletBalance)}</Text>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Payout Account</Text>

            {hasPayoutAccount ? (
              <View style={[styles.accountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <View style={styles.accountCardRow}>
                  <Text style={[styles.accountCardLabel, { color: theme.colors.textSecondary }]}>Bank</Text>
                  <Text style={[styles.accountCardValue, { color: theme.colors.text }]}>{payoutBankName}</Text>
                </View>
                <View style={styles.accountCardRow}>
                  <Text style={[styles.accountCardLabel, { color: theme.colors.textSecondary }]}>Account Number</Text>
                  <Text style={[styles.accountCardValue, { color: theme.colors.text }]}>
                    {maskAccountNumber(payoutAccountNumber || '')}
                  </Text>
                </View>
                <View style={styles.accountCardRow}>
                  <Text style={[styles.accountCardLabel, { color: theme.colors.textSecondary }]}>Account Name</Text>
                  <Text style={[styles.accountCardValue, { color: theme.colors.text }]}>{payoutAccountName}</Text>
                </View>

                <TouchableOpacity onPress={handleChangeAccount} activeOpacity={0.75} style={styles.changeAccountButton}>
                  <Text style={[styles.changeAccountText, { color: theme.colors.primary }]}>Change account</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.accountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <TouchableOpacity
                  onPress={handleOpenBankPicker}
                  style={[styles.selectInput, { borderColor: theme.colors.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={{ color: selectedBank ? theme.colors.text : theme.colors.textSecondary }}>
                    {selectedBank ? selectedBank.bankName : 'Select bank'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                <TextInput
                  style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="Account number"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={accountNumberInput}
                  onChangeText={(value) => {
                    setAccountNumberInput(value.replace(/[^0-9]/g, ''));
                    setResolvedAccountName('');
                  }}
                />

                {resolvedAccountName ? (
                  <Text style={[styles.resolvedAccountName, { color: theme.colors.success }]}>{resolvedAccountName}</Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleVerifyAccount}
                    disabled={isResolvingAccount}
                    style={[styles.secondaryButton, { borderColor: theme.colors.primary }]}
                    activeOpacity={0.75}
                  >
                    {isResolvingAccount ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.primary }]}>Verify account</Text>
                    )}
                  </TouchableOpacity>
                )}

                {resolvedAccountName ? (
                  <TouchableOpacity
                    onPress={handleSaveAccount}
                    disabled={isSavingAccount}
                    style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                    activeOpacity={0.85}
                  >
                    {isSavingAccount ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Save account</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {isEditingAccount ? (
                  <TouchableOpacity onPress={() => setIsEditingAccount(false)} style={styles.changeAccountButton}>
                    <Text style={[styles.changeAccountText, { color: theme.colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Withdraw Amount</Text>

            <View style={[styles.accountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <TextInput
                style={[
                  styles.amountInput,
                  { color: theme.colors.text, borderColor: isAmountOverBalance ? theme.colors.error : theme.colors.border },
                ]}
                placeholder="₦0.00"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="number-pad"
                value={amount}
                onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
              />

              {isAmountOverBalance ? (
                <Text style={[styles.amountErrorText, { color: theme.colors.error }]}>
                  Amount exceeds your available wallet balance.
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={handlePressSendToBank}
                disabled={isAmountOverBalance}
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.colors.primary },
                  isAmountOverBalance && styles.primaryButtonDisabled,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>Send to bank</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={isBankPickerVisible} animationType="slide" onRequestClose={() => setIsBankPickerVisible(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setIsBankPickerVisible(false)} style={styles.backButton} activeOpacity={0.75}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Select Bank</Text>
            <View style={styles.headerSpacer} />
          </View>

          <TextInput
            style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, marginHorizontal: 20 }]}
            placeholder="Search bank"
            placeholderTextColor={theme.colors.textSecondary}
            value={bankSearch}
            onChangeText={setBankSearch}
          />

          {isLoadingBanks ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredBanks}
              keyExtractor={(item, index) => `${item.bankCode}-${index}`}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectBank(item)}
                  style={[styles.bankRow, { borderBottomColor: theme.colors.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={{ color: theme.colors.text }}>{item.bankName}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={isPinSetupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPinSetupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Create Transfer PIN</Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              Set a 4-digit PIN to authorize payouts.
            </Text>

            <TextInput
              style={[styles.pinInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="New PIN"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={newPin}
              onChangeText={(value) => setNewPin(value.replace(/[^0-9]/g, ''))}
            />

            <TextInput
              style={[styles.pinInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="Confirm PIN"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={confirmPin}
              onChangeText={(value) => setConfirmPin(value.replace(/[^0-9]/g, ''))}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={() => setIsPinSetupVisible(false)} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreatePin}
                disabled={isSavingPin}
                style={[styles.modalProceedButton, { backgroundColor: theme.colors.primary }]}
              >
                {isSavingPin ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalProceedText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Confirm Payout</Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              Enter your transfer PIN to send {formatCurrency(Number(amount) || 0)} to {payoutBankName}.
            </Text>

            <View style={[styles.pinInputRow, { borderColor: theme.colors.border }]}>
              <TextInput
                style={[styles.pinInputField, { color: theme.colors.text }]}
                placeholder="Transfer PIN"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="number-pad"
                secureTextEntry={!isTransferPinVisible}
                maxLength={4}
                value={confirmPinInput}
                onChangeText={(value) => setConfirmPinInput(value.replace(/[^0-9]/g, ''))}
              />
              <TouchableOpacity
                onPress={() => setIsTransferPinVisible((previous) => !previous)}
                style={styles.pinVisibilityToggle}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={isTransferPinVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={() => setIsConfirmVisible(false)} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmPayout}
                disabled={isSubmittingPayout}
                style={[styles.modalProceedButton, { backgroundColor: theme.colors.primary }]}
              >
                {isSubmittingPayout ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalProceedText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  balanceCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.85,
    marginBottom: 6,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  accountCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  accountCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accountCardLabel: {
    fontSize: 13,
  },
  accountCardValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeAccountButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  changeAccountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  amountInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '600',
  },
  resolvedAccountName: {
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  amountErrorText: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 12,
  },
  bankRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubtitle: {
    fontSize: 13,
  },
  pinInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 4,
  },
  pinInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  pinInputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 4,
  },
  pinVisibilityToggle: {
    paddingLeft: 8,
    paddingVertical: 12,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalProceedButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalProceedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
