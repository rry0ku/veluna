import { useState, useEffect, useCallback } from 'react';
import { loadLS, saveLS, hexToRgb, lightenColor } from '../utils';

export function useTheme() {
  const [theme, setThemeState] = useState<string>(() => loadLS('vg_theme', 'obsidian'));
  const [accentColor, setAccentColorState] = useState<string>(() => loadLS('vg_accentColor', '#e2ddd9'));
  const [customBgColor, setCustomBgColorState] = useState<string>(() => loadLS('vg_customBgColor', '#0c0b0b'));
  const [performanceMode, setPerformanceModeState] = useState<boolean>(() => loadLS('vg_perfMode', false));

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    saveLS('vg_theme', t);
  }, []);

  const setAccentColor = useCallback((c: string) => {
    setAccentColorState(c);
    saveLS('vg_accentColor', c);
  }, []);

  const setCustomBgColor = useCallback((c: string) => {
    setCustomBgColorState(c);
    saveLS('vg_customBgColor', c);
  }, []);

  const setPerformanceMode = useCallback((v: boolean) => {
    setPerformanceModeState(v);
    saveLS('vg_perfMode', v);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveLS('vg_theme', theme);
    if (theme === 'custom') {
      const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customBgColor);
      const bg0 = isValidHex ? customBgColor : '#0c0b0b';
      const bg0Rgb = hexToRgb(bg0);
      const bg1 = lightenColor(bg0, 2);
      const bg2 = lightenColor(bg0, 4);
      const bg2Rgb = hexToRgb(bg2);
      const bg3 = lightenColor(bg0, 6);
      const bg4 = lightenColor(bg0, 8);
      const bg5 = lightenColor(bg0, 10);
      const bdr = lightenColor(bg0, 5);
      const bdr2 = lightenColor(bg0, 8);
      const bdr3 = lightenColor(bg0, 12);

      document.documentElement.style.setProperty('--v-bg0', bg0);
      document.documentElement.style.setProperty('--v-bg0-rgb', bg0Rgb);
      document.documentElement.style.setProperty('--v-bg1', bg1);
      document.documentElement.style.setProperty('--v-bg2', bg2);
      document.documentElement.style.setProperty('--v-bg2-rgb', bg2Rgb);
      document.documentElement.style.setProperty('--v-bg3', bg3);
      document.documentElement.style.setProperty('--v-bg4', bg4);
      document.documentElement.style.setProperty('--v-bg5', bg5);
      document.documentElement.style.setProperty('--v-bdr', bdr);
      document.documentElement.style.setProperty('--v-bdr2', bdr2);
      document.documentElement.style.setProperty('--v-bdr3', bdr3);
      saveLS('vg_customBgColor', customBgColor);
    } else {
      document.documentElement.style.removeProperty('--v-bg0');
      document.documentElement.style.removeProperty('--v-bg0-rgb');
      document.documentElement.style.removeProperty('--v-bg1');
      document.documentElement.style.removeProperty('--v-bg2');
      document.documentElement.style.removeProperty('--v-bg2-rgb');
      document.documentElement.style.removeProperty('--v-bg3');
      document.documentElement.style.removeProperty('--v-bg4');
      document.documentElement.style.removeProperty('--v-bg5');
      document.documentElement.style.removeProperty('--v-bdr');
      document.documentElement.style.removeProperty('--v-bdr2');
      document.documentElement.style.removeProperty('--v-bdr3');
    }
  }, [theme, customBgColor]);

  useEffect(() => {
    document.documentElement.style.setProperty('--v-accent', accentColor);
    const rgb = hexToRgb(accentColor);
    document.documentElement.style.setProperty('--v-accent-rgb', rgb);
    saveLS('vg_accentColor', accentColor);
  }, [accentColor]);

  useEffect(() => {
    if (performanceMode) {
      document.documentElement.classList.add('v-perf-mode');
    } else {
      document.documentElement.classList.remove('v-perf-mode');
    }
  }, [performanceMode]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        document.documentElement.classList.add('v-app-hidden');
      } else {
        document.documentElement.classList.remove('v-app-hidden');
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return {
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    customBgColor,
    setCustomBgColor,
    performanceMode,
    setPerformanceMode,
  };
}
