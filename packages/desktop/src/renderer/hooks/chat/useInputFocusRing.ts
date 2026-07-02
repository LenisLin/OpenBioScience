import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';

export const useInputFocusRing = () => {
  const { theme } = useThemeContext();
  const isDarkTheme = theme === 'dark';

  return {
    activeBorderColor: isDarkTheme ? '#75643D' : '#EBD79D',
    inactiveBorderColor: isDarkTheme ? '#3a3a4a' : '#c9cacf',
    activeShadow: isDarkTheme
      ? '0 0 0 1px rgba(214, 168, 72, 0.12), 0 2px 18px rgba(214, 168, 72, 0.18)'
      : '0 0 0 1px rgba(223, 168, 45, 0.08), 0 2px 20px rgba(238, 194, 82, 0.22)',
  };
};
