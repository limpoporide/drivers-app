import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Theme, ThemeMode } from '../types';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    primary: '#8C6A00',
    background: '#F5F5F0',
    card: '#FCFBF7',
    text: '#000000',
    textSecondary: '#8E8E93',
    border: '#E4DED1',
    success: '#34C759',
    error: '#FF3B30',
    warning: '#FF9500',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: '#cea007',
    background: '#000000',
    card: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    border: '#38383A',
    success: '#32D74B',
    error: '#FF453A',
    warning: '#FF9F0A',
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(systemColorScheme || 'light');

  useEffect(() => {
    if (systemColorScheme) {
      setThemeMode(systemColorScheme);
    }
  }, [systemColorScheme]);

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;
  const isDark = themeMode === 'dark';

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
