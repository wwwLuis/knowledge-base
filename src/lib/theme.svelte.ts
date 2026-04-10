import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

let darkMode = $state(localStorage.getItem('theme') === 'dark');

export function isDark() {
	return darkMode;
}

export function toggleTheme() {
	darkMode = !darkMode;
	localStorage.setItem('theme', darkMode ? 'dark' : 'light');
	applyTheme();
}

export function applyTheme() {
	if (darkMode) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
	// Native Titlebar-Theme setzen
	try {
		const appWindow = getCurrentWebviewWindow();
		appWindow.setTheme(darkMode ? 'dark' : 'light');
	} catch (_) {
		// Fallback: ignore if not available
	}
}
