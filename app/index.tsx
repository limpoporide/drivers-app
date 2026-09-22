import React, { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { getDriverOnboardingState } from '../src/lib/onboarding';

const HAS_SEEN_INTRO_KEY = 'has_seen_intro';
const INDEX_LOGO = require('../assets/Limpopo round 2.png');

export default function Splash() {
	const router = useRouter();
	const { theme } = useTheme();

	useEffect(() => {
		let isMounted = true;

		const bootstrap = async () => {
			const hasSeenIntro = await AsyncStorage.getItem(HAS_SEEN_INTRO_KEY);
			const onboardingState = await getDriverOnboardingState();

			if (!isMounted) {
				return;
			}

			if (!onboardingState.isAuthenticated) {
				router.replace(hasSeenIntro === 'true' ? '/auth/login' : '/intro');
				return;
			}

			if (onboardingState.isSignupComplete) {
				router.replace('/(tabs)/home');
				return;
			}

			router.replace('/auth/signup');
		};

		bootstrap().catch((error) => {
			console.log('[Driver Splash] bootstrap failed', error);
			router.replace('/auth/login');
		});

		return () => {
			isMounted = false;
		};
	}, [router]);

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
			<View style={styles.content}>
				<Image source={INDEX_LOGO} style={styles.logo} resizeMode="contain" />
				<Text style={[styles.title, { color: theme.colors.text }]}>Limpopo Driver</Text>
				<ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 24,
	},
	logo: {
		width: 100,
		height: 100,
		marginBottom: 12,
	},
	title: {
		fontSize: 20,
		fontWeight: '700',
	},
	loader: {
		marginTop: 28,
	},
});
